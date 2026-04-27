import { NextRequest } from "next/server"
import { eq, and, isNotNull, inArray, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface DemoBlockProgress {
  blockId: string
  status?: string
  answeredAt?: string
  timeSpent?: number
}

interface LessonShape {
  id?: string
  blocks?: { id?: string }[]
}

const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()

    const url = new URL(req.url)
    const vacancyId = url.searchParams.get("vacancy_id")

    const conditions = [
      eq(vacancies.companyId, user.companyId),
      isNotNull(candidates.demoProgressJson),
    ]
    if (vacancyId) {
      conditions.push(eq(candidates.vacancyId, vacancyId))
    }

    const rows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        vacancyId: candidates.vacancyId,
        vacancyTitle: vacancies.title,
        stage: candidates.stage,
        source: candidates.source,
        demoProgressJson: candidates.demoProgressJson,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(...conditions))

    if (rows.length === 0) return apiSuccess([])

    const vacancyIds = [...new Set(rows.map((r) => r.vacancyId))]

    const demoRows = await db
      .select({
        vacancyId: demos.vacancyId,
        lessonsJson: demos.lessonsJson,
        updatedAt: demos.updatedAt,
      })
      .from(demos)
      .where(inArray(demos.vacancyId, vacancyIds))
      .orderBy(desc(demos.updatedAt))

    const latestByVacancy = new Map<string, unknown>()
    for (const d of demoRows) {
      if (!latestByVacancy.has(d.vacancyId)) {
        latestByVacancy.set(d.vacancyId, d.lessonsJson)
      }
    }

    const totalsByVacancy = new Map<string, number>()
    for (const [vid, lessonsJson] of latestByVacancy.entries()) {
      const lessons = Array.isArray(lessonsJson) ? (lessonsJson as LessonShape[]) : []
      const total = lessons.reduce(
        (sum, l) => sum + (Array.isArray(l?.blocks) ? l.blocks.length : 0),
        0,
      )
      totalsByVacancy.set(vid, total)
    }

    const now = Date.now()

    const result = rows.map((r) => {
      const demoTotalBlocks = totalsByVacancy.get(r.vacancyId) ?? 0

      const progress = r.demoProgressJson as { blocks?: DemoBlockProgress[] } | null
      const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
      const completed = blocks.filter((b) => b.status === "completed")
      const demoCompletedBlocks = completed.length

      const progressPercent =
        demoTotalBlocks > 0
          ? Math.round((demoCompletedBlocks / demoTotalBlocks) * 100)
          : 0

      const stamps = completed
        .map((b) => (b.answeredAt ? new Date(b.answeredAt).getTime() : NaN))
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b)

      const firstAnswerAt = stamps.length > 0 ? new Date(stamps[0]).toISOString() : null
      const lastAnswerAt =
        stamps.length > 0 ? new Date(stamps[stamps.length - 1]).toISOString() : null

      const isActive = lastAnswerAt
        ? now - new Date(lastAnswerAt).getTime() <= ACTIVE_THRESHOLD_MS
        : false

      const durationSeconds =
        firstAnswerAt && lastAnswerAt
          ? Math.max(
              0,
              Math.round(
                (new Date(lastAnswerAt).getTime() - new Date(firstAnswerAt).getTime()) / 1000,
              ),
            )
          : null

      return {
        id: r.id,
        name: r.name,
        vacancyId: r.vacancyId,
        vacancyTitle: r.vacancyTitle,
        stage: r.stage ?? "new",
        source: r.source,
        demoTotalBlocks,
        demoCompletedBlocks,
        progressPercent,
        firstAnswerAt,
        lastAnswerAt,
        isActive,
        durationSeconds,
      }
    })

    return apiSuccess(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/modules/hr/candidates/progress", err)
    return apiError("Internal server error", 500)
  }
}
