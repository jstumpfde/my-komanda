import { eq, and, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans, stepCompletions } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    const rows = await db
      .select({ completedAt: stepCompletions.completedAt })
      .from(stepCompletions)
      .innerJoin(adaptationAssignments, eq(stepCompletions.assignmentId, adaptationAssignments.id))
      .innerJoin(adaptationPlans, and(
        eq(adaptationAssignments.planId, adaptationPlans.id),
        eq(adaptationPlans.tenantId, user.companyId),
      ))
      .where(and(
        eq(stepCompletions.status, "completed"),
        gte(stepCompletions.completedAt, thirtyDaysAgo),
      ))

    // Build date → count map for last 30 days
    const countMap = new Map<string, number>()
    for (const r of rows) {
      if (!r.completedAt) continue
      const d = new Date(r.completedAt).toISOString().slice(0, 10)
      countMap.set(d, (countMap.get(d) ?? 0) + 1)
    }

    // Fill all 30 days (even zeros)
    const result: { date: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      result.push({ date: key, count: countMap.get(key) ?? 0 })
    }

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
