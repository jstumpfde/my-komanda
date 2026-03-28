import { NextRequest } from "next/server"
import { eq, and, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans, adaptationSteps } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function getOwnedPlan(planId: string, tenantId: string) {
  const [plan] = await db
    .select()
    .from(adaptationPlans)
    .where(and(eq(adaptationPlans.id, planId), eq(adaptationPlans.tenantId, tenantId)))
    .limit(1)
  return plan ?? null
}

// GET /api/modules/hr/adaptation/plans/[planId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireCompany()
    const { planId } = await params

    const plan = await getOwnedPlan(planId, user.companyId)
    if (!plan) return apiError("Plan not found", 404)

    const steps = await db
      .select()
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, planId))
      .orderBy(asc(adaptationSteps.dayNumber), asc(adaptationSteps.sortOrder))

    return apiSuccess({ ...plan, steps })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// PUT /api/modules/hr/adaptation/plans/[planId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireCompany()
    const { planId } = await params

    const plan = await getOwnedPlan(planId, user.companyId)
    if (!plan) return apiError("Plan not found", 404)

    const body = await req.json() as Partial<{
      title: string
      description: string
      positionId: string
      durationDays: number
      planType: string
      isTemplate: boolean
      isActive: boolean
    }>

    const [updated] = await db
      .update(adaptationPlans)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(adaptationPlans.id, planId))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// DELETE /api/modules/hr/adaptation/plans/[planId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireCompany()
    const { planId } = await params

    const plan = await getOwnedPlan(planId, user.companyId)
    if (!plan) return apiError("Plan not found", 404)

    await db.delete(adaptationPlans).where(eq(adaptationPlans.id, planId))
    return apiSuccess({ deleted: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
