import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, buddyTasks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/buddy/assignments/[id]/tasks
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Verify ownership (by tenant)
    const [row] = await db
      .select({ a: adaptationAssignments })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(and(eq(adaptationAssignments.id, id), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Не найдено", 404)

    const body = await req.json() as {
      title: string
      description?: string
      dayNumber?: number
      checklistItemId?: string
    }
    if (!body.title) return apiError("title обязателен", 400)

    const [task] = await db.insert(buddyTasks).values({
      assignmentId:    id,
      title:           body.title,
      description:     body.description ?? null,
      dayNumber:       body.dayNumber ?? null,
      checklistItemId: body.checklistItemId ?? null,
    }).returning()

    return apiSuccess(task)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
