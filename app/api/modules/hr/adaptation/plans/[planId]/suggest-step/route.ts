import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationPlans, adaptationSteps } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/adaptation/plans/[planId]/suggest-step
// Submit a step for moderation (isApproved=false)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireCompany()
    const { planId } = await params

    const [plan] = await db
      .select()
      .from(adaptationPlans)
      .where(and(eq(adaptationPlans.id, planId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)
    if (!plan) return apiError("План не найден", 404)

    const body = await req.json() as {
      title: string
      type?: string
      dayNumber: number
      content?: unknown
      durationMin?: number
      description?: string
    }
    if (!body.title) return apiError("title обязателен", 400)
    if (!body.dayNumber) return apiError("dayNumber обязателен", 400)

    const [step] = await db.insert(adaptationSteps).values({
      planId,
      title:         body.title,
      type:          body.type ?? "task",
      dayNumber:     body.dayNumber,
      content:       body.content ?? null,
      durationMin:   body.durationMin ?? null,
      sortOrder:     999,
      isRequired:    false,
      isApproved:    false,
      createdByRole: "buddy",
    }).returning()

    return apiSuccess(step)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
