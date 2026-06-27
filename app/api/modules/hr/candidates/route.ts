import { NextRequest } from "next/server"
import { eq, ne, and, inArray, asc, desc, or, isNull, isNotNull, gte, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, hhResponses, testSubmissions, followUpMessages, calendarEvents } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateToken } from "@/lib/candidate-tokens"
import { generateCandidateShortId } from "@/lib/short-id"
import { deriveCandidateName } from "@/lib/candidate-name"
import { resolveGivenNameMeta } from "@/lib/messaging/candidate-name"

type SortKey =
  | "favorite"
  | "aiScore"
  | "resumeScore"
  | "rubricScore"
  | "testScore"
  | "salary"
  | "responseDate"
  | "status"
  | "progress"
  | "createdAt"
  | "name"
  | "stage"
  | "city"
  | "source"
  | "hrQueue"
  | "nextInterview"

const ALLOWED_SORT_KEYS: ReadonlySet<SortKey> = new Set<SortKey>([
  "favorite", "aiScore", "resumeScore", "rubricScore", "testScore", "salary", "responseDate", "status", "progress",
  "createdAt", "name", "stage", "city", "source", "hrQueue", "nextInterview",
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

// P0-8: «Очередь HR» — приоритет показа anketa_filled первыми.
// Самые «дорогие» кандидаты — те, кто прошёл демо и оставил анкету,
// но ещё без решения HR. Остальные — по убыванию степени готовности.
const HR_QUEUE_ORDER_SQL = sql`CASE ${candidates.stage}
  WHEN 'anketa_filled'    THEN 1
  WHEN 'decision'         THEN 2
  WHEN 'interview'        THEN 2
  WHEN 'demo_opened'      THEN 3
  WHEN 'primary_contact'  THEN 4
  WHEN 'new'              THEN 5
  WHEN 'rejected'         THEN 99
  WHEN 'hired'            THEN 99
  ELSE 50
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

// Балл последнего теста кандидата для сортировки по колонке «Тест».
// COALESCE(ai_score, objective.score) — как в testScoreOf (см. ниже).
const TEST_SCORE_SQL = sql`(
  SELECT COALESCE(
    ts.ai_score,
    CASE WHEN (ts.answers_json->'objective'->>'maxPoints')::int > 0
         THEN (ts.answers_json->'objective'->>'score')::int END
  )
  FROM test_submissions ts
  WHERE ts.candidate_id = ${candidates.id}
  ORDER BY ts.submitted_at DESC
  LIMIT 1
)`

// Ранг для сортировки по колонке «Тест»: тест-активные кандидаты — наверх, даже
// без числового балла. Тиры повторяют логику testStatus (сдан с баллом → сдан →
// заполняет → открыл → отправлен → ошибка → ничего). NULL (нет активности) — в конец.
const TEST_RANK_SQL = sql`(
  CASE
    WHEN ${TEST_SCORE_SQL} IS NOT NULL THEN 1000 + ${TEST_SCORE_SQL}
    WHEN EXISTS (SELECT 1 FROM test_submissions ts WHERE ts.candidate_id = ${candidates.id} AND ts.submitted_at IS NOT NULL) THEN 900
    WHEN EXISTS (SELECT 1 FROM test_submissions ts WHERE ts.candidate_id = ${candidates.id}) THEN 800
    WHEN ${candidates.testInviteSentAt} IS NOT NULL THEN 500
    WHEN ${candidates.stage} IN ('test_task_sent','test_task_done','test_passed','test_failed') THEN 500
    WHEN EXISTS (SELECT 1 FROM follow_up_messages f WHERE f.candidate_id = ${candidates.id} AND f.branch = 'test_invite' AND f.status IN ('sent','pending')) THEN 500
    ELSE NULL
  END
)`

function buildOrderBy(key: SortKey | null, dir: "asc" | "desc"): SQL[] {
  const wrap = (col: Parameters<typeof asc>[0]) => (dir === "asc" ? asc(col) : desc(col))
  // id DESC — secondary tiebreaker для стабильной пагинации при равных значениях
  // primary-ключа (например, у двух кандидатов одинаковый прогресс).
  const tiebreak = desc(candidates.id)
  switch (key) {
    case "favorite":     return [wrap(candidates.isFavorite), desc(candidates.createdAt), tiebreak]
    case "aiScore": return [
      // NULL ai_score всегда в конец независимо от направления — кандидаты
      // без скоринга не должны доминировать в desc-выдаче.
      dir === "asc"
        ? sql`${candidates.aiScore} ASC NULLS LAST`
        : sql`${candidates.aiScore} DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "resumeScore": return [
      // NULL resume_score — в конец (тот же принцип что aiScore).
      dir === "asc"
        ? sql`${candidates.resumeScore} ASC NULLS LAST`
        : sql`${candidates.resumeScore} DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "rubricScore": return [
      dir === "asc"
        ? sql`${candidates.rubricScore} ASC NULLS LAST`
        : sql`${candidates.rubricScore} DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "testScore": return [
      // Ранг тест-активности (балл + статус); NULL (теста не было) — всегда в конец,
      // чтобы «отп./пер./сдан» поднимались наверх, а не падали вниз вместе с «—».
      dir === "asc"
        ? sql`${TEST_RANK_SQL} ASC NULLS LAST`
        : sql`${TEST_RANK_SQL} DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
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
    case "hrQueue":      return [
      // ASC: anketa_filled=1 первыми → новые внутри стадии первыми.
      // P0-8: дефолт при первом открытии вакансии.
      dir === "asc"
        ? sql`${HR_QUEUE_ORDER_SQL} ASC`
        : sql`${HR_QUEUE_ORDER_SQL} DESC`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "city": return [
      // NULL/пустые в конец независимо от направления — иначе они доминируют
      // и активная сортировка теряет смысл (как в client-side sort, line ~177).
      dir === "asc"
        ? sql`NULLIF(${candidates.city}, '') ASC NULLS LAST`
        : sql`NULLIF(${candidates.city}, '') DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "source": return [
      dir === "asc"
        ? sql`NULLIF(${candidates.source}, '') ASC NULLS LAST`
        : sql`NULLIF(${candidates.source}, '') DESC NULLS LAST`,
      desc(candidates.createdAt),
      tiebreak,
    ]
    case "nextInterview": {
      // Сортировка по ближайшему запланированному интервью (коррелированный
      // подзапрос: минимальный будущий start_at, не отменённое). Кандидаты без
      // интервью — в конец (NULLS LAST) независимо от направления.
      const nextIv = sql`(SELECT MIN(${calendarEvents.startAt}) FROM ${calendarEvents}
        WHERE ${calendarEvents.candidateId} = ${candidates.id}
          AND ${calendarEvents.type} = 'interview'
          AND ${calendarEvents.startAt} >= now()
          AND ${calendarEvents.status} <> 'cancelled')`
      return [
        dir === "asc" ? sql`${nextIv} ASC NULLS LAST` : sql`${nextIv} DESC NULLS LAST`,
        desc(candidates.createdAt),
        tiebreak,
      ]
    }
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

const ACTIVE_THRESHOLD_MS = 15 * 60 * 1000  // «активен сейчас» — активность за 15 мин

// Стадии, в которых тест уже отправлен кандидату (см. lib/stages.ts).
// Используется для колонки «Тест»: если submission ещё нет, но кандидат
// на тест-стадии — показываем «отп.» (отправлен).
const TEST_SENT_STAGES = new Set<string>([
  "test_task_sent", "test_task_done", "test_passed", "test_failed",
])

// Достаёт отображаемый балл теста из submission: приоритет — AI-оценка
// (aiScore, 0–100), фолбэк — объективная автопроверка (objective.score),
// если в тесте были закрытые вопросы (maxPoints > 0). Иначе null.
function testScoreOf(aiScore: number | null, answersJson: unknown): number | null {
  if (typeof aiScore === "number") return aiScore
  const obj = (answersJson as { objective?: { score?: number; maxPoints?: number } } | null)?.objective
  if (obj && typeof obj.score === "number" && (obj.maxPoints ?? 0) > 0) return obj.score
  return null
}

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
    // «Корзина»: ?trashed=true показывает удалённых (deleted_at IS NOT NULL),
    // обычный режим — только активных (deleted_at IS NULL).
    const trashedView = url.searchParams.get("trashed") === "true"
    const deletedFilter = trashedView ? isNotNull(candidates.deletedAt) : isNull(candidates.deletedAt)

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

      // Серверные фильтры для компанийского списка кандидатов (без vacancyId).
      const listConds: SQL[] = []
      if (stageParam && stageParam !== "all") {
        listConds.push(eq(candidates.stage, stageParam))
      }
      const listSourceParam = url.searchParams.get("source")
      if (listSourceParam && listSourceParam !== "all") {
        listConds.push(eq(candidates.source, listSourceParam))
      }
      const listVacancyTitle = url.searchParams.get("vacancyTitle")
      if (listVacancyTitle && listVacancyTitle !== "all") {
        listConds.push(eq(vacancies.title, listVacancyTitle))
      }
      const listSearch = url.searchParams.get("search")?.trim()
      if (listSearch) {
        const esc = listSearch.replace(/[\\%_]/g, (m) => "\\" + m)
        const pat = `%${esc}%`
        listConds.push(sql`(${candidates.name} ILIKE ${pat} OR ${candidates.email} ILIKE ${pat} OR ${candidates.phone} ILIKE ${pat})`)
      }
      // B6: «Избранные» — серверный фильтр (раньше был только клиентский на
      // /hr/candidates → не видел кандидатов за пределами загруженной страницы).
      if (url.searchParams.get("favorite") === "true") {
        listConds.push(eq(candidates.isFavorite, true))
      }

      // ── Расширенные фильтры из FilterState (поп-овер «Фильтр» на /hr/candidates) ──

      // Города (множественный выбор, через запятую)
      const citiesParam = url.searchParams.get("cities")
      if (citiesParam) {
        const cityList = citiesParam.split(",").map(c => c.trim()).filter(Boolean)
        if (cityList.length === 1) {
          listConds.push(eq(candidates.city, cityList[0]))
        } else if (cityList.length > 1) {
          listConds.push(inArray(candidates.city, cityList))
        }
      }

      // Источники (множественный выбор, через запятую)
      const sourcesParam = url.searchParams.get("sources")
      if (sourcesParam) {
        const sourceList = sourcesParam.split(",").map(s => s.trim()).filter(Boolean)
        if (sourceList.length === 1) {
          listConds.push(eq(candidates.source, sourceList[0]))
        } else if (sourceList.length > 1) {
          listConds.push(inArray(candidates.source, sourceList))
        }
      }

      // Стадии воронки (множественный выбор, через запятую) — если задан, stage-param игнорируется
      const funnelStatusesParam = url.searchParams.get("funnelStatuses")
      if (funnelStatusesParam && !stageParam) {
        const stages = funnelStatusesParam.split(",").map(s => s.trim()).filter(Boolean)
        if (stages.length === 1) {
          listConds.push(eq(candidates.stage, stages[0]))
        } else if (stages.length > 1) {
          listConds.push(inArray(candidates.stage, stages))
        }
      }

      // Скрыть отказы (hideRejected=true)
      if (url.searchParams.get("hideRejected") === "true") {
        listConds.push(ne(candidates.stage, "rejected"))
      }

      // Порог AI-скора по анкете (aiScore >= scoreMinAnketa)
      const scoreMinAnketa = url.searchParams.get("scoreMinAnketa")
      if (scoreMinAnketa && Number(scoreMinAnketa) > 0) {
        listConds.push(sql`${candidates.aiScore} >= ${Number(scoreMinAnketa)}`)
      }

      // Порог AI-скора по резюме (resumeScore >= scoreMinResume)
      const scoreMinResume = url.searchParams.get("scoreMinResume")
      if (scoreMinResume && Number(scoreMinResume) > 0) {
        listConds.push(sql`${candidates.resumeScore} >= ${Number(scoreMinResume)}`)
      }

      // Зарплатный диапазон (salaryMin/salaryMax из FilterState)
      const filterSalaryMin = url.searchParams.get("salaryMin")
      const filterSalaryMax = url.searchParams.get("salaryMax")
      if (filterSalaryMin && Number(filterSalaryMin) > 0) {
        listConds.push(sql`(${candidates.salaryMin} >= ${Number(filterSalaryMin)} OR ${candidates.salaryMax} >= ${Number(filterSalaryMin)})`)
      }
      if (filterSalaryMax && Number(filterSalaryMax) < 250000) {
        listConds.push(sql`(${candidates.salaryMin} <= ${Number(filterSalaryMax)} OR ${candidates.salaryMax} <= ${Number(filterSalaryMax)})`)
      }

      // Диапазон дат создания (dateFrom/dateTo в формате YYYY-MM-DD)
      const dateFrom = url.searchParams.get("dateFrom")
      const dateTo   = url.searchParams.get("dateTo")
      if (dateFrom) {
        listConds.push(sql`${candidates.createdAt} >= ${dateFrom}::date`)
      }
      if (dateTo) {
        listConds.push(sql`${candidates.createdAt} < (${dateTo}::date + interval '1 day')`)
      }

      const whereExpr = and(
        eq(vacancies.companyId, user.companyId),
        or(isNull(candidates.source), ne(candidates.source, "preview")),
        deletedFilter,
        ...listConds,
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
          resumeScore: candidates.resumeScore,
          rubricScore: candidates.rubricScore,
          salaryMin: candidates.salaryMin,
          salaryMax: candidates.salaryMax,
          salaryCurrency: candidates.salaryCurrency,
          vacancyId: candidates.vacancyId,
          vacancyTitle: vacancies.title,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          demoProgressJson: candidates.demoProgressJson,
          anketaAnswers: candidates.anketaAnswers,
          isFavorite: candidates.isFavorite,
          referredByShortId: candidates.referredByShortId,
          hhCandidateName: hhResponses.candidateName,
          photoUrl: candidates.photoUrl,
          testInviteSentAt: candidates.testInviteSentAt,
          firstNameOverride: candidates.firstNameOverride,
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
          .where(and(inArray(demos.vacancyId, vacancyIds), eq(demos.kind, "demo")))
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

      // Состояние теста для колонки «Тест» (как в пер-вакансионном списке):
      // последняя test_submission на кандидата + приглашения (follow_up).
      const gCandidateIds = rows.map(r => r.id)
      const gTestByCandidate = new Map<string, { score: number | null; answersCount: number; submitted: boolean }>()
      const gTestLiveInvited = new Set<string>()
      const gTestFailedInvited = new Set<string>()
      if (gCandidateIds.length > 0) {
        const subRows = await db
          .select({
            candidateId: testSubmissions.candidateId,
            aiScore: testSubmissions.aiScore,
            answersJson: testSubmissions.answersJson,
            submittedAt: testSubmissions.submittedAt,
          })
          .from(testSubmissions)
          .where(inArray(testSubmissions.candidateId, gCandidateIds))
          .orderBy(desc(testSubmissions.submittedAt))
        for (const s of subRows) {
          if (!s.candidateId || gTestByCandidate.has(s.candidateId)) continue
          const answers = (s.answersJson as { answers?: { value?: string }[] } | null)?.answers
          const answersCount = Array.isArray(answers)
            ? answers.filter((a) => (a?.value ?? "").trim().length > 0).length
            : 0
          gTestByCandidate.set(s.candidateId, {
            score: testScoreOf(s.aiScore, s.answersJson),
            answersCount,
            submitted: s.submittedAt != null,
          })
        }
        const invRows = await db
          .select({ candidateId: followUpMessages.candidateId, status: followUpMessages.status })
          .from(followUpMessages)
          .where(and(
            inArray(followUpMessages.candidateId, gCandidateIds),
            eq(followUpMessages.branch, "test_invite"),
          ))
        for (const iv of invRows) {
          if (!iv.candidateId) continue
          if (iv.status === "sent" || iv.status === "pending") gTestLiveInvited.add(iv.candidateId)
          else if (iv.status === "failed") gTestFailedInvited.add(iv.candidateId)
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

        // Колонка «Тест»: балл + статус (как в пер-вакансионном списке).
        const test = gTestByCandidate.get(r.id)
        let testStatus: "submitted" | "in_progress" | "opened" | "sent" | "failed" | null
        if (test) {
          testStatus = test.submitted ? "submitted" : test.answersCount > 0 ? "in_progress" : "opened"
        } else if (gTestLiveInvited.has(r.id)) {
          testStatus = "sent"
        } else if (gTestFailedInvited.has(r.id)) {
          testStatus = "failed"
        } else if (r.testInviteSentAt != null || TEST_SENT_STAGES.has(r.stage ?? "")) {
          // Маркер ручной отправки (не двигает стадию) ИЛИ legacy тест-стадия.
          testStatus = "sent"
        } else {
          testStatus = null
        }
        const testScore = test?.score ?? null

        // Имя «под вопросом»: тот же резолвер, что и при отправке ({{name}}).
        // confident=false → бот уйдёт в нейтральное «Здравствуйте» (фамилия/аноним/
        // редкое имя) → HR стоит проверить и при желании вписать вручную.
        const nameUncertain = !resolveGivenNameMeta({ override: r.firstNameOverride, fullName: r.name }).confident

        // Strip служебные поля — не нужны клиенту
        const { demoProgressJson: _drop1, anketaAnswers: _drop2, hhCandidateName: _drop3, firstNameOverride: _drop4, ...rest } = r
        void _drop1; void _drop2; void _drop3; void _drop4
        return {
          ...rest,
          name: displayName,
          nameUncertain,
          demoTotalBlocks,
          demoCompletedBlocks,
          progressPercent,
          isActive,
          testScore,
          testStatus,
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

    // B6 (07.06.2026): категориальные фильтры СУЖАЮТ выборку — кандидаты с
    // NULL/пустым полем исключаются при активном фильтре. Раньше тут было
    // «включать NULL» (фильтр «не блокирует»), но это давало no-op у тенантов
    // с незаполненными полями (напр. Орлинк: industry 100% NULL → фильтр
    // показывал всех). Теперь поведение единообразно с age/experience, которые
    // и так исключают NULL: пользователь выбрал значение → список сужается.
    const workFormatsParam = url.searchParams.get("workFormat")
    if (workFormatsParam) {
      const list = workFormatsParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(inArray(candidates.workFormat, list) as SQL)
      }
    }

    const eduParam = url.searchParams.get("educationLevel")
    if (eduParam) {
      const list = eduParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(inArray(candidates.educationLevel, list) as SQL)
      }
    }

    // Текстовый литерал PG-массива: '{"a","b"}'. Значения — строго коды/whitelist.
    const toPgTextArrayLiteral = (arr: string[]) =>
      "{" + arr.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",") + "}"

    const langParam = url.searchParams.get("languages")
    if (langParam) {
      const list = langParam.split(",").filter(Boolean)
      if (list.length > 0) {
        // && (overlap): NULL/пустой массив не пересекается → кандидат исключён.
        filterConds.push(sql`${candidates.languages} && ${toPgTextArrayLiteral(list)}::text[]`)
      }
    }

    const skillsParam = url.searchParams.get("keySkills")
    if (skillsParam) {
      const list = skillsParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(sql`${candidates.keySkills} && ${toPgTextArrayLiteral(list)}::text[]`)
      }
    }

    const industryParam = url.searchParams.get("industry")
    if (industryParam) {
      const list = industryParam.split(",").filter(Boolean)
      if (list.length > 0) {
        filterConds.push(inArray(candidates.industry, list) as SQL)
      }
    }

    const relocParam = url.searchParams.get("relocationReady")
    if (relocParam === "true" || relocParam === "false") {
      const want = relocParam === "true"
      filterConds.push(sql`${candidates.relocationReady} = ${want}`)
    }

    const tripsParam = url.searchParams.get("businessTripsReady")
    if (tripsParam === "true" || tripsParam === "false") {
      const want = tripsParam === "true"
      filterConds.push(sql`${candidates.businessTripsReady} = ${want}`)
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
    // «Скрыть без зарплаты» — исключаем кандидатов, у которых ЗП не указана.
    if (url.searchParams.get("hideNoSalary") === "true") {
      filterConds.push(sql`NOT (${candidates.salaryMin} IS NULL AND ${candidates.salaryMax} IS NULL)`)
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

    // AI-скор от X (legacy единый слайдер — фильтрует по aiScore).
    const scoreMinParam = url.searchParams.get("scoreMin")
    if (scoreMinParam && Number.isFinite(Number(scoreMinParam))) {
      const v = Math.max(0, Math.floor(Number(scoreMinParam)))
      // Включаем кандидатов без скора (NULL) если v=0; иначе исключаем.
      if (v > 0) {
        filterConds.push(sql`(${candidates.aiScore} IS NOT NULL AND ${candidates.aiScore} >= ${v})`)
      }
    }

    // Минимальный AI-скор по резюме (отдельный слайдер на странице вакансии).
    const scoreMinResumeParam = url.searchParams.get("scoreMinResume")
    if (scoreMinResumeParam && Number.isFinite(Number(scoreMinResumeParam))) {
      const v = Math.max(0, Math.floor(Number(scoreMinResumeParam)))
      if (v > 0) {
        filterConds.push(sql`(${candidates.resumeScore} IS NOT NULL AND ${candidates.resumeScore} >= ${v})`)
      }
    }

    // Минимальный AI-скор по анкете (после прохождения демо).
    const scoreMinAnketaParam = url.searchParams.get("scoreMinAnketa")
    if (scoreMinAnketaParam && Number.isFinite(Number(scoreMinAnketaParam))) {
      const v = Math.max(0, Math.floor(Number(scoreMinAnketaParam)))
      if (v > 0) {
        filterConds.push(sql`(${candidates.aiScore} IS NOT NULL AND ${candidates.aiScore} >= ${v})`)
      }
    }

    // Скрыть отказы (тумблер «Скрыть/Показать отказы»). Отдельно от
    // stage-whitelist: исключает ровно rejected, не трогая legacy-стадии
    // (demo/interviewed/offer/...), которых нет в наборе slug'ов фильтра.
    const excludeRejectedParam = url.searchParams.get("excludeRejected")
    if (excludeRejectedParam === "true") {
      filterConds.push(sql`(${candidates.stage} IS DISTINCT FROM 'rejected')`)
    }

    // «Активны сейчас» — кандидаты с активностью (демо/тест) за последние 15 мин.
    // last_activity_at дёргают demo/answer и test/answer|open (now()::timestamp —
    // сравниваем в той же зоне, что и defaultNow()).
    if (url.searchParams.get("activeNow") === "true") {
      filterConds.push(sql`(${candidates.lastActivityAt} IS NOT NULL AND ${candidates.lastActivityAt} > (now()::timestamp - interval '15 minutes'))`)
    }

    // Поиск по имени/email/телефону (ILIKE). %/_/\ экранируем, чтобы юзер
    // не получил расширенный паттерн при вводе этих символов.
    const searchParam = url.searchParams.get("search")?.trim()
    if (searchParam && searchParam.length > 0) {
      const escaped = searchParam.replace(/[\\%_]/g, (m) => "\\" + m)
      const pattern = `%${escaped}%`
      filterConds.push(sql`(
        ${candidates.name}  ILIKE ${pattern}
        OR ${candidates.email} ILIKE ${pattern}
        OR ${candidates.phone} ILIKE ${pattern}
      )`)
    }

    // demoProgress — фильтрация по прогрессу демо. В paginated режиме
    // применяется в SQL (требует pre-fetch demoTotalBlocks для расчёта
    // порога 85%). В non-paginated — post-fetch (ниже), потому что там
    // есть точный progressPercent на каждом кандидате.
    const demoProgressParam = url.searchParams.get("demoProgress")
    const demoProgressFilters = demoProgressParam
      ? demoProgressParam.split(",").filter(Boolean)
      : []

    // Pre-fetch demoTotalBlocks (только для paginated + demoProgress filter).
    // Использует ту же логику, что и блок ниже (line ~590), но раньше —
    // чтобы участвовать в WHERE.
    let paginatedDemoTotalBlocks = 0
    if (paginated && demoProgressFilters.length > 0) {
      const earlyDemoRows = await db
        .select({ lessonsJson: demos.lessonsJson })
        .from(demos)
        .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo")))
        .orderBy(desc(demos.updatedAt))
        .limit(1)
      if (earlyDemoRows.length > 0) {
        const lessons = Array.isArray(earlyDemoRows[0].lessonsJson)
          ? (earlyDemoRows[0].lessonsJson as LessonShape[])
          : []
        paginatedDemoTotalBlocks = lessons.length + 2
      }
    }

    if (paginated && demoProgressFilters.length > 0 && paginatedDemoTotalBlocks > 0) {
      const threshold85 = Math.ceil(paginatedDemoTotalBlocks * 0.85)
      const orParts: SQL[] = []
      for (const f of demoProgressFilters) {
        if (f === "not_started") {
          orParts.push(sql`${DEMO_PROGRESS_COUNT_SQL} = 0`)
        } else if (f === "in_progress") {
          orParts.push(sql`(${DEMO_PROGRESS_COUNT_SQL} > 0 AND ${DEMO_PROGRESS_COUNT_SQL} < ${threshold85})`)
        } else if (f === "completed_85") {
          orParts.push(sql`${DEMO_PROGRESS_COUNT_SQL} >= ${threshold85}`)
        } else if (f === "completed_below_85") {
          orParts.push(sql`((${candidates.demoProgressJson}->>'completedAt') IS NOT NULL AND ${DEMO_PROGRESS_COUNT_SQL} < ${threshold85})`)
        }
      }
      const orSql = or(...orParts)
      if (orSql) filterConds.push(orSql)
    }

    const baseConds: SQL[] = [
      eq(candidates.vacancyId, vacancyId) as SQL,
      notPreview as SQL,
      deletedFilter as SQL,
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

    // Состояние теста для колонки «Тест»: последняя запись test_submission на
    // кандидата. score — число (AI/автопроверка) либо null; answersCount —
    // сколько вопросов реально отвечено (черновик = автосохранение по ходу);
    // submitted — нажал ли «Отправить» (submitted_at задан).
    const testByCandidateId = new Map<string, { score: number | null; answersCount: number; submitted: boolean }>()
    if (candidateIds.length > 0) {
      const subRows = await db
        .select({
          candidateId: testSubmissions.candidateId,
          aiScore: testSubmissions.aiScore,
          answersJson: testSubmissions.answersJson,
          submittedAt: testSubmissions.submittedAt,
        })
        .from(testSubmissions)
        .where(inArray(testSubmissions.candidateId, candidateIds))
        .orderBy(desc(testSubmissions.submittedAt))
      for (const s of subRows) {
        if (!s.candidateId || testByCandidateId.has(s.candidateId)) continue
        const answers = (s.answersJson as { answers?: { value?: string }[] } | null)?.answers
        const answersCount = Array.isArray(answers)
          ? answers.filter((a) => (a?.value ?? "").trim().length > 0).length
          : 0
        testByCandidateId.set(s.candidateId, {
          score: testScoreOf(s.aiScore, s.answersJson),
          answersCount,
          submitted: s.submittedAt != null,
        })
      }
    }

    // Ближайшее запланированное интервью по кандидату (колонка «Ближайшее
    // интервью» в списке): минимальный будущий start_at, не отменённое.
    const nextInterviewByCandidateId = new Map<string, string>()
    if (candidateIds.length > 0) {
      const ivRows = await db
        .select({ candidateId: calendarEvents.candidateId, startAt: calendarEvents.startAt })
        .from(calendarEvents)
        .where(and(
          inArray(calendarEvents.candidateId, candidateIds),
          eq(calendarEvents.type, "interview"),
          gte(calendarEvents.startAt, new Date()),
          ne(calendarEvents.status, "cancelled"),
        ))
        .orderBy(asc(calendarEvents.startAt))
      for (const iv of ivRows) {
        if (!iv.candidateId || nextInterviewByCandidateId.has(iv.candidateId)) continue
        nextInterviewByCandidateId.set(iv.candidateId, (iv.startAt as Date).toISOString())
      }
    }

    // Кому тест отправлен/поставлен в очередь — для статуса «отп.» в колонке.
    // Сигнал надёжнее, чем только стадия: рассылка идёт через follow_up_messages
    // (branch='test_invite'), а стадия test_task_sent ставится не во всех путях.
    // Различаем «живые» (sent|pending → «отп.») и «упавшие» (failed): если у
    // кандидата только провалившиеся попытки (нет hh-чата / hh-403 / нет токена),
    // стадия осталась test_task_sent, но тест НЕ ушёл — показываем «ошибка», а не
    // ложное «отп.».
    const testLiveInvitedIds = new Set<string>()
    const testFailedInvitedIds = new Set<string>()
    if (candidateIds.length > 0) {
      const invRows = await db
        .select({ candidateId: followUpMessages.candidateId, status: followUpMessages.status })
        .from(followUpMessages)
        .where(and(
          inArray(followUpMessages.candidateId, candidateIds),
          eq(followUpMessages.branch, "test_invite"),
        ))
      for (const r of invRows) {
        if (!r.candidateId) continue
        if (r.status === "sent" || r.status === "pending") testLiveInvitedIds.add(r.candidateId)
        else if (r.status === "failed") testFailedInvitedIds.add(r.candidateId)
      }
    }

    // Подгружаем структуру курса для расчёта прогресса по СТРАНИЦАМ
    // (см. ту же логику в ветке без vacancyId выше).
    let demoTotalBlocks = 0
    const blockToLesson = new Map<string, number>()
    const demoRowsV2 = await db
      .select({ lessonsJson: demos.lessonsJson, updatedAt: demos.updatedAt })
      .from(demos)
      .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo")))
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

      // Колонка «Тест» — лесенка состояний (балл показывается всегда, когда есть):
      //   submitted   — нажал «Отправить» → «сдан» (если балла ещё нет)
      //   in_progress — заполняет (черновик с ответами) → «пишет»
      //   opened      — открыл тест, ещё не отвечал → «пер.»
      //   sent        — тест отправлен/в очереди → «отп.»
      //   failed      — отправка упала (нет hh-чата / hh-403 / нет токена) → «ошибка»
      //   null        — теста не было
      const test = testByCandidateId.get(r.id)
      let testStatus: "submitted" | "in_progress" | "opened" | "sent" | "failed" | null
      if (test) {
        testStatus = test.submitted ? "submitted" : test.answersCount > 0 ? "in_progress" : "opened"
      } else if (testLiveInvitedIds.has(r.id)) {
        testStatus = "sent"
      } else if (testFailedInvitedIds.has(r.id)) {
        // Только провалившиеся попытки — ничего не ушло, стадия осталась
        // test_task_sent ложно. Показываем «ошибка», чтобы HR это видел.
        testStatus = "failed"
      } else if (r.testInviteSentAt != null || TEST_SENT_STAGES.has(r.stage ?? "")) {
        // Маркер ручной отправки — рассылка через hh И «Отправить тест» оба
        // ставят testInviteSentAt. Зеркалит глобальный список (см. ~590); раньше
        // пер-вакансионный список игнорировал маркер → «отп.» не появлялось
        // после рассылки, хотя маркер в БД был.
        testStatus = "sent"
      } else {
        testStatus = null
      }

      // «Активен сейчас» — активность (демо/тест) за последние 30 минут.
      const isActive = r.lastActivityAt != null
        && (Date.now() - new Date(r.lastActivityAt).getTime()) <= ACTIVE_THRESHOLD_MS

      const nameUncertain = !resolveGivenNameMeta({ override: r.firstNameOverride, fullName: r.name }).confident

      return {
        ...r,
        birthDate: effectiveBirthDate,
        name: deriveCandidateName(r.name, r.anketaAnswers, hhNameByCandidateId.get(r.id) ?? null),
        nameUncertain,
        demoTotalBlocks,
        demoCompletedBlocks,
        progressPercent,
        testScore: test?.score ?? null,
        testStatus,
        isActive,
        nextInterviewAt: nextInterviewByCandidateId.get(r.id) ?? null,
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
