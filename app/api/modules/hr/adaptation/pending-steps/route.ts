import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationSteps, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/adaptation/pending-steps
export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({ step: adaptationSteps, planTitle: adaptationPlans.title })
      .from(adaptationSteps)
      .innerJoin(adaptationPlans, eq(adaptationSteps.planId, adaptationPlans.id))
      .where(and(
        eq(adaptationPlans.tenantId, user.companyId),
        eq(adaptationSteps.isApproved, false),
      ))

    return apiSuccess(rows.map(r => ({ ...r.step, planTitle: r.planTitle })))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
