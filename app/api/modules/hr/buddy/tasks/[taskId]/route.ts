import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, buddyTasks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PUT /api/modules/hr/buddy/tasks/[taskId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await requireCompany()
    const { taskId } = await params

    const [existing] = await db
      .select({ task: buddyTasks })
      .from(buddyTasks)
      .innerJoin(adaptationAssignments, eq(buddyTasks.assignmentId, adaptationAssignments.id))
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(and(eq(buddyTasks.id, taskId), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Задача не найдена", 404)

    const body = await req.json() as {
      status?: string
      note?: string
      title?: string
      description?: string
      dayNumber?: number
    }

    const now = new Date()
    const [updated] = await db
      .update(buddyTasks)
      .set({
        status:      body.status ?? existing.task.status,
        note:        body.note ?? existing.task.note,
        title:       body.title ?? existing.task.title,
        description: body.description ?? existing.task.description,
        dayNumber:   body.dayNumber ?? existing.task.dayNumber,
        completedAt: body.status === "done" ? now : existing.task.completedAt,
      })
      .where(eq(buddyTasks.id, taskId))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
