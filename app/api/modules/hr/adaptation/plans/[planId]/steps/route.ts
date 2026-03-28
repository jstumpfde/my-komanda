import { NextRequest } from "next/server"
import { eq, and, max } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans, adaptationSteps } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/adaptation/plans/[planId]/steps
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireCompany()
    const { planId } = await params

    // Verify plan ownership
    const [plan] = await db
      .select({ id: adaptationPlans.id })
      .from(adaptationPlans)
      .where(and(eq(adaptationPlans.id, planId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)

    if (!plan) return apiError("Plan not found", 404)

    const body = await req.json() as {
      dayNumber: number
      title: string
      type?: string
      content?: unknown
      channel?: string
      durationMin?: number
      isRequired?: boolean
    }

    if (body.dayNumber === undefined || !body.title) {
      return apiError("dayNumber и title обязательны", 400)
    }

    // Auto sortOrder = max + 1 for this day
    const [{ maxOrder }] = await db
      .select({ maxOrder: max(adaptationSteps.sortOrder) })
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, planId))

    const [step] = await db.insert(adaptationSteps).values({
      planId,
      dayNumber:   body.dayNumber,
      sortOrder:   (maxOrder ?? 0) + 1,
      title:       body.title,
      type:        body.type ?? "lesson",
      content:     body.content ?? null,
      channel:     body.channel ?? "auto",
      durationMin: body.durationMin ?? null,
      isRequired:  body.isRequired ?? true,
    }).returning()

    return apiSuccess(step, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
