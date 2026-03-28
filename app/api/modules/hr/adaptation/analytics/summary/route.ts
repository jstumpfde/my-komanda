import { eq, and, count, avg, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // All assignments for this tenant
    const rows = await db
      .select({ a: adaptationAssignments })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(eq(adaptationPlans.tenantId, user.companyId))

    const all = rows.map(r => r.a)

    const active = all.filter(a => a.status === "active")
    const completed = all.filter(a => a.status === "completed")
    const completedRecently = completed.filter(
      a => a.completedAt && new Date(a.completedAt) >= thirtyDaysAgo
    )

    const avgPct = active.length > 0
      ? Math.round(active.reduce((s, a) => s + (a.completionPct ?? 0), 0) / active.length)
      : 0

    // Average days to completion
    const completedWithDays = completed.filter(a => a.startDate && a.completedAt)
    const avgDays = completedWithDays.length > 0
      ? Math.round(
          completedWithDays.reduce((s, a) => {
            const diff = (new Date(a.completedAt!).getTime() - new Date(a.startDate!).getTime()) / 86400000
            return s + diff
          }, 0) / completedWithDays.length
        )
      : null

    const completedLast30Pct = all.length > 0
      ? Math.round((completedRecently.length / all.length) * 100)
      : 0

    return apiSuccess({
      activeCount:        active.length,
      avgCompletionPct:   avgPct,
      avgDaysToComplete:  avgDays,
      completedLast30Pct,
      totalAssignments:   all.length,
      completedTotal:     completed.length,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
