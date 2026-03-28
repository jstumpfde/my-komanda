import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationPlans } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const user = await requireCompany()

    const rows = await db
      .select({ a: adaptationAssignments })
      .from(adaptationAssignments)
      .innerJoin(adaptationPlans, eq(adaptationAssignments.planId, adaptationPlans.id))
      .where(eq(adaptationPlans.tenantId, user.companyId))

    const all = rows.map(r => r.a)
    const total = all.length

    const assigned   = total
    const started    = all.filter(a => (a.completionPct ?? 0) > 0).length
    const half       = all.filter(a => (a.completionPct ?? 0) >= 50).length
    const mostDone   = all.filter(a => (a.completionPct ?? 0) >= 80).length
    const completed  = all.filter(a => a.status === "completed").length

    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

    return apiSuccess([
      { label: "Назначено",       value: assigned,  pct: 100 },
      { label: "Начали",          value: started,   pct: pct(started)  },
      { label: "50% пройдено",    value: half,      pct: pct(half)     },
      { label: "80% пройдено",    value: mostDone,  pct: pct(mostDone) },
      { label: "Завершили",       value: completed, pct: pct(completed)},
    ])
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
