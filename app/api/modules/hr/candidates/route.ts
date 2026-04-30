import { NextRequest } from "next/server"
import { eq, ne, and, inArray, asc, desc, or, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateToken } from "@/lib/candidate-tokens"
import { generateCandidateShortId } from "@/lib/short-id"
import { deriveCandidateName } from "@/lib/candidate-name"

type SortKey = "favorite" | "aiScore" | "salary" | "responseDate" | "status" | "progress"

const STAGE_ORDER_SQL = sql`CASE ${candidates.stage}
  WHEN 'new' THEN 0
  WHEN 'demo' THEN 1
  WHEN 'scheduled' THEN 2
  WHEN 'interview' THEN 3
  WHEN 'interviewed' THEN 3
  WHEN 'decision' THEN 4
  WHEN 'offer' THEN 5
  WHEN 'final_decision' THEN 6
  WHEN 'hired' THEN 7
  WHEN 'talent_pool' THEN 8
  WHEN 'rejected' THEN 9
  ELSE 99
END`

function buildOrderBy(key: SortKey | null, dir: "asc" | "desc"): SQL[] {
  const wrap = (col: SQL | ReturnType<typeof asc>) => (dir === "asc" ? asc(col as SQL) : desc(col as SQL))
  switch (key) {
    case "favorite":     return [wrap(candidates.isFavorite), desc(candidates.createdAt)]
    case "aiScore":      return [wrap(candidates.aiScore),    desc(candidates.createdAt)]
    case "salary":       return [wrap(sql`COALESCE(${candidates.salaryMax}, ${candidates.salaryMin}, 0)`), desc(candidates.createdAt)]
    case "responseDate": return [wrap(candidates.createdAt)]
    case "status":       return [wrap(STAGE_ORDER_SQL), desc(candidates.createdAt)]
    default:             return [desc(candidates.createdAt)]
  }
}

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

// GET /api/modules/hr/candidates?vacancy_id=...&stage=new,demo,...
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const url = new URL(req.url)
    const vacancyId = url.searchParams.get("vacancy_id")
    const stageParam = url.searchParams.get("stage")

    // If no vacancy_id — return candidates for this company with vacancy title.
    // Опциональная пагинация по ?page=N&pageSize=M (default 50, max 100):
    //   • без ?page — возвращаем массив (старый формат, обратная совместимость
    //     с mini-table и любым кодом, который ждёт array).
    //   • с ?page — возвращаем { items, total, page, pageSize, hasMore }.
    if (!vacancyId) {
      const pageParam     = url.searchParams.get("page")
      const pageSizeParam = url.searchParams.get("pageSize")
      const paginated     = pageParam !== null
      const page          = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
      const pageSize      = Math.min(100, Math.max(1, Number.parseInt(pageSizeParam ?? "50", 10) || 50))
      const offset        = (page - 1) * pageSize

      const whereExpr = and(
        eq(vacancies.companyId, user.companyId),
        or(isNull(candidates.source), ne(candidates.source, "preview")),
      )

      let total = 0
      if (paginated) {
        const [{ cnt }] = await db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(candidates)
          .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
          .where(whereExpr)
        total = cnt ?? 0
      }

      // demoProgressJson и anketaAnswers нужны server-side для вычисления
      // progressPercent и displayName — без них теряем колонку «Прогресс»
      // и фолбэк имени из анкеты. Из ответа клиенту они вырезаются (см. ниже).
      const baseQuery = db
        .select({
          id: candidates.id,
          name: candidates.name,
          phone: candidates.phone,
          email: candidates.email,
          city: candidates.city,
          source: candidates.source,
          stage: candidates.stage,
          score: candidates.score,
          aiScore: candidates.aiScore,
          vacancyId: candidates.vacancyId,
          vacancyTitle: vacancies.title,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          demoProgressJson: candidates.demoProgressJson,
          anketaAnswers: candidates.anketaAnswers,
          isFavorite: candidates.isFavorite,
          referredByShortId: candidates.referredByShortId,
          hhCandidateName: hhResponses.candidateName,
        })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .leftJoin(hhResponses, and(
          eq(hhResponses.localCandidateId, candidates.id),
          eq(hhResponses.companyId, user.companyId),
        ))
        .where(whereExpr)
        .orderBy(desc(candidates.createdAt))

      const rows = paginated
        ? await baseQuery.limit(pageSize).offset(offset)
        : await baseQuery

      const vacancyIds = [...new Set(rows.map((r) => r.vacancyId))]

      const totalsByVacancy = new Map<string, number>()
      if (vacancyIds.length > 0) {
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
        for (const [vid, lessonsJson] of latestByVacancy.entries()) {
          const lessons = Array.isArray(lessonsJson) ? (lessonsJson as LessonShape[]) : []
          const total = lessons.reduce(
            (sum, l) => sum + (Array.isArray(l?.blocks) ? l.blocks.length : 0),
            0,
          )
          totalsByVacancy.set(vid, total)
        }
      }

      const now = Date.now()

      const enriched = rows.map((r) => {
        const demoTotalBlocks = totalsByVacancy.get(r.vacancyId) ?? 0
        const progress = r.demoProgressJson as { blocks?: DemoBlockProgress[]; completedAt?: string | null } | null
        const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
        const completed = blocks.filter((b) => b.status === "completed")
        const demoCompletedBlocks = completed.length
        // Если демо завершено (completedAt или блок __complete__) — 100%.
        // Иначе формула даёт ~19% даже на финале: completed-записи генерят
        // только task/media, а total включает и статичные блоки.
        const isDemoComplete = !!progress?.completedAt
          || blocks.some((b) => b.blockId === "__complete__")
        const progressPercent = isDemoComplete
          ? 100
          : demoTotalBlocks > 0
            ? Math.round((demoCompletedBlocks / demoTotalBlocks) * 100)
            : null

        const stamps = completed
          .map((b) => (b.answeredAt ? new Date(b.answeredAt).getTime() : NaN))
          .filter((t) => !Number.isNaN(t))
          .sort((a, b) => a - b)
        const lastAnswerAt =
          stamps.length > 0 ? new Date(stamps[stamps.length - 1]).toISOString() : null
        const isActive = lastAnswerAt
          ? now - new Date(lastAnswerAt).getTime() <= ACTIVE_THRESHOLD_MS
          : false

        // Имя: fallback на anketa_answers, затем на hh_responses.candidate_name
        // если name пустой/«Новый кандидат»
        const displayName = deriveCandidateName(r.name, r.anketaAnswers, r.hhCandidateName)

        // Strip demoProgressJson + anketaAnswers + hhCandidateName — не нужны клиенту
        const { demoProgressJson: _drop1, anketaAnswers: _drop2, hhCandidateName: _drop3, ...rest } = r
        void _drop1; void _drop2; void _drop3
        return {
          ...rest,
          name: displayName,
          demoTotalBlocks,
          demoCompletedBlocks,
          progressPercent,
          isActive,
        }
      })

      if (paginated) {
        const hasMore = offset + enriched.length < total
        return apiSuccess({ items: enriched, total, page, pageSize, hasMore })
      }

      return apiSuccess(enriched)
    }

    // Verify ownership
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Vacancy not found", 404)

    const stages = stageParam ? stageParam.split(",").filter(Boolean) : []

    const sortRaw = url.searchParams.get("sort") as SortKey | null
    const orderRaw = url.searchParams.get("order")
    const dir: "asc" | "desc" = orderRaw === "asc" ? "asc" : "desc"
    const orderBy = buildOrderBy(sortRaw, dir)

    const notPreview = or(isNull(candidates.source), ne(candidates.source, "preview"))
    const where = stages.length > 0
      ? and(eq(candidates.vacancyId, vacancyId), inArray(candidates.stage, stages), notPreview)
      : and(eq(candidates.vacancyId, vacancyId), notPreview)

    let rows = await db.select().from(candidates).where(where).orderBy(...orderBy)

    if (sortRaw === "progress") {
      const mul = dir === "asc" ? 1 : -1
      const progressOf = (c: typeof rows[number]): number => {
        const dp = c.demoProgressJson as { blocks?: { status?: string }[]; totalBlocks?: number } | null
        if (!dp || !Array.isArray(dp.blocks)) return -1
        const total = dp.totalBlocks ?? dp.blocks.length
        if (!total) return -1
        const completed = dp.blocks.filter(b => b?.status === "completed").length
        return Math.round((completed / total) * 100)
      }
      rows = [...rows].sort((a, b) => mul * (progressOf(a) - progressOf(b)))
    }

    // Подтягиваем candidate_name из hh_responses как третий fallback к
    // deriveCandidateName (см. lib/candidate-name.ts).
    const candidateIds = rows.map(r => r.id)
    const hhNameByCandidateId = new Map<string, string>()
    if (candidateIds.length > 0) {
      const hhRows = await db
        .select({ candidateId: hhResponses.localCandidateId, candidateName: hhResponses.candidateName })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, user.companyId),
          inArray(hhResponses.localCandidateId, candidateIds),
        ))
      for (const h of hhRows) {
        if (h.candidateId && h.candidateName && !hhNameByCandidateId.has(h.candidateId)) {
          hhNameByCandidateId.set(h.candidateId, h.candidateName)
        }
      }
    }

    // Имя: fallback на anketa_answers, затем на hh_responses.candidate_name
    const withDisplayName = rows.map((r) => ({
      ...r,
      name: deriveCandidateName(r.name, r.anketaAnswers, hhNameByCandidateId.get(r.id) ?? null),
    }))

    return apiSuccess(withDisplayName)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/candidates — добавить кандидата вручную
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      vacancyId: string
      name: string
      phone?: string
      email?: string
      city?: string
      source?: string
    }

    if (!body.vacancyId || !body.name) return apiError("vacancyId и name обязательны", 400)

    // Verify ownership
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Vacancy not found", 404)

    const created = await db.transaction(async (tx) => {
      const short = await generateCandidateShortId(tx, body.vacancyId)
      const [row] = await tx.insert(candidates).values({
        vacancyId: body.vacancyId,
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        city: body.city ?? null,
        source: body.source ?? "manual",
        stage: "new",
        token: generateCandidateToken(),
        shortId: short?.shortId ?? null,
        sequenceNumber: short?.sequenceNumber ?? null,
      }).returning()
      return row
    })

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
