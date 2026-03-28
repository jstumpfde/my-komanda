import { NextRequest } from "next/server"
import { eq, and, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, stepCompletions } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/adaptation/assignments/[id]/complete-step
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Verify ownership
    const [row] = await db
      .select({ assignment: adaptationAssignments })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(and(eq(adaptationAssignments.id, id), eq(adaptationPlans.tenantId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Assignment not found", 404)

    const body = await req.json() as {
      stepId: string
      status?: string
      answer?: unknown
      score?: number
      feedback?: string
    }

    if (!body.stepId) return apiError("stepId обязателен", 400)

    const status = body.status ?? "completed"
    const now = new Date()

    // Upsert completion
    const [completion] = await db
      .insert(stepCompletions)
      .values({
        assignmentId: id,
        stepId:       body.stepId,
        status,
        completedAt:  status === "completed" ? now : null,
        viewedAt:     status === "viewed" || status === "completed" ? now : null,
        answer:       body.answer ?? null,
        score:        body.score ?? null,
        feedback:     body.feedback ?? null,
      })
      .onConflictDoUpdate({
        target: [stepCompletions.assignmentId, stepCompletions.stepId],
        set: {
          status,
          completedAt: status === "completed" ? now : undefined,
          viewedAt:    status === "viewed" || status === "completed" ? now : undefined,
          answer:      body.answer ?? null,
          score:       body.score ?? null,
          feedback:    body.feedback ?? null,
        },
      })
      .returning()

    // Recalculate completedSteps and completionPct
    const [{ done }] = await db
      .select({ done: count() })
      .from(stepCompletions)
      .where(and(eq(stepCompletions.assignmentId, id), eq(stepCompletions.status, "completed")))

    const totalSteps = row.assignment.totalSteps ?? 1
    const completionPct = Math.round((done / totalSteps) * 100)
    const completedAt = completionPct >= 100 ? now : null

    await db
      .update(adaptationAssignments)
      .set({ completedSteps: done, completionPct, completedAt, updatedAt: now })
      .where(eq(adaptationAssignments.id, id))

    return apiSuccess({ completion, completedSteps: done, completionPct })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
