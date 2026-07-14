"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

// ─── Types (mirror DB schema fields returned by the API) ──────────────────────

export interface ApiCandidate {
  id: string
  vacancyId: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  source: string | null
  stage: string | null
  score: number | null
  salaryMin: number | null
  salaryMax: number | null
  // Валюта зарплаты (RUR/RUB/EUR/USD/...). NULL = RUB по умолчанию.
  salaryCurrency?: string | null
  experience: string | null
  skills: string[] | null
  // HR-020: новые поля для рабочих фильтров списка кандидатов.
  birthDate?: string | null
  experienceYears?: number | null
  workFormat?: string | null            // 'office'|'hybrid'|'remote'
  educationLevel?: string | null        // 'secondary'|'specialized'|'higher'|'mba'
  languages?: string[] | null
  keySkills?: string[] | null
  industry?: string | null
  relocationReady?: boolean | null
  businessTripsReady?: boolean | null
  // Доп. поля hh (миграция 0200)
  driverLicenses?: string[] | null
  hasVehicle?: boolean | null
  citizenshipNames?: string[] | null
  workTicketNames?: string[] | null
  professionalRoles?: string[] | null
  photoUrl?: string | null
  token: string
  demoProgressJson: unknown
  // Состояние кандидата в воронке v2 (стадия funnel-v2, если активна).
  // Возвращается только в ответе пер-вакансионного списка.
  funnelV2StateJson?: unknown
  // Реальный формат в БД — массив [{ blockId, answer, ... }] или legacy [{ question, answer }].
  // Внутренние тулзы рендеринга нормализуют тип, поэтому здесь — `unknown`.
  anketaAnswers: unknown
  // F8: id скрытых сообщений чата (косметическое «скрыть у себя», серверное).
  hiddenChatMsgIds?: string[] | null
  // Снимок данных кандидата из анкетной формы (firstName/lastName/phone/
  // email/city/birthDate/telegram/portfolioUrl/...). Отдельно от
  // anketa_answers (там массив демо-блоков). Не перезаписывает основные
  // поля name/phone/email/city/birthDate.
  surveyResponses?: unknown
  aiScore: number | null
  aiSummary: string | null
  aiDetails: { question: string; score: number; comment: string }[] | null
  // AI-ан: балл по ответам демо (candidates.demo_answers_score). Отдельная колонка
  // от aiScore — туда пишет v1/v2-скоринг резюме, тут оценка task-вопросов демо.
  demoAnswersScore?: number | null
  demoAnswersDetails?: { questionText: string; awarded: number; max: number; comment: string }[] | null
  // Пер-блочные баллы анкеты (candidates.demo_block_scores): { demoId: { title, score } }.
  demoBlockScores?: Record<string, { title?: string; score: number }> | null
  // Индикатор прогресса частей анкеты "N/M" (Вариант Б, единый балл 05.07).
  // Возвращается только пер-вакансионным списком (app/api/modules/hr/candidates).
  anketaPartsAnswered?: number
  anketaPartsTotal?: number
  // Прозрачность приглашения на 2-ю часть демо (describeSecondDemoInvite). null = фича выключена.
  secondDemoInvite?: {
    invited: boolean
    score: number | null
    threshold: number
    aiEvalScore: number | null
    aiEvalThreshold: number
    passed: boolean | null
    blockTitle: string | null
  } | null
  // AI-скор резюме (выставляется в lib/hh/process-queue.ts при приёме отклика).
  // Отдельно от aiScore — тот считается после демо и учитывает ответы.
  resumeScore?: number | null
  // Разбор осевого скоринга резюме (spec.scoringMode="axes"): оси, штрафы,
  // verdict, summary. Заполняется только при осевой оценке — для блока «почему».
  aiScoreBreakdown?: import("@/lib/core/spec/axis-scorer").AxisScoreResult | null
  // Рубричный движок (shadow). Считается параллельно, для ранжирования/сравнения.
  rubricScore?: number | null
  // Имя «под вопросом» — резолвер уйдёт в нейтральное «Здравствуйте». HR проверяет.
  nameUncertain?: boolean
  // Группа 25: A/B сравнение v1 vs v2 (см. CandidateScoreV2 в schema.ts).
  aiScoreV1?: number | null
  aiScoreV2?: number | null
  aiScoreV2Details?: import("@/lib/db/schema").CandidateScoreV2 | null
  aiScoredAt?: string | null
  isFavorite: boolean | null
  createdAt: string | null
  // Дата последнего отклика (повторный отклик) — колонка «Дата» показывает её.
  lastRespondedAt?: string | null
  updatedAt: string | null
  hhResponseId?: string | null
  hhRawData?: unknown
  // Кандидату доступно скачивание PDF резюме с hh (резолвится resume_id по
  // hh_candidates/hh_responses — lib/hh/resolve-resume-id.ts). Отдаётся ТОЛЬКО
  // пер-кандидатным GET /api/modules/hr/candidates/[id] (не списками).
  hasResumePdf?: boolean
  demoLessons?: unknown
  stageHistory?: unknown
  shortId?: string | null
  referredByShortId?: string | null
  // Прогресс по страницам курса (вычисляется в API: total = lessons.length + 2)
  demoTotalBlocks?: number
  demoCompletedBlocks?: number
  progressPercent?: number | null
  // «Демо пройдено по ответам» — кандидат ответил на все обязательные вопросы
  // демо, даже если хвост декоративных блоков не пролистан (прогресс по
  // страницам < 100%). Считается на сервере (hasAnsweredAllRequired). false,
  // если у демо нет обязательных вопросов.
  demoCompletedByAnswers?: boolean
  // Колонка «Тест»: балл последнего test_submission (AI-оценка / автопроверка)
  // и статус-лесенка: submitted (сдан) / in_progress (пишет) / opened (перешёл) /
  // sent (отправлен) / failed (отправка упала) / null.
  testScore?: number | null
  testStatus?: "submitted" | "in_progress" | "opened" | "sent" | "failed" | null
  // Состояние ФОНОВОГО AI-скоринга свободных ответов теста (05.07, из
  // test_submissions.answers_json.scoringStatus) — независимо от testStatus.
  // Когда testStatus='submitted' И testScore==null, testScoringStatus говорит
  // ПОЧЕМУ балла ещё нет: pending/failed — AI считает/повторяет попытку,
  // manual — testCheckMode='manual', ждёт ручной проверки HR (не баг).
  testScoringStatus?: "pending" | "done" | "failed" | "manual" | null
  // «Активен сейчас» — активность (демо/тест) за последние 30 минут.
  isActive?: boolean
  // Захват причины отказа (заполняется при stage="rejected").
  rejectionReasonCategory?: string | null
  rejectionInitiator?: string | null
  rejectionComment?: string | null
  rejectionAt?: string | null
  // Отложенный отказ (lib/rejection/execute.ts scheduleRejection) — не NULL,
  // пока cron pending-rejections не исполнит (или HR не отменит). Нужен
  // скоркарте интервью для бейджа «Решение: Отказ (запланирован)».
  pendingRejectionAt?: string | null
  pendingRejectionReason?: string | null
  // F7: Telegram-бот для кандидатов
  telegramChatId?: string | null
  telegramUsername?: string | null
  telegramOptOut?: boolean | null
  telegramInviteToken?: string | null
  tgMessages?: import("@/lib/db/schema").TgMessage[] | null
  // «2-я часть демо» (Путь менеджера): per-candidate override блока (миграция
  // 0236). Не NULL И stage='test_task_sent' → статус-ярлык «2-я часть».
  overrideContentBlockId?: string | null
  // Скоркарта интервью (миграция 0258): итоговый балл 1-10, manualOverride ??
  // autoScore. null = интервью не оценивалось. Колонка списка рисует другой
  // агент — имя поля ФИКСИРОВАНО (interviewScore), не переименовывать.
  interviewScore?: number | null
  interviewScorecardJson?: import("@/lib/candidates/interview-scorecard").InterviewScorecard | null
}

// ─── useCandidates ────────────────────────────────────────────────────────────

export interface CandidatesFilters {
  // Серверные фильтры (API применяет в SQL)
  search?: string                     // Поиск по имени/email/телефону (ILIKE %v%)
  minAge?: number
  maxAge?: number
  minExperience?: number
  maxExperience?: number
  workFormats?: string[]              // ['office','hybrid','remote']
  educationLevels?: string[]          // ['secondary','specialized','higher','mba']
  languages?: string[]
  keySkills?: string[]
  industries?: string[]
  relocationReady?: boolean | null    // true/false/null=any
  businessTripsReady?: boolean | null
  // Расширенные фильтры (страница вакансии)
  demoProgress?: string[]             // ['not_started','in_progress','completed_85','completed_below_85']
  dateFrom?: string                   // ISO date
  dateTo?: string                     // ISO date
  salaryMin?: number
  salaryMax?: number
  sources?: string[]                  // ['hh','manual','referral','demo','avito','telegram','site']
  cities?: string[]
  /** @deprecated alias для scoreMinAnketa */
  scoreMin?: number
  scoreMinResume?: number             // фильтр по candidates.resumeScore
  scoreMinAnketa?: number             // фильтр по candidates.demoAnswersScore (колонка «Анкета»)
  scoreMinTest?: number               // фильтр по баллу теста (TEST_SCORE_SQL — колонка «Тест»)
  hideRejected?: boolean              // сервер: stage != 'rejected'
  hideNoSalary?: boolean              // сервер: исключить кандидатов без указанной ЗП
  activeNow?: boolean                 // сервер: активность за последние 30 мин (демо/тест)
  /** Фильтр по статусу заполнения анкеты:
   *  "filled"     — кандидат отправил контактную форму (survey_responses IS NOT NULL)
   *  "not_filled" — открыл демо, но форму не заполнил (demo_opened_at IS NOT NULL AND survey_responses IS NULL)
   *  undefined    — без фильтра */
  anketaFilled?: "filled" | "not_filled"
  /** #43: ответившие на вопросы анкеты (demo_answers_score IS NOT NULL) —
   *  критерий счётчика «N анкет» в шапке вакансии. НЕ путать с anketaFilled
   *  (тот про контактную форму survey_responses). */
  demoAnswered?: boolean
  /** #43 (доделка): прошли 2-ю часть демо — ≥2 ключей в demo_block_scores —
   *  критерий счётчика «N демо-2» в шапке вакансии. */
  secondDemoPassed?: boolean
  /** #43 (доделка): кликнули по кнопке-ссылке в демо (demo_progress_json.
   *  ctaClicks непустой) — критерий счётчика «N перешли по ссылке». */
  ctaClicked?: boolean
  /** #43 (доделка): разбивка «прошлые + текущая» откликов с hh —
   *  "current"/"previous" публикация вакансии на hh.ru. */
  hhPublication?: "current" | "previous"
  /** Пресет «На разбор» (воронка-v2, Фаза 1г): застрявшие после 1-й части —
   *  demo_answers_score IS NOT NULL AND second_demo_invited_at IS NULL И не в
   *  отказе (ни 'rejected', ни 'preliminary_reject'). Только видимость. */
  reviewQueue?: boolean
}

export interface CandidatesSortParams {
  sort?: string
  order?: "asc" | "desc"
}

export function useCandidates(
  vacancyId: string | null,
  stageFilter?: string[],
  sortParams?: CandidatesSortParams,
  filters?: CandidatesFilters,
) {
  const [candidates, setCandidates] = useState<ApiCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    if (!vacancyId) {
      setCandidates([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ vacancy_id: vacancyId })
      if (stageFilter && stageFilter.length > 0) {
        params.set("stage", stageFilter.join(","))
      }
      if (sortParams?.sort) {
        params.set("sort", sortParams.sort)
        params.set("order", sortParams.order ?? "desc")
      }
      // Серверные фильтры — добавляются только если заданы (default-значения не шлём)
      if (filters) {
        if (typeof filters.minAge === "number" && filters.minAge > 18) {
          params.set("minAge", String(filters.minAge))
        }
        if (typeof filters.maxAge === "number" && filters.maxAge < 65) {
          params.set("maxAge", String(filters.maxAge))
        }
        if (typeof filters.minExperience === "number" && filters.minExperience > 0) {
          params.set("minExperience", String(filters.minExperience))
        }
        if (typeof filters.maxExperience === "number" && filters.maxExperience < 20) {
          params.set("maxExperience", String(filters.maxExperience))
        }
        if (filters.workFormats && filters.workFormats.length > 0) {
          params.set("workFormat", filters.workFormats.join(","))
        }
        if (filters.educationLevels && filters.educationLevels.length > 0) {
          params.set("educationLevel", filters.educationLevels.join(","))
        }
        if (filters.languages && filters.languages.length > 0) {
          params.set("languages", filters.languages.join(","))
        }
        if (filters.keySkills && filters.keySkills.length > 0) {
          params.set("keySkills", filters.keySkills.join(","))
        }
        if (filters.industries && filters.industries.length > 0) {
          params.set("industry", filters.industries.join(","))
        }
        if (filters.relocationReady === true) params.set("relocationReady", "true")
        if (filters.relocationReady === false) params.set("relocationReady", "false")
        if (filters.businessTripsReady === true) params.set("businessTripsReady", "true")
        if (filters.businessTripsReady === false) params.set("businessTripsReady", "false")

        if (filters.demoProgress && filters.demoProgress.length > 0) {
          params.set("demoProgress", filters.demoProgress.join(","))
        }
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
        if (filters.dateTo) params.set("dateTo", filters.dateTo)
        if (typeof filters.salaryMin === "number" && filters.salaryMin > 0) {
          params.set("salaryMin", String(filters.salaryMin))
        }
        if (typeof filters.salaryMax === "number" && filters.salaryMax > 0 && filters.salaryMax < 250000) {
          params.set("salaryMax", String(filters.salaryMax))
        }
        if (filters.sources && filters.sources.length > 0) {
          params.set("sources", filters.sources.join(","))
        }
        if (filters.cities && filters.cities.length > 0) {
          params.set("cities", filters.cities.join(","))
        }
        if (typeof filters.scoreMin === "number" && filters.scoreMin > 0) {
          params.set("scoreMin", String(filters.scoreMin))
        }
        if (typeof filters.scoreMinResume === "number" && filters.scoreMinResume > 0) {
          params.set("scoreMinResume", String(filters.scoreMinResume))
        }
        if (typeof filters.scoreMinAnketa === "number" && filters.scoreMinAnketa > 0) {
          params.set("scoreMinAnketa", String(filters.scoreMinAnketa))
        }
        if (typeof filters.scoreMinTest === "number" && filters.scoreMinTest > 0) {
          params.set("scoreMinTest", String(filters.scoreMinTest))
        }
        if (filters.hideRejected) params.set("excludeRejected", "true")
        if (filters.hideNoSalary) params.set("hideNoSalary", "true")
        if (filters.activeNow) params.set("activeNow", "true")
        if (filters.search && filters.search.trim()) {
          params.set("search", filters.search.trim())
        }
        if (filters.anketaFilled) params.set("anketaFilled", filters.anketaFilled)
        if (filters.demoAnswered) params.set("demoAnswered", "1")
        if (filters.secondDemoPassed) params.set("secondDemoPassed", "1")
        if (filters.ctaClicked) params.set("ctaClicked", "1")
        if (filters.hhPublication) params.set("hhPublication", filters.hhPublication)
        if (filters.reviewQueue) params.set("reviewQueue", "true")
      }
      const res = await fetch(`/api/modules/hr/candidates?${params.toString()}`)
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as ApiCandidate[]
      setCandidates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки кандидатов")
    } finally {
      setLoading(false)
    }
  }, [vacancyId, stageFilter?.join(","), sortParams?.sort, sortParams?.order, JSON.stringify(filters)])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch_()
  }, [fetch_])

  // ── Stage mutation ────────────────────────────────────────────────────────

  const updateStage = useCallback(async (
    candidateId: string,
    stage: string,
    opts?: { messageOverride?: string; interviewMode?: "phone" | "zoom" | "office" },
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          ...(opts?.messageOverride ? { messageOverride: opts.messageOverride } : {}),
          ...(opts?.interviewMode ? { interviewMode: opts.interviewMode } : {}),
        }),
      })
      if (!res.ok) return false
      // Optimistic update
      setCandidates(prev =>
        prev.map(c => c.id === candidateId ? { ...c, stage } : c)
      )
      return true
    } catch {
      return false
    }
  }, [])

  const toggleFavorite = useCallback(async (candidateId: string, isFavorite: boolean): Promise<boolean> => {
    // Оптимистично обновляем UI сразу
    setCandidates(prev =>
      prev.map(c => c.id === candidateId ? { ...c, isFavorite } : c)
    )
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      })
      if (!res.ok) {
        // Откатываем
        setCandidates(prev =>
          prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c)
        )
        return false
      }
      return true
    } catch {
      setCandidates(prev =>
        prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c)
      )
      return false
    }
  }, [])

  return { candidates, loading, error, refetch: fetch_, updateStage, toggleFavorite }
}

// ─── usePaginatedCandidates ───────────────────────────────────────────────────
//
// Серверная пагинация для страницы /hr/vacancies/[id]?tab=candidates.
// Отдельный хук от useCandidates — там legacy-контракт «вся выборка массивом»,
// который используют канбан, дашборд и mini-table. Здесь же:
//   • SQL .limit/.offset на бэкенде, count(*) для total
//   • URL state: ?page=&pageSize=&sortBy=&order=
//   • setPage/setPageSize/setSort пушат router.replace(url, { scroll: false })
//
// Шаг 1 (Ф1): sortBy=progress и фильтр demoProgress на бэкенде игнорируются
// в пагинированном режиме (см. app/api/modules/hr/candidates/route.ts).

const PAGINATED_PAGE_SIZES = [20, 50, 100] as const
type PageSize = (typeof PAGINATED_PAGE_SIZES)[number]

export type PaginatedSortKey =
  | "createdAt" | "name" | "aiScore" | "resumeScore" | "testScore" | "answersScore" | "salary" | "stage" | "progress"
  | "city" | "source" | "favorite" | "hrQueue" | "nextInterview"

const PAGINATED_SORT_KEYS: readonly PaginatedSortKey[] = [
  "createdAt", "name", "aiScore", "resumeScore", "testScore", "answersScore", "salary", "stage", "progress",
  "city", "source", "favorite", "hrQueue", "nextInterview",
]

interface PaginatedResponse {
  candidates: ApiCandidate[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface UsePaginatedCandidatesParams {
  vacancyId: string | null
  filters?: CandidatesFilters
  stageFilter?: string[]
}

export function usePaginatedCandidates({
  vacancyId,
  filters,
  stageFilter,
}: UsePaginatedCandidatesParams) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Источник правды — локальный state. URL зеркалирует state через writeUrl
  // (для shareable links и back/forward). Раньше state читался напрямую из
  // useSearchParams через useMemo, но в App Router router.replace не всегда
  // успевает обновить useSearchParams к моменту следующего рендера — между
  // setSort и refetch оставалась гонка, и fetch уходил со старым sortBy
  // (см. Next.js issue #49426).
  //
  // useState с инициализатором — initializer выполняется ровно один раз при
  // mount и захватывает текущее значение searchParams. Дальше state живёт
  // независимо. Sync-effect ниже обновляет state, если URL изменился извне
  // (back/forward, открытие из закладки, paste URL).
  const parsePage = (sp: URLSearchParams) => {
    const raw = Number.parseInt(sp.get("page") ?? "1", 10)
    return Number.isFinite(raw) && raw > 0 ? raw : 1
  }
  const parsePageSize = (sp: URLSearchParams): PageSize => {
    const raw = Number.parseInt(sp.get("pageSize") ?? "20", 10)
    return (PAGINATED_PAGE_SIZES as readonly number[]).includes(raw) ? (raw as PageSize) : 20
  }
  const parseSortBy = (sp: URLSearchParams): PaginatedSortKey => {
    const raw = sp.get("sortBy")
    return raw && (PAGINATED_SORT_KEYS as readonly string[]).includes(raw)
      ? (raw as PaginatedSortKey)
      : "createdAt"
  }
  const parseOrder = (sp: URLSearchParams): "asc" | "desc" =>
    sp.get("order") === "asc" ? "asc" : "desc"

  const [page,     setPageState]     = useState<number>(()        => parsePage(searchParams))
  const [pageSize, setPageSizeState] = useState<PageSize>(()      => parsePageSize(searchParams))
  const [sortBy,   setSortByState]   = useState<PaginatedSortKey>(() => parseSortBy(searchParams))
  const [order,    setOrderState]    = useState<"asc" | "desc">(() => parseOrder(searchParams))

  // Sync state ← URL: срабатывает на внешние навигации (back/forward, paste URL).
  // Для собственных мутаций через setPage/setSort/setPageSize эффект тоже
  // запустится после router.replace, но прочитает те же значения, что уже в
  // state, и пропустит setState благодаря guard'ам — никакого loop'а.
  const searchParamsKey = searchParams.toString()
  useEffect(() => {
    const nextPage     = parsePage(searchParams)
    const nextPageSize = parsePageSize(searchParams)
    const nextSortBy   = parseSortBy(searchParams)
    const nextOrder    = parseOrder(searchParams)
    if (nextPage     !== page)     setPageState(nextPage)
    if (nextPageSize !== pageSize) setPageSizeState(nextPageSize)
    if (nextSortBy   !== sortBy)   setSortByState(nextSortBy)
    if (nextOrder    !== order)    setOrderState(nextOrder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsKey])

  const [candidates, setCandidates] = useState<ApiCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Стабильная сериализация фильтров для зависимостей useEffect.
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters])
  const stageKey = useMemo(() => (stageFilter ?? []).join(","), [stageFilter])

  const refetch = useCallback(async () => {
    if (!vacancyId) {
      setCandidates([]); setTotal(0); setTotalPages(1)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        vacancyId,
        page:     String(page),
        pageSize: String(pageSize),
        sortBy,
        order,
      })
      if (stageFilter && stageFilter.length > 0) {
        params.set("stage", stageFilter.join(","))
      }
      if (filters) {
        if (typeof filters.minAge === "number" && filters.minAge > 18)       params.set("minAge", String(filters.minAge))
        if (typeof filters.maxAge === "number" && filters.maxAge < 65)       params.set("maxAge", String(filters.maxAge))
        if (typeof filters.minExperience === "number" && filters.minExperience > 0)   params.set("minExperience", String(filters.minExperience))
        if (typeof filters.maxExperience === "number" && filters.maxExperience < 20)  params.set("maxExperience", String(filters.maxExperience))
        if (filters.workFormats?.length)      params.set("workFormat", filters.workFormats.join(","))
        if (filters.educationLevels?.length)  params.set("educationLevel", filters.educationLevels.join(","))
        if (filters.languages?.length)        params.set("languages", filters.languages.join(","))
        if (filters.keySkills?.length)        params.set("keySkills", filters.keySkills.join(","))
        if (filters.industries?.length)       params.set("industry", filters.industries.join(","))
        if (filters.relocationReady === true)    params.set("relocationReady", "true")
        if (filters.relocationReady === false)   params.set("relocationReady", "false")
        if (filters.businessTripsReady === true)  params.set("businessTripsReady", "true")
        if (filters.businessTripsReady === false) params.set("businessTripsReady", "false")
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
        if (filters.dateTo)   params.set("dateTo", filters.dateTo)
        if (typeof filters.salaryMin === "number" && filters.salaryMin > 0) params.set("salaryMin", String(filters.salaryMin))
        if (typeof filters.salaryMax === "number" && filters.salaryMax > 0 && filters.salaryMax < 250000) params.set("salaryMax", String(filters.salaryMax))
        if (filters.sources?.length) params.set("sources", filters.sources.join(","))
        if (filters.cities?.length)  params.set("cities", filters.cities.join(","))
        if (typeof filters.scoreMin === "number" && filters.scoreMin > 0) params.set("scoreMin", String(filters.scoreMin))
        if (typeof filters.scoreMinResume === "number" && filters.scoreMinResume > 0) params.set("scoreMinResume", String(filters.scoreMinResume))
        if (typeof filters.scoreMinAnketa === "number" && filters.scoreMinAnketa > 0) params.set("scoreMinAnketa", String(filters.scoreMinAnketa))
        if (typeof filters.scoreMinTest === "number" && filters.scoreMinTest > 0) params.set("scoreMinTest", String(filters.scoreMinTest))
        if (filters.hideRejected) params.set("excludeRejected", "true")
        if (filters.hideNoSalary) params.set("hideNoSalary", "true")
        if (filters.activeNow) params.set("activeNow", "true")
        if (filters.search && filters.search.trim()) params.set("search", filters.search.trim())
        if (filters.anketaFilled) params.set("anketaFilled", filters.anketaFilled)
        if (filters.demoAnswered) params.set("demoAnswered", "1")
        if (filters.secondDemoPassed) params.set("secondDemoPassed", "1")
        if (filters.ctaClicked) params.set("ctaClicked", "1")
        if (filters.hhPublication) params.set("hhPublication", filters.hhPublication)
        if (filters.reviewQueue) params.set("reviewQueue", "true")
        // demoProgress в paginated режиме теперь применяется на сервере через
        // SQL (см. route.ts: pre-fetch demoTotalBlocks → SQL WHERE с COUNT
        // подзапросом). count(*) корректен — фильтр в WHERE, а не post-fetch.
        if (filters.demoProgress?.length) params.set("demoProgress", filters.demoProgress.join(","))
      }

      const res = await fetch(`/api/modules/hr/candidates?${params.toString()}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as PaginatedResponse
      setCandidates(data.candidates ?? [])
      setTotal(data.total ?? 0)
      setTotalPages(Math.max(1, data.totalPages ?? 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки кандидатов")
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacancyId, page, pageSize, sortBy, order, stageKey, filtersKey])

  useEffect(() => { refetch() }, [refetch])

  // ── URL mutations ─────────────────────────────────────────────────────────
  // Используем replace (не push) — пагинация не должна засорять историю.
  // scroll: false — чтобы не прыгать к началу страницы при смене страницы.
  const writeUrl = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const setPage = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, Math.floor(p)))
    setPageState(clamped)
    writeUrl({ page: clamped === 1 ? null : String(clamped) })
  }, [writeUrl, totalPages])

  const setPageSize = useCallback((size: number) => {
    const safe: PageSize = (PAGINATED_PAGE_SIZES as readonly number[]).includes(size)
      ? (size as PageSize)
      : 20
    // При смене размера страницы — откатываем на первую: позиция текущей
    // страницы становится бессмысленной (record 21 на pageSize=20 → page 2,
    // а на pageSize=50 → page 1).
    setPageSizeState(safe)
    setPageState(1)
    writeUrl({ pageSize: safe === 20 ? null : String(safe), page: null })
  }, [writeUrl])

  const setSort = useCallback((key: PaginatedSortKey, dir?: "asc" | "desc") => {
    const nextDir: "asc" | "desc" =
      dir ?? (sortBy === key && order === "desc" ? "asc" : "desc")
    setSortByState(key)
    setOrderState(nextDir)
    setPageState(1)
    // Всегда пишем sortBy в URL, даже если key="createdAt" (мапится на
    // колонку «Дата отклика»). Раньше тут был спец-кейс sortBy:null для
    // createdAt → effectiveListSort читал URL и при отсутствии sortBy
    // возвращал null → стрелка не появлялась на «Дате».
    // sort:null — чистим legacy-параметр ?sort в том же router.replace,
    // чтобы не было второго конкурирующего writeUrl, затирающего sortBy.
    writeUrl({
      sortBy: key,
      order:  nextDir === "desc" ? null : nextDir,
      page:   null,
      sort:   null,
    })
  }, [writeUrl, sortBy, order])

  // Сброс сортировки в дефолт (createdAt desc) + чистка URL (?sortBy/?order).
  // Используется 3-м кликом по заголовку колонки в ListView для индикации
  // «нет активной сортировки» (стрелка скрыта, данные грузятся в дефолте).
  const clearSort = useCallback(() => {
    setSortByState("createdAt")
    setOrderState("desc")
    setPageState(1)
    writeUrl({ sortBy: null, order: null, page: null, sort: null })
  }, [writeUrl])

  // ── Mutations (повторяют useCandidates — но обновляют локальный state) ────
  const updateStage = useCallback(async (
    candidateId: string,
    stage: string,
    opts?: { messageOverride?: string; interviewMode?: "phone" | "zoom" | "office" },
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          ...(opts?.messageOverride ? { messageOverride: opts.messageOverride } : {}),
          ...(opts?.interviewMode ? { interviewMode: opts.interviewMode } : {}),
        }),
      })
      if (!res.ok) return false
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, stage } : c))
      return true
    } catch { return false }
  }, [])

  const toggleFavorite = useCallback(async (candidateId: string, isFavorite: boolean): Promise<boolean> => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, isFavorite } : c))
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      })
      if (!res.ok) {
        setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c))
        return false
      }
      return true
    } catch {
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c))
      return false
    }
  }, [])

  return {
    candidates,
    total,
    page,
    pageSize,
    totalPages,
    sortBy,
    order,
    isLoading,
    error,
    setPage,
    setPageSize,
    setSort,
    clearSort,
    refetch,
    updateStage,
    toggleFavorite,
  }
}
