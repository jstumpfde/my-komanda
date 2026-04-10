import { NextRequest } from "next/server"
import { eq, and, desc, sql, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { learningPlans, learningAssignments } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface PlanMaterial {
  materialId: string
  materialType: "demo" | "article"
  order: number
  required: boolean
}

export async function GET() {
  try {
    const user = await requireCompany()

    const plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.tenantId, user.companyId))
      .orderBy(desc(learningPlans.createdAt))

    if (plans.length === 0) return apiSuccess({ plans: [] })

    const planIds = plans.map((p) => p.id)
    const stats = await db
      .select({
        planId: learningAssignments.planId,
        status: learningAssignments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(learningAssignments)
      .where(
        and(
          eq(learningAssignments.tenantId, user.companyId),
          inArray(learningAssignments.planId, planIds),
        ),
      )
      .groupBy(learningAssignments.planId, learningAssignments.status)

    const byPlan = new Map<string, { assigned: number; completed: number }>()
    for (const row of stats) {
      const s = byPlan.get(row.planId) ?? { assigned: 0, completed: 0 }
      s.assigned += row.count
      if (row.status === "completed") s.completed += row.count
      byPlan.set(row.planId, s)
    }

    const withStats = plans.map((p) => {
      const s = byPlan.get(p.id) ?? { assigned: 0, completed: 0 }
      const materials = Array.isArray(p.materials) ? (p.materials as PlanMaterial[]) : []
      return {
        ...p,
        materialsCount: materials.length,
        assignedCount: s.assigned,
        completedCount: s.completed,
      }
    })

    return apiSuccess({ plans: withStats })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[learning-plans GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()

    let body: {
      title?: string
      description?: string
      materials?: PlanMaterial[]
    }
    try {
      body = await req.json()
    } catch (parseErr) {
      console.error("[learning-plans POST] invalid JSON", parseErr)
      return apiError("Невалидный JSON в теле запроса", 400)
    }

    const title = (body.title || "").trim()
    if (!title) return apiError("Название обязательно", 400)

    // Empty materials is fine — allow creating a plan draft without them.
    const materials = Array.isArray(body.materials)
      ? body.materials
          .filter((m) => m && typeof m.materialId === "string")
          .map((m, i) => ({
            materialId: m.materialId,
            materialType: m.materialType === "article" ? "article" : "demo",
            order: typeof m.order === "number" ? m.order : i,
            required: m.required !== false,
          }))
      : []

    let plan
    try {
      ;[plan] = await db
        .insert(learningPlans)
        .values({
          tenantId: user.companyId,
          title,
          description: body.description?.trim() || null,
          materials,
          createdBy: user.id,
        })
        .returning()
    } catch (dbErr) {
      console.error("[learning-plans POST] db insert failed", dbErr)
      const msg = dbErr instanceof Error ? dbErr.message : "Ошибка БД"
      return apiError(`Ошибка при создании плана: ${msg}`, 500)
    }

    if (!plan) {
      return apiError("План не был создан (пустой ответ БД)", 500)
    }

    return apiSuccess({
      data: {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        materials: plan.materials,
        createdAt: plan.createdAt,
      },
    }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[learning-plans POST] unexpected", err)
    const msg = err instanceof Error ? err.message : "Internal server error"
    return apiError(msg, 500)
  }
}
