import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, stepCompletions, adaptationSteps } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function getOwnedAssignment(id: string, tenantId: string) {
  const [row] = await db
    .select({ assignment: adaptationAssignments })
    .from(adaptationAssignments)
    .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
    .where(eq(adaptationAssignments.id, id))
    .limit(1)
  if (!row) return null
  const [plan] = await db
    .select({ tenantId: adaptationPlans.tenantId })
    .from(adaptationPlans)
    .where(eq(adaptationPlans.id, row.assignment.planId))
    .limit(1)
  if (plan?.tenantId !== tenantId) return null
  return row.assignment
}

// GET /api/modules/hr/adaptation/assignments/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const assignment = await getOwnedAssignment(id, user.companyId)
    if (!assignment) return apiError("Assignment not found", 404)

    const completions = await db
      .select()
      .from(stepCompletions)
      .where(eq(stepCompletions.assignmentId, id))

    const steps = await db
      .select()
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, assignment.planId))

    return apiSuccess({ ...assignment, steps, completions })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// PUT /api/modules/hr/adaptation/assignments/[id] — пауза/отмена
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const assignment = await getOwnedAssignment(id, user.companyId)
    if (!assignment) return apiError("Assignment not found", 404)

    const body = await req.json() as { status?: string; buddyId?: string; currentDay?: number }

    const [updated] = await db
      .update(adaptationAssignments)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(adaptationAssignments.id, id))
      .returning()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
