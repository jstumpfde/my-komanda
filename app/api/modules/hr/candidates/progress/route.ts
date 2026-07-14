import { NextRequest } from "next/server"
import { eq, and, or, like, isNotNull, inArray, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  buildDemoBlockDefs,
  computeDemoBlockCompletion,
  getCompletedDemoBlockIndexes,
  computeUniformDemoOverride,
} from "@/lib/demo/block-completion"

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
        demoBlockScores: candidates.demoBlockScores,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(...conditions))

    if (rows.length === 0) return apiSuccess([])

    const vacancyIds = [...new Set(rows.map((r) => r.vacancyId))]

    // Грузим ВСЕ демо вакансии (kind='demo' и block:%): основное (kind='demo')
    // даёт базовый totalBlocks; все вместе — демо-блоки (Д1/Д2/Д3) для правила
    // «наивысший пройденный демо замещает» (см. lib/demo/block-completion.ts).
    const demoRows = await db
      .select({
        id: demos.id,
        title: demos.title,
        vacancyId: demos.vacancyId,
        lessonsJson: demos.lessonsJson,
        kind: demos.kind,
        sortOrder: demos.sortOrder,
        createdAt: demos.createdAt,
        updatedAt: demos.updatedAt,
      })
      .from(demos)
      .where(and(
        inArray(demos.vacancyId, vacancyIds),
        or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
      ))
      .orderBy(desc(demos.updatedAt))

    const latestByVacancy = new Map<string, unknown>()
    const rowsByVacancyForBlockDefs = new Map<string, typeof demoRows>()
    for (const d of demoRows) {
      // Базовый totalBlocks — по первому (свежайшему) kind='demo'.
      if (d.kind === "demo" && !latestByVacancy.has(d.vacancyId)) {
        latestByVacancy.set(d.vacancyId, d.lessonsJson)
      }
      const arr = rowsByVacancyForBlockDefs.get(d.vacancyId) ?? []
      arr.push(d)
      rowsByVacancyForBlockDefs.set(d.vacancyId, arr)
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

    // Демо-блоки каждой вакансии в каноническом порядке (sortOrder, createdAt) —
    // для правила «наивысший пройденный демо замещает».
    const demoBlockDefsByVacancy = new Map<string, ReturnType<typeof buildDemoBlockDefs>>()
    for (const [vid, vRows] of rowsByVacancyForBlockDefs.entries()) {
      const sorted = [...vRows].sort((a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        || (a.createdAt ? a.createdAt.getTime() : 0) - (b.createdAt ? b.createdAt.getTime() : 0)
      )
      demoBlockDefsByVacancy.set(vid, buildDemoBlockDefs(sorted))
    }

    const now = Date.now()

    const result = rows.map((r) => {
      const baseTotalBlocks = totalsByVacancy.get(r.vacancyId) ?? 0

      const progress = r.demoProgressJson as { blocks?: DemoBlockProgress[]; completedAt?: string | null } | null
      const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
      const completed = blocks.filter((b) => b.status === "completed")

      // Правило владельца (14.07, уточнение): «прошёл демо-часть → полное демо,
      // единый знаменатель = макс блоков среди демо вакансии» (компромисс для
      // текущих вакансий, см. computeUniformDemoOverride). null → базовый расчёт.
      const demoBlockDefs = demoBlockDefsByVacancy.get(r.vacancyId) ?? []
      const completedDemoBlockIndexes = getCompletedDemoBlockIndexes(
        computeDemoBlockCompletion(
          demoBlockDefs,
          r.demoBlockScores as Record<string, { score?: number }> | null,
          progress,
        ),
      )
      const uniformOverride = computeUniformDemoOverride(demoBlockDefs, completedDemoBlockIndexes)

      const demoTotalBlocks = uniformOverride ? uniformOverride.total : baseTotalBlocks
      const demoCompletedBlocks = uniformOverride ? uniformOverride.completed : completed.length
      // Демо считается завершённым если есть completedAt в progress
      // или специальный блок __complete__ в completed (см. demo/[token]/answer).
      // В обоих случаях фиксируем 100% независимо от формулы — статичные блоки
      // (text/image/video/info) тоже идут в total, но completed-записи генерят
      // только task/media, поэтому формула даёт ~19% даже на финале.
      const isDemoComplete = !!progress?.completedAt
        || blocks.some((b) => b.blockId === "__complete__")

      const progressPercent = isDemoComplete
        ? 100
        : demoTotalBlocks > 0
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
