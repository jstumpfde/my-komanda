import { NextRequest } from "next/server"
import { desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { learningAssignments, learningPlans, users } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { triggerOnboarding } from "@/lib/knowledge/onboarding"

// GET  — список сотрудников тенанта со статусом онбординга
// POST — назначить план (specific planId или автоподбор по должности)

interface EmployeeRow {
  id: string
  name: string
  email: string
  position: string | null
  role: string
  activeCount: number
  completedCount: number
  latestPlan: { title: string; deadline: string | null; status: string } | null
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()

    const roster = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        position: users.position,
        role: users.role,
      })
      .from(users)
      .where(eq(users.companyId, user.companyId))

    if (roster.length === 0) {
      return apiSuccess({ employees: [] })
    }

    const userIds = roster.map((r) => r.id)

    const assignmentRows = await db
      .select({
        id: learningAssignments.id,
        userId: learningAssignments.userId,
        planId: learningAssignments.planId,
        planTitle: learningPlans.title,
        status: learningAssignments.status,
        deadline: learningAssignments.deadline,
        assignedAt: learningAssignments.assignedAt,
      })
      .from(learningAssignments)
      .leftJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))
      .where(inArray(learningAssignments.userId, userIds))
      .orderBy(desc(learningAssignments.assignedAt))

    const byUser = new Map<string, typeof assignmentRows>()
    for (const a of assignmentRows) {
      const arr = byUser.get(a.userId) ?? []
      arr.push(a)
      byUser.set(a.userId, arr)
    }

    const employees: EmployeeRow[] = roster.map((u) => {
      const list = byUser.get(u.id) ?? []
      const active = list.filter(
        (a) => a.status === "assigned" || a.status === "in_progress",
      )
      const completed = list.filter((a) => a.status === "completed")
      const latest = list[0] ?? null
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        position: u.position,
        role: u.role,
        activeCount: active.length,
        completedCount: completed.length,
        latestPlan: latest && latest.planTitle
          ? {
              title: latest.planTitle,
              deadline: latest.deadline ? new Date(latest.deadline).toISOString() : null,
              status: latest.status,
            }
          : null,
      }
    })

    return apiSuccess({ employees })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/onboarding] GET", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string
      planId?: string
    }

    if (!body.userId) return apiError("'userId' is required", 400)

    // Убедимся что сотрудник из того же тенанта
    const [target] = await db
      .select({ id: users.id, companyId: users.companyId })
      .from(users)
      .where(eq(users.id, body.userId))
      .limit(1)

    if (!target || target.companyId !== user.companyId) {
      return apiError("Сотрудник не найден", 404)
    }

    const result = await triggerOnboarding(user.companyId, body.userId, {
      specificPlanId: body.planId,
    })

    if (result.assigned.length === 0) {
      return apiSuccess({
        ok: false,
        reason: result.skipped ?? "already_assigned",
        assigned: [],
      })
    }

    return apiSuccess({ ok: true, assigned: result.assigned })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/onboarding] POST", err)
    return apiError("Internal server error", 500)
  }
}

