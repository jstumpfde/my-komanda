import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationSteps, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function getOwnedStep(stepId: string, tenantId: string) {
  const [row] = await db
    .select({ step: adaptationSteps })
    .from(adaptationSteps)
    .innerJoin(adaptationPlans, eq(adaptationSteps.planId, adaptationPlans.id))
    .where(eq(adaptationSteps.id, stepId))
    .limit(1)
  if (!row) return null
  // Verify tenant
  const [plan] = await db
    .select({ tenantId: adaptationPlans.tenantId })
    .from(adaptationPlans)
    .where(eq(adaptationPlans.id, row.step.planId))
    .limit(1)
  if (plan?.tenantId !== tenantId) return null
  return row.step
}

// PUT /api/modules/hr/adaptation/steps/[stepId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    const user = await requireCompany()
    const { stepId } = await params

    const step = await getOwnedStep(stepId, user.companyId)
    if (!step) return apiError("Step not found", 404)

    const body = await req.json() as Partial<{
      dayNumber: number
      sortOrder: number
      title: string
      type: string
      content: unknown
      channel: string
      durationMin: number
      isRequired: boolean
    }>

    const [updated] = await db
      .update(adaptationSteps)
      .set(body)
      .where(eq(adaptationSteps.id, stepId))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// DELETE /api/modules/hr/adaptation/steps/[stepId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    const user = await requireCompany()
    const { stepId } = await params

    const step = await getOwnedStep(stepId, user.companyId)
    if (!step) return apiError("Step not found", 404)

    await db.delete(adaptationSteps).where(eq(adaptationSteps.id, stepId))
    return apiSuccess({ deleted: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
