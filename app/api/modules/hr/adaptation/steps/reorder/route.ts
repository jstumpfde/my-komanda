import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationSteps, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PUT /api/modules/hr/adaptation/steps/reorder
// Body: { planId, steps: [{ id, sortOrder, dayNumber? }] }
export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      planId: string
      steps: { id: string; sortOrder: number; dayNumber?: number }[]
    }

    if (!body.planId || !Array.isArray(body.steps)) {
      return apiError("planId и steps обязательны", 400)
    }

    // Verify plan ownership
    const [plan] = await db
      .select({ id: adaptationPlans.id })
      .from(adaptationPlans)
      .where(and(eq(adaptationPlans.id, body.planId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)

    if (!plan) return apiError("Plan not found", 404)

    // Update each step
    await Promise.all(
      body.steps.map(({ id, sortOrder, dayNumber }) =>
        db.update(adaptationSteps)
          .set({ sortOrder, ...(dayNumber !== undefined ? { dayNumber } : {}) })
          .where(and(eq(adaptationSteps.id, id), eq(adaptationSteps.planId, body.planId)))
      )
    )

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
