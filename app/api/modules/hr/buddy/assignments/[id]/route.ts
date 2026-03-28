import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, adaptationSteps, stepCompletions, buddyTasks, buddyMeetings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/buddy/assignments/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [row] = await db
      .select({ assignment: adaptationAssignments, planTitle: adaptationPlans.title })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(and(
        eq(adaptationAssignments.id, id),
        eq(adaptationPlans.tenantId, user.companyId),
      ))
      .limit(1)

    if (!row) return apiError("Назначение не найдено", 404)

    const steps = await db
      .select()
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, row.assignment.planId))

    const completions = await db
      .select()
      .from(stepCompletions)
      .where(eq(stepCompletions.assignmentId, id))

    const tasks = await db
      .select()
      .from(buddyTasks)
      .where(eq(buddyTasks.assignmentId, id))

    const meetings = await db
      .select()
      .from(buddyMeetings)
      .where(eq(buddyMeetings.assignmentId, id))

    return apiSuccess({
      ...row.assignment,
      planTitle: row.planTitle,
      steps,
      completions,
      tasks,
      meetings,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
