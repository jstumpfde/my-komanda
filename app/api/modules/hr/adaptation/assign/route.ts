import { NextRequest } from "next/server"
import { eq, and, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans, adaptationAssignments, adaptationSteps } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/adaptation/assign
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      planId: string
      employeeId?: string
      buddyId?: string
      startDate?: string
    }

    if (!body.planId) return apiError("planId обязателен", 400)

    // Verify plan ownership
    const [plan] = await db
      .select({ id: adaptationPlans.id })
      .from(adaptationPlans)
      .where(and(eq(adaptationPlans.id, body.planId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)

    if (!plan) return apiError("Plan not found", 404)

    // Count total steps
    const [{ total }] = await db
      .select({ total: count() })
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, body.planId))

    const [assignment] = await db.insert(adaptationAssignments).values({
      planId:     body.planId,
      employeeId: body.employeeId ?? null,
      buddyId:    body.buddyId ?? null,
      startDate:  body.startDate ? new Date(body.startDate) : new Date(),
      totalSteps: total,
    }).returning()

    return apiSuccess(assignment, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
