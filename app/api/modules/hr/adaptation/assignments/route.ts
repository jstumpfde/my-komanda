import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/adaptation/assignments
export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({
        assignment: adaptationAssignments,
        planTitle:  adaptationPlans.title,
        planType:   adaptationPlans.planType,
      })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(eq(adaptationPlans.tenantId, user.companyId))

    return apiSuccess(rows.map(r => ({ ...r.assignment, planTitle: r.planTitle, planType: r.planType })))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
