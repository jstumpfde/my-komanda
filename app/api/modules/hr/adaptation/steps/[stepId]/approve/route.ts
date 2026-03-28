import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationSteps, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PUT /api/modules/hr/adaptation/steps/[stepId]/approve
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    const user = await requireCompany()
    const { stepId } = await params

    const [row] = await db
      .select({ step: adaptationSteps })
      .from(adaptationSteps)
      .innerJoin(adaptationPlans, eq(adaptationSteps.planId, adaptationPlans.id))
      .where(and(eq(adaptationSteps.id, stepId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Шаг не найден", 404)

    const [updated] = await db
      .update(adaptationSteps)
      .set({ isApproved: true, approvedBy: user.id, approvedAt: new Date() })
      .where(eq(adaptationSteps.id, stepId))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
