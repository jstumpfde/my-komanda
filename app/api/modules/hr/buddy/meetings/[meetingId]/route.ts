import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, buddyMeetings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PUT /api/modules/hr/buddy/meetings/[meetingId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const user = await requireCompany()
    const { meetingId } = await params

    const [existing] = await db
      .select({ m: buddyMeetings })
      .from(buddyMeetings)
      .innerJoin(adaptationAssignments, eq(buddyMeetings.assignmentId, adaptationAssignments.id))
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(and(eq(buddyMeetings.id, meetingId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Встреча не найдена", 404)

    const body = await req.json() as {
      status?: string
      title?: string
      scheduledAt?: string
      notes?: string
      rating?: number
      feedback?: string
    }

    const now = new Date()
    const [updated] = await db
      .update(buddyMeetings)
      .set({
        status:      body.status ?? existing.m.status,
        title:       body.title ?? existing.m.title,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : existing.m.scheduledAt,
        notes:       body.notes ?? existing.m.notes,
        rating:      body.rating ?? existing.m.rating,
        feedback:    body.feedback ?? existing.m.feedback,
        completedAt: body.status === "completed" ? now : existing.m.completedAt,
      })
      .where(eq(buddyMeetings.id, meetingId))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
