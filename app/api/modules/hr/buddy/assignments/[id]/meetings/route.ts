import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, buddyMeetings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/buddy/assignments/[id]/meetings
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select()
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(and(eq(adaptationAssignments.id, id), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Не найдено", 404)

    const body = await req.json() as {
      title: string
      scheduledAt?: string
      notes?: string
    }
    if (!body.title) return apiError("title обязателен", 400)

    const [meeting] = await db.insert(buddyMeetings).values({
      assignmentId: id,
      title:        body.title,
      scheduledAt:  body.scheduledAt ? new Date(body.scheduledAt) : null,
      notes:        body.notes ?? null,
    }).returning()

    return apiSuccess(meeting)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
