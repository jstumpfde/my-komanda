import { eq, and, isNull, desc, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  getDemoProgressPercent,
  getDemoProgressGroup,
  type DemoProgressGroupCounts,
} from "@/lib/demo-progress-groups"
import type { DemoProgressData } from "@/components/hr/demo-progress-bar"

export interface ProgressWidgetItem {
  vacancyId: string
  title: string
  totalCandidates: number
  progressBuckets: DemoProgressGroupCounts
}

export async function GET() {
  try {
    const user = await requireCompany()
    const companyId = user.companyId

    const topVacancies = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
      })
      .from(vacancies)
      .where(and(
        eq(vacancies.companyId, companyId),
        eq(vacancies.status, "published"),
        isNull(vacancies.deletedAt),
      ))
      .orderBy(desc(vacancies.createdAt))
      .limit(5)

    if (topVacancies.length === 0) {
      return apiSuccess<ProgressWidgetItem[]>([])
    }

    const vacancyIds = topVacancies.map(v => v.id)

    const candidateRows = await db
      .select({
        id: candidates.id,
        vacancyId: candidates.vacancyId,
        demoProgressJson: candidates.demoProgressJson,
      })
      .from(candidates)
      .where(inArray(candidates.vacancyId, vacancyIds))

    const byVacancy = new Map<string, { total: number; buckets: DemoProgressGroupCounts; seen: Set<string> }>()
    for (const v of topVacancies) {
      byVacancy.set(v.id, {
        total: 0,
        buckets: { none: 0, low: 0, mid: 0, high: 0, done: 0 },
        seen: new Set<string>(),
      })
    }

    for (const c of candidateRows) {
      const entry = byVacancy.get(c.vacancyId)
      if (!entry) continue
      if (entry.seen.has(c.id)) continue
      entry.seen.add(c.id)
      entry.total += 1
      const pct = getDemoProgressPercent(c.demoProgressJson as DemoProgressData | null)
      const { groupKey } = getDemoProgressGroup(pct)
      entry.buckets[groupKey] += 1
    }

    const items: ProgressWidgetItem[] = topVacancies.map(v => {
      const entry = byVacancy.get(v.id)!
      return {
        vacancyId: v.id,
        title: v.title,
        totalCandidates: entry.total,
        progressBuckets: entry.buckets,
      }
    })

    return apiSuccess<ProgressWidgetItem[]>(items)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/dashboard/progress-widget]", err)
    return apiError("Internal server error", 500)
  }
}
