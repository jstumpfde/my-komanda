import { eq, and, count, avg, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, adaptationSteps, stepCompletions } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()

    // Get all step completions for this tenant
    const rows = await db
      .select({
        stepId:      stepCompletions.stepId,
        status:      stepCompletions.status,
        score:       stepCompletions.score,
        stepTitle:   adaptationSteps.title,
        stepDay:     adaptationSteps.dayNumber,
        stepType:    adaptationSteps.type,
        planId:      adaptationSteps.planId,
        planTitle:   adaptationPlans.title,
      })
      .from(stepCompletions)
      .innerJoin(adaptationAssignments, eq(stepCompletions.assignmentId, adaptationAssignments.id))
      .innerJoin(adaptationSteps, eq(stepCompletions.stepId, adaptationSteps.id))
      .innerJoin(adaptationPlans, and(
        eq(adaptationSteps.planId, adaptationPlans.id),
        eq(adaptationPlans.tenantId, user.companyId),
      ))

    // Aggregate by stepId
    const stepMap = new Map<string, {
      stepId: string; title: string; day: number; type: string; planTitle: string
      total: number; completed: number; skipped: number; scores: number[]
    }>()

    for (const r of rows) {
      let s = stepMap.get(r.stepId)
      if (!s) {
        s = { stepId: r.stepId, title: r.stepTitle, day: r.stepDay, type: r.stepType,
              planTitle: r.planTitle, total: 0, completed: 0, skipped: 0, scores: [] }
        stepMap.set(r.stepId, s)
      }
      s.total++
      if (r.status === "completed") { s.completed++; if (r.score != null) s.scores.push(r.score) }
      if (r.status === "skipped") s.skipped++
    }

    const result = Array.from(stepMap.values())
      .map(s => ({
        stepId:       s.stepId,
        title:        s.title,
        dayNumber:    s.day,
        type:         s.type,
        planTitle:    s.planTitle,
        completionPct: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
        skipPct:       s.total > 0 ? Math.round((s.skipped / s.total) * 100) : 0,
        avgScore:      s.scores.length > 0
          ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length * 10) / 10
          : null,
        total: s.total,
      }))
      .sort((a, b) => a.completionPct - b.completionPct)
      .slice(0, 20)

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
