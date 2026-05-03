/**
 * GET /api/modules/hr/dashboard/progress-widget
 *
 * Возвращает топ-5 активных вакансий компании (status = 'published', не удалённых)
 * с общим числом кандидатов и распределением по группам прогресса демо.
 *
 * Бакеты прогресса: { 0, 1to30, 30to70, 70to99, 100 } — где 0 = "не начато"
 * (включает кандидатов без demo_progress_json).
 *
 * Ответ:
 *   Array<{
 *     vacancyId: string
 *     title: string
 *     totalCandidates: number
 *     progressBuckets: { 0: number; 1to30: number; 30to70: number; 70to99: number; 100: number }
 *   }>
 */

import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface DemoBlockProgress {
  blockId?: string
  status?: string
}

interface DemoProgressShape {
  blocks?: DemoBlockProgress[]
  totalBlocks?: number
  completedAt?: string | null
}

interface LessonShape {
  id?: string
  blocks?: { id?: string }[]
}

export type ProgressBucketKey = "0" | "1to30" | "30to70" | "70to99" | "100"

export interface ProgressBuckets {
  "0": number
  "1to30": number
  "30to70": number
  "70to99": number
  "100": number
}

export interface ProgressWidgetItem {
  vacancyId: string
  title: string
  totalCandidates: number
  progressBuckets: ProgressBuckets
}

const TOP_LIMIT = 5

function emptyBuckets(): ProgressBuckets {
  return { "0": 0, "1to30": 0, "30to70": 0, "70to99": 0, "100": 0 }
}

function bucketForPercent(percent: number): ProgressBucketKey {
  if (percent <= 0) return "0"
  if (percent < 30) return "1to30"
  if (percent < 70) return "30to70"
  if (percent < 100) return "70to99"
  return "100"
}

export async function GET() {
  try {
    const user = await requireCompany()
    const companyId = user.companyId

    // 1) Топ-5 активных вакансий по числу откликов.
    const vacancyRows = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        candidateCount: sql<number>`count(${candidates.id})::int`,
      })
      .from(vacancies)
      .leftJoin(candidates, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        eq(vacancies.companyId, companyId),
        eq(vacancies.status, "published"),
        isNull(vacancies.deletedAt),
      ))
      .groupBy(vacancies.id)
      .orderBy(desc(sql`count(${candidates.id})`))
      .limit(TOP_LIMIT)

    if (vacancyRows.length === 0) {
      return apiSuccess<ProgressWidgetItem[]>([])
    }

    const vacancyIds = vacancyRows.map((v) => v.id)

    // 2) Кандидаты этих вакансий с demoProgressJson.
    const candidateRows = await db
      .select({
        vacancyId: candidates.vacancyId,
        demoProgressJson: candidates.demoProgressJson,
      })
      .from(candidates)
      .where(inArray(candidates.vacancyId, vacancyIds))

    // 3) Последний demo каждой вакансии — для подсчёта totalBlocks.
    const demoRows = await db
      .select({
        vacancyId: demos.vacancyId,
        lessonsJson: demos.lessonsJson,
        updatedAt: demos.updatedAt,
      })
      .from(demos)
      .where(inArray(demos.vacancyId, vacancyIds))
      .orderBy(desc(demos.updatedAt))

    const totalsByVacancy = new Map<string, number>()
    for (const d of demoRows) {
      if (totalsByVacancy.has(d.vacancyId)) continue
      const lessons = Array.isArray(d.lessonsJson) ? (d.lessonsJson as LessonShape[]) : []
      const total = lessons.reduce(
        (sum, l) => sum + (Array.isArray(l?.blocks) ? l.blocks.length : 0),
        0,
      )
      totalsByVacancy.set(d.vacancyId, total)
    }

    const bucketsByVacancy = new Map<string, ProgressBuckets>()
    for (const id of vacancyIds) bucketsByVacancy.set(id, emptyBuckets())

    for (const row of candidateRows) {
      const buckets = bucketsByVacancy.get(row.vacancyId)
      if (!buckets) continue

      const progress = row.demoProgressJson as DemoProgressShape | null
      if (!progress || !Array.isArray(progress.blocks)) {
        buckets["0"] += 1
        continue
      }

      const blocks = progress.blocks
      const completed = blocks.filter((b) => b?.status === "completed").length
      const isDemoComplete = !!progress.completedAt
        || blocks.some((b) => b?.blockId === "__complete__")

      const total = progress.totalBlocks ?? totalsByVacancy.get(row.vacancyId) ?? blocks.length
      const percent = isDemoComplete
        ? 100
        : total > 0
          ? Math.round((completed / total) * 100)
          : 0

      buckets[bucketForPercent(percent)] += 1
    }

    const result: ProgressWidgetItem[] = vacancyRows.map((v) => ({
      vacancyId: v.id,
      title: v.title,
      totalCandidates: v.candidateCount ?? 0,
      progressBuckets: bucketsByVacancy.get(v.id) ?? emptyBuckets(),
    }))

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET /api/modules/hr/dashboard/progress-widget]", err)
    return apiError("Internal server error", 500)
  }
}
