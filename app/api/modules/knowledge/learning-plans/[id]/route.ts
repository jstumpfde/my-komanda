import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { learningPlans, learningAssignments, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface PlanMaterial {
  materialId: string
  materialType: "demo" | "article"
  order: number
  required: boolean
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(and(eq(learningPlans.id, id), eq(learningPlans.tenantId, user.companyId)))
      .limit(1)

    if (!plan) return apiError("Plan not found", 404)

    const assignments = await db
      .select({
        id: learningAssignments.id,
        userId: learningAssignments.userId,
        userName: users.name,
        userEmail: users.email,
        status: learningAssignments.status,
        progress: learningAssignments.progress,
        assignedAt: learningAssignments.assignedAt,
        deadline: learningAssignments.deadline,
        completedAt: learningAssignments.completedAt,
      })
      .from(learningAssignments)
      .leftJoin(users, eq(users.id, learningAssignments.userId))
      .where(
        and(
          eq(learningAssignments.planId, id),
          eq(learningAssignments.tenantId, user.companyId),
        ),
      )

    return apiSuccess({ plan, assignments })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[learning-plans/:id GET]", err)
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json() as {
      title?: string
      description?: string
      materials?: PlanMaterial[]
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim()
    if (typeof body.description === "string") updates.description = body.description.trim() || null
    if (Array.isArray(body.materials)) {
      updates.materials = body.materials
        .filter((m) => m && typeof m.materialId === "string")
        .map((m, i) => ({
          materialId: m.materialId,
          materialType: m.materialType === "article" ? "article" : "demo",
          order: typeof m.order === "number" ? m.order : i,
          required: m.required !== false,
        }))
    }

    const [plan] = await db
      .update(learningPlans)
      .set(updates)
      .where(and(eq(learningPlans.id, id), eq(learningPlans.tenantId, user.companyId)))
      .returning()

    if (!plan) return apiError("Plan not found", 404)
    return apiSuccess(plan)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[learning-plans/:id PATCH]", err)
    return apiError("Internal server error", 500)
  }
}
