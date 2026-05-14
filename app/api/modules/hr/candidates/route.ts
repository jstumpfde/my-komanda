import { NextRequest } from "next/server"
import { eq, ne, and, inArray, asc, desc, or, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateToken } from "@/lib/candidate-tokens"
import { generateCandidateShortId } from "@/lib/short-id"
import { deriveCandidateName } from "@/lib/candidate-name"

type SortKey =
  | "favorite"
  | "aiScore"
  | "salary"
  | "responseDate"
  | "status"
  | "progress"
  | "createdAt"
  | "name"
  | "stage"

const ALLOWED_SORT_KEYS: ReadonlySet<SortKey> = new Set<SortKey>([
  "favorite", "aiScore", "salary", "responseDate", "status", "progress",
  "createdAt", "name", "stage",
])

const ALLOWED_PAGE_SIZES: ReadonlySet<number> = new Set<number>([20, 50, 100])

// Вытаскивает birthDate из anketa_answers (object-form ИЛИ массив записей
// с {key|blockId, answer}). Используется как fallback, когда колонка
// candidates.birth_date пустая — кандидат заполнял дату через анкету,
// но колонка не была сохранена.
function extractBirthDateFromAnketa(anketa: unknown): string | null {
  if (!anketa || typeof anketa !== "object") return null
  const isIso = (s: unknown): s is string =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s)
  if (Array.isArray(anketa)) {
    for (const e of anketa as Record<string, unknown>[]) {
      if (!e || typeof e !== "object") continue
      const key = String(e.blockId ?? e.key ?? e.questionId ?? e.id ?? "")
      if (key === "birthDate" || key === "birth_date" || key === "birthday") {
        const ans = e.answer
        if (isIso(ans)) return ans.slice(0, 10)
      }
    }
    return null
  }
  const obj = anketa as Record<string, unknown>
  for (const k of ["birthDate", "birth_date", "birthday"] as const) {
    const v = obj[k]
    if (isIso(v)) return v.slice(0, 10)
  }
  return null
}

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

// Абсолютное число пройденных блоков демо (status='completed', исключая
// служебный __complete__-маркер). totalBlocks одинаков для всех кандидатов
// одной вакансии, поэтому порядок по этой метрике совпадает с порядком по
// progressPercent в рамках одной вакансии. Точный процент клиент видит из
// progressPercent в маппинге ниже.
const DEMO_PROGRESS_COUNT_SQL = sql`(
  SELECT count(*) FROM jsonb_array_elements(${candidates.demoProgressJson}->'blocks') b
  WHERE b->>'status' = 'completed'
    AND b->>'blockId' <> '__complete__'
)`

function buildOrderBy(key: SortKey | null, dir: "asc" | "desc"): SQL[] {
  const wrap = (col: Parameters<typeof asc>[0]) => (dir === "asc" ? asc(col) : desc(col))
  // id DESC — secondary tiebreaker для стабильной пагинации при равных значениях
  // primary-ключа (например, у двух кандидатов одинаковый прогресс).
  const tiebreak = desc(candidates.id)
  switch (key) {
    case "favorite":     return [wrap(candidates.isFavorite), desc(candidates.createdAt), tiebreak]
    case "aiScore":      return [wrap(candidates.aiScore),    desc(candidates.createdAt), tiebreak]
    case "salary":       return [wrap(sql`COALESCE(${candidates.salaryMax}, ${candidates.salaryMin}, 0)`), desc(candidates.createdAt), tiebreak]
    case "name":         return [wrap(candidates.name), desc(candidates.createdAt), tiebreak]
    case "progress":     return [
      dir === "asc"
        ? sql`${DEMO_PROGRESS_COUNT_SQL} ASC NULLS LAST`
        : sql`${DEMO_PROGRESS_COUNT_SQL} DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "responseDate":
    case "createdAt":    return [wrap(candidates.createdAt), tiebreak]
    case "status":
    case "stage":        return [wrap(STAGE_ORDER_SQL), desc(candidates.createdAt), tiebreak]
    default:             return [desc(candidates.createdAt), tiebreak]
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
    // Принимаем оба варианта имени параметра: vacancyId (новый, camelCase —
    // его шлёт usePaginatedCandidates) и vacancy_id (legacy — useCandidates).
    // Без fallback'a новый клиент проваливался в ветку «без vacancyId» ниже
    // и получал total по всей компании через innerJoin(vacancies).
    const vacancyId = url.searchParams.get("vacancyId") ?? url.searchParams.get("vacancy_id")
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
      // Map: vacancyId → Map<blockId, lessonIndex> для страничного прогресса
      const blockToLessonByVacancy = new Map<string, Map<string, number>>()
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
          // Total = lessons.length + 2 (страницы Анкеты и Спасибо в конце)
          totalsByVacancy.set(vid, lessons.length + 2)
          // Map: blockId → lessonIndex
          const blockMap = new Map<string, number>()
          lessons.forEach((lesson, lessonIdx) => {
            const lessonBlocks = Array.isArray(lesson?.blocks) ? lesson.blocks : []
            for (const b of lessonBlocks) {
              const bid = (b as { id?: string })?.id
              if (typeof bid === "string") blockMap.set(bid, lessonIdx)
            }
          })
          blockToLessonByVacancy.set(vid, blockMap)
        }
      }

      const now = Date.now()

      const enriched = rows.map((r) => {
        const demoTotalBlocks = totalsByVacancy.get(r.vacancyId) ?? 0
        const progress = r.demoProgressJson as { blocks?: DemoBlockProgress[]; completedAt?: string | null } | null
        const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
        // Считаем СТРАНИЦЫ (уроки) пройденными, а не блоки.
        // Страница засчитана если есть хотя бы 1 пройденный blockId этой страницы.
        // Анкета (__anketa__) и Спасибо (__thanks__) — отдельные страницы +2.
        const blockMap = blockToLessonByVacancy.get(r.vacancyId)
        const completedLessons = new Set<number>()
        const completedByBlockId = new Map<string, DemoBlockProgress>()
        let hasAnketa = false
        let hasThanks = false
        for (const b of blocks) {
          if (b.status !== "completed") continue
          if (!b.blockId) continue
          if (b.blockId === "__anketa__") { hasAnketa = true; continue }
          if (b.blockId === "__thanks__") { hasThanks = true; continue }
          if (b.blockId === "__complete__") continue
          completedByBlockId.set(b.blockId, b)
          const lessonIdx = blockMap?.get(b.blockId)
          if (typeof lessonIdx === "number") completedLessons.add(lessonIdx)
        }
        const completed = Array.from(completedByBlockId.values())
        // Итого: уроки + анкета + спасибо
        const completedPages = completedLessons.size + (hasAnketa ? 1 : 0) + (hasThanks ? 1 : 0)
        const demoCompletedBlocks = demoTotalBlocks > 0
          ? Math.min(completedPages, demoTotalBlocks)
          : completedPages
        // Считаем процент честно по страницам (completed/total).
        // Раньше при наличии __complete__ маркера выставляли 100%, но это давало
        // ложные срабатывания: 4 страницы из 17 = 100% если кандидат когда-то
        // нажал "Завершить", даже если реально прошёл мало.
        const progressPercent = demoTotalBlocks > 0
          ? Math.min(100, Math.round((demoCompletedBlocks / demoTotalBlocks) * 100))
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

    // Пагинация — opt-in: включается если задан page ИЛИ pageSize.
    // sortBy=progress теперь считается в SQL (см. DEMO_PROGRESS_COUNT_SQL),
    // count(*) не ломает. Фильтр demoProgress остаётся post-fetch — его
    // применение в пагинированном режиме всё ещё игнорируется (см. ниже).
    const pageParam     = url.searchParams.get("page")
    const pageSizeParam = url.searchParams.get("pageSize")
    const paginated     = pageParam !== null || pageSizeParam !== null

    const sizeRaw  = Number.parseInt(pageSizeParam ?? "20", 10) || 20
    const pageSize = ALLOWED_PAGE_SIZES.has(sizeRaw) ? sizeRaw : 20
    const page     = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
    const offset   = (page - 1) * pageSize

    // sortBy — новый параметр (ТЗ), sort — legacy fallback.
    const sortByRaw = url.searchParams.get("sortBy") ?? url.searchParams.get("sort")
    const sortKey: SortKey | null =
      sortByRaw && ALLOWED_SORT_KEYS.has(sortByRaw as SortKey) ? (sortByRaw as SortKey) : null

    const orderRaw = url.searchParams.get("order")
    const dir: "asc" | "desc" = orderRaw === "asc" ? "asc" : "desc"
    const orderBy = buildOrderBy(sortKey, dir)

    const notPreview = or(isNull(candidates.source), ne(candidates.source, "preview"))

    // HR-020: серверные фильтры (опциональные query-параметры).
    // Если параметр не задан — фильтр не применяется. Если у кандидата
    // соответствующее поле NULL — он включается (фильтр «не блокирует»).
    const filterConds: SQL[] = []

    const minAge = url.searchParams.get("minAge")
    const maxAge = url.searchParams.get("maxAge")
    // «Эффективная» дата рождения — колонка birth_date или вытащенная из
    // anketa_answers (object-form: {birthDate|birth_date|birthday: "YYYY-MM-DD"}).
    // Кандидаты, у которых дату вообще не из чего вычислить, отфильтровываются:
    // пользователь явно сузил диапазон возраста — он ожидает что список
    // сожмётся, а не покажет всех «на всякий случай».
    const effectiveBirthDate = sql`COALESCE(
      ${candidates.birthDate},
      CASE WHEN ${candidates.anketaAnswers}->>'birthDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           THEN (${candidates.anketaAnswers}->>'birthDate')::date END,
      CASE WHEN ${candidates.anketaAnswers}->>'birth_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           THEN (${candidates.anketaAnswers}->>'birth_date')::date END,
      CASE WHEN ${candidates.anketaAnswers}->>'birthday' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           THEN (${candidates.anketaAnswers}->>'birthday')::date END
    )`
    if (minAge && Number.isFinite(Number(minAge))) {
      // age >= minAge → birth_date <= today - minAge years
      const yrs = Math.max(0, Math.floor(Number(minAge)))
      filterConds.push(sql`(${effectiveBirthDate} IS NOT NULL AND ${effectiveBirthDate} <= (CURRENT_DATE - make_interval(years => ${yrs})))`)
    }
    if (maxAge && Number.isFinite(Number(maxAge))) {
      const yrs = Math.max(0, Math.floor(Number(maxAge)) + 1)
      filterConds.push(sql`(${effectiveBirthDate} IS NOT NULL AND ${effectiveBirthDate} >= (CURRENT_DATE - make_interval(years => ${yrs})))`)
    }

    const minExp = url.searchParams.get("minExperience")
    const maxExp = url.searchParams.get("maxExperience")
    if (minExp) {
      filterConds.push(sql`(${candidates.experienceYears} IS NOT NULL AND ${candidates.experienceYears} >= ${Number(minExp)})`)
    }
    if (maxExp) {
      filterConds.push(sql`(${candidates.experienceYears} IS NOT NULL AND ${candidates.experienceYears} <= ${Number(maxExp)})`)
    }

    const workFormatsParam = url.searchParams.get("workFormat")
    if (workFormatsParam) {
      const list = workFormatsParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(or(isNull(candidates.workFormat), inArray(candidates.workFormat, list)) as SQL)
      }
    }

    const eduParam = url.searchParams.get("educationLevel")
    if (eduParam) {
      const list = eduParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(or(isNull(candidates.educationLevel), inArray(candidates.educationLevel, list)) as SQL)
      }
    }

    // Текстовый литерал PG-массива: '{"a","b"}'. Значения — строго коды/whitelist.
    const toPgTextArrayLiteral = (arr: string[]) =>
      "{" + arr.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",") + "}"

    const langParam = url.searchParams.get("languages")
    if (langParam) {
      const list = langParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(sql`(COALESCE(array_length(${candidates.languages}, 1), 0) = 0 OR ${candidates.languages} && ${toPgTextArrayLiteral(list)}::text[])`)
      }
    }

    const skillsParam = url.searchParams.get("keySkills")
    if (skillsParam) {
      const list = skillsParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(sql`(COALESCE(array_length(${candidates.keySkills}, 1), 0) = 0 OR ${candidates.keySkills} && ${toPgTextArrayLiteral(list)}::text[])`)
      }
    }

    const industryParam = url.searchParams.get("industry")
    if (industryParam) {
      const list = industryParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(or(isNull(candidates.industry), inArray(candidates.industry, list)) as SQL)
      }
    }

    const relocParam = url.searchParams.get("relocationReady")
    if (relocParam === "true" || relocParam === "false") {
      const want = relocParam === "true"
      filterConds.push(sql`(${candidates.relocationReady} IS NULL OR ${candidates.relocationReady} = ${want})`)
    }

    const tripsParam = url.searchParams.get("businessTripsReady")
    if (tripsParam === "true" || tripsParam === "false") {
      const want = tripsParam === "true"
      filterConds.push(sql`(${candidates.businessTripsReady} IS NULL OR ${candidates.businessTripsReady} = ${want})`)
    }

    // Дата отклика: candidates.created_at между dateFrom (включительно)
    // и dateTo (включительно — добавляем интервал 1 день).
    const dateFromParam = url.searchParams.get("dateFrom")
    if (dateFromParam && /^\d{4}-\d{2}-\d{2}/.test(dateFromParam)) {
      filterConds.push(sql`${candidates.createdAt} >= ${dateFromParam}::timestamp`)
    }
    const dateToParam = url.searchParams.get("dateTo")
    if (dateToParam && /^\d{4}-\d{2}-\d{2}/.test(dateToParam)) {
      filterConds.push(sql`${candidates.createdAt} < (${dateToParam}::timestamp + INTERVAL '1 day')`)
    }

    // Зарплата: salaryMin — кандидат хочет НЕ МЕНЕЕ X (его максимум >= X).
    // salaryMax — кандидат хочет НЕ БОЛЕЕ X (его минимум <= X).
    // NULL-зарплаты пропускаем (включаем кандидатов без указанного оффера).
    const salaryMinParam = url.searchParams.get("salaryMin")
    if (salaryMinParam && Number.isFinite(Number(salaryMinParam))) {
      const v = Math.max(0, Math.floor(Number(salaryMinParam)))
      filterConds.push(sql`(
        (${candidates.salaryMin} IS NULL AND ${candidates.salaryMax} IS NULL)
        OR COALESCE(${candidates.salaryMax}, ${candidates.salaryMin}, 0) >= ${v}
      )`)
    }
    const salaryMaxParam = url.searchParams.get("salaryMax")
    if (salaryMaxParam && Number.isFinite(Number(salaryMaxParam))) {
      const v = Math.max(0, Math.floor(Number(salaryMaxParam)))
      filterConds.push(sql`(
        (${candidates.salaryMin} IS NULL AND ${candidates.salaryMax} IS NULL)
        OR COALESCE(${candidates.salaryMin}, ${candidates.salaryMax}, 999999999) <= ${v}
      )`)
    }

    // Источник кандидата (multi-select).
    const sourcesParam = url.searchParams.get("sources")
    if (sourcesParam) {
      const list = sourcesParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(inArray(candidates.source, list) as SQL)
      }
    }

    // Город (multi-select).
    const citiesParam = url.searchParams.get("cities")
    if (citiesParam) {
      const list = citiesParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(inArray(candidates.city, list) as SQL)
      }
    }

    // AI-скор от X.
    const scoreMinParam = url.searchParams.get("scoreMin")
    if (scoreMinParam && Number.isFinite(Number(scoreMinParam))) {
      const v = Math.max(0, Math.floor(Number(scoreMinParam)))
      // Включаем кандидатов без скора (NULL) если v=0; иначе исключаем.
      if (v > 0) {
        filterConds.push(sql`(${candidates.aiScore} IS NOT NULL AND ${candidates.aiScore} >= ${v})`)
      }
    }

    // demoProgress — фильтрация по прогрессу демо. Поскольку процент
    // считается из demo_progress_json + lessons.length, делаем это
    // post-fetch (как сейчас сделана сортировка по progress в строке 388).
    const demoProgressParam = url.searchParams.get("demoProgress")
    const demoProgressFilters = demoProgressParam
      ? demoProgressParam.split(",").filter(Boolean)
      : []

    const baseConds: SQL[] = [
      eq(candidates.vacancyId, vacancyId) as SQL,
      notPreview as SQL,
    ]
    if (stages.length > 0) baseConds.push(inArray(candidates.stage, stages) as SQL)
    const where = and(...baseConds, ...filterConds)

    // total нужен только в пагинированном режиме. Тот же WHERE, что и select —
    // включая JSON-фильтры (age/birthDate из anketa_answers).
    let total = 0
    if (paginated) {
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(candidates)
        .where(where)
      total = cnt ?? 0
    }

    const rowsQuery = db.select().from(candidates).where(where).orderBy(...orderBy)
    const rows = paginated
      ? await rowsQuery.limit(pageSize).offset(offset)
      : await rowsQuery

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

    // Подгружаем структуру курса для расчёта прогресса по СТРАНИЦАМ
    // (см. ту же логику в ветке без vacancyId выше).
    let demoTotalBlocks = 0
    const blockToLesson = new Map<string, number>()
    const demoRowsV2 = await db
      .select({ lessonsJson: demos.lessonsJson, updatedAt: demos.updatedAt })
      .from(demos)
      .where(eq(demos.vacancyId, vacancyId))
      .orderBy(desc(demos.updatedAt))
      .limit(1)
    if (demoRowsV2.length > 0) {
      const lessons = Array.isArray(demoRowsV2[0].lessonsJson)
        ? (demoRowsV2[0].lessonsJson as LessonShape[])
        : []
      demoTotalBlocks = lessons.length + 2
      lessons.forEach((lesson, lessonIdx) => {
        const lessonBlocks = Array.isArray(lesson?.blocks) ? lesson.blocks : []
        for (const b of lessonBlocks) {
          const bid = (b as { id?: string })?.id
          if (typeof bid === "string") blockToLesson.set(bid, lessonIdx)
        }
      })
    }

    // Имя + page-based прогресс
    const withDisplayName = rows.map((r) => {
      const progress = r.demoProgressJson as { blocks?: DemoBlockProgress[] } | null
      const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
      const completedLessons = new Set<number>()
      let hasAnketa = false
      let hasThanks = false
      for (const b of blocks) {
        if (b.status !== "completed" || !b.blockId) continue
        if (b.blockId === "__anketa__") { hasAnketa = true; continue }
        if (b.blockId === "__thanks__") { hasThanks = true; continue }
        if (b.blockId === "__complete__") continue
        const lessonIdx = blockToLesson.get(b.blockId)
        if (typeof lessonIdx === "number") completedLessons.add(lessonIdx)
      }
      const completedPages = completedLessons.size + (hasAnketa ? 1 : 0) + (hasThanks ? 1 : 0)
      const demoCompletedBlocks = demoTotalBlocks > 0
        ? Math.min(completedPages, demoTotalBlocks)
        : completedPages
      const progressPercent = demoTotalBlocks > 0
        ? Math.min(100, Math.round((demoCompletedBlocks / demoTotalBlocks) * 100))
        : null

      // Эффективная дата рождения: birth_date или вытащенная из anketa_answers.
      // Нужно для клиентского фильтра по возрасту, который читает c.birthDate.
      const effectiveBirthDate = r.birthDate ?? extractBirthDateFromAnketa(r.anketaAnswers)

      return {
        ...r,
        birthDate: effectiveBirthDate,
        name: deriveCandidateName(r.name, r.anketaAnswers, hhNameByCandidateId.get(r.id) ?? null),
        demoTotalBlocks,
        demoCompletedBlocks,
        progressPercent,
      }
    })

    // Пост-фильтр по прогрессу демо (демо-прогресс зависит от lessons.length,
    // его проще применить здесь, после расчёта progressPercent).
    // В пагинированном режиме фильтр ИГНОРИРУЕТСЯ — иначе count(*) врёт
    // (см. ТЗ Шаг 1). Шаг 2 перенесёт прогресс в SQL и включит обратно.
    let filtered = withDisplayName
    if (!paginated && demoProgressFilters.length > 0) {
      filtered = withDisplayName.filter((c) => {
        const p = c.progressPercent
        const dp = c.demoProgressJson as { blocks?: { status?: string }[]; completedAt?: string | null } | null
        const hasStarted = !!dp && Array.isArray(dp.blocks) && dp.blocks.some(b => b?.status === "completed")
        const completedAt = dp?.completedAt ?? null

        for (const f of demoProgressFilters) {
          if (f === "not_started" && !hasStarted) return true
          if (f === "in_progress" && hasStarted && (p ?? 0) >= 1 && (p ?? 0) <= 84) return true
          if (f === "completed_85" && (p ?? 0) >= 85) return true
          if (f === "completed_below_85" && completedAt !== null && (p ?? 0) < 85) return true
        }
        return false
      })
    }

    if (paginated) {
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      return apiSuccess({ candidates: filtered, total, page, pageSize, totalPages })
    }

    return apiSuccess(filtered)
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
