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
    const body = await req.json() as {
      title?: string
      description?: string
      materials?: PlanMaterial[]
    }

    const title = (body.title || "").trim()
    if (!title) return apiError("'title' is required", 400)

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

    const [plan] = await db
      .insert(learningPlans)
      .values({
        tenantId: user.companyId,
        title,
        description: body.description?.trim() || null,
        materials,
        createdBy: user.id,
      })
      .returning()

    return apiSuccess(plan, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[learning-plans POST]", err)
    return apiError("Internal server error", 500)
  }
}
