"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle2, AlertTriangle, XCircle, Sparkles, ChevronDown, ChevronUp,
  Loader2, RefreshCw, Bot, X, Plus, TrendingUp, Lightbulb,
} from "lucide-react"
import { mergeSkills, hasSkill } from "@/lib/skills/normalize"
import { formatSalary } from "@/lib/salary-benchmarks"
import { scoreVacancyTitle } from "@/lib/vacancy-title-scorer"
import { analyzeMotivation } from "@/lib/motivation-analyzer"

// ── Types ────────────────────────────────────────────────────────────────────

interface SectionAnalysis {
  id: string
  status: "ok" | "warning" | "error"
  title: string
  message: string
  priority: number
}

interface SalaryAnalysis {
  marketMedian: number
  previousMedian: number
  yoyGrowth: number
  period: string
  currentAssessment: string
  recommendedRange: { min: number; max: number }
  impactNote: string | null
  widthWarning: string | null
  responseNote: string | null
}

interface Suggestions {
  titles: string[]
  skills: string[]
  stopFactors: string[]
  duties: string
  requirements: string
}

interface AdvisorResult {
  score: number
  scoreLabel: string
  sections: SectionAnalysis[]
  contextTip?: string | null
  suggestions?: Suggestions
  salaryAnalysis?: SalaryAnalysis
}

interface VacancyAdvisorProps {
  vacancyId?: string
  vacancyData: Record<string, unknown>
  companyDescription?: string
  focusedField?: string
  /** P0-28: предварительно прогретый кеш-результат — если родитель уже
   *  загрузил его из БД, можем показать без AI-запроса. */
  initialResult?: AdvisorResult | null
  initialAnalyzedAt?: string | null
  onScrollToSection?: (sectionId: string) => void
  onApplySuggestion?: (field: string, value: unknown) => void
  onScoreChange?: (score: { score: number; label: string }) => void
}

// ── Section ID to anketa section mapping ─────────────────────────────────────

const SECTION_MAP: Record<string, string> = {
  title: "section-title",
  salary: "section-3",
  responsibilities: "section-4",
  requirements: "section-4",
  skills: "section-5",
  stopFactors: "section-5",
  conditions: "section-4",
  company: "section-1",
}

const AI_SCREENING_FIELDS = new Set(["responsibilities", "requirements", "skills", "stopFactors"])

// ── Static section tips (instant, no AI call) ────────────────────────────────

const SECTION_TIPS: Record<string, { icon: string; text: string }> = {
  title: {
    icon: "✏️",
    text: "Хорошее название — конкретное и без шаблонных слов вроде «динамичный» или «перспективный». Укажите специализацию и уровень: «Frontend-разработчик (React, middle)» — лучше чем «Разработчик».",
  },
  salary: {
    icon: "💰",
    text: "Вакансии с указанной вилкой зарплат получают значительно больше откликов. Если указываете «до», оставляйте реалистичный максимум — завышенный потолок снижает конверсию из отклика в оффер. Укажите частоту выплат (еженедельно/раз в месяц) — это влияет на анализ мотивации.",
  },
  responsibilities: {
    icon: "📋",
    text: "Пишите обязанности от глагола действия: «Развивать клиентскую базу» лучше, чем «Работа с клиентами». Ограничьтесь 5–8 пунктами — длинный список отпугивает кандидатов. Первые 2–3 пункта — самые важные, их видят раньше остальных.",
  },
  requirements: {
    icon: "🎯",
    text: "Разделите требования на обязательные и желательные. Не копируйте требования из других вакансий — добавляйте только то, что реально нужно. Длинный список требований при скромной зарплате — главная причина низкого отклика.",
  },
  skills: {
    icon: "⚡",
    text: "Добавьте 3–5 ключевых hard skill и 1–2 soft skill. Слишком длинный список «стоп-скиллов» сужает воронку. AI-скоринг проверяет навыки из резюме — чем точнее список, тем точнее отбор кандидатов.",
  },
  stopFactors: {
    icon: "🚫",
    text: "Стоп-факторы — жёсткие условия вакансии: город, формат, опыт, документы. Активируйте только требования, которые действительно критичны и не обсуждаются — каждый лишний фильтр заметно сужает поток откликов.",
  },
  conditions: {
    icon: "🏢",
    text: "Конкретные условия повышают доверие: напишите адрес офиса, формат работы (удалённо/офис/гибрид), график (5/2, сменный и т.д.), тип занятости и оформление. Бонусы и льготы лучше перечислить списком — они напрямую влияют на анализ мотивации в этой панели.",
  },
  company: {
    icon: "🏷️",
    text: "Раздел «О компании» влияет на первое впечатление. Укажите сферу, размер команды и что делает компанию особенной. Кандидаты с сильной мотивацией читают этот раздел — он помогает привлечь «правильных» людей.",
  },
}

// ── Experience insight data ─────────────────────────────────────────────────
// Только качественные советы — без выдуманных процентов.

const EXPERIENCE_INSIGHTS: Record<string, { label: string; tip: string }> = {
  "1-3": { label: "1-3 года", tip: "Широкий пул кандидатов, но потребуется более тщательный скрининг. Подходит для junior/middle позиций." },
  "3-5": { label: "3-5 лет", tip: "Оптимальный баланс: достаточно кандидатов с реальным опытом. Рекомендуемый диапазон для большинства ролей." },
  "5+": { label: "5+ лет", tip: "Узкий пул кандидатов, но более высокий уровень. Для senior/lead позиций — рассмотрите активный поиск и хедхантинг." },
}

// ── Component ────────────────────────────────────────────────────────────────

export function VacancyAdvisor({ vacancyId, vacancyData, companyDescription, focusedField, initialResult, initialAnalyzedAt, onScrollToSection, onApplySuggestion, onScoreChange }: VacancyAdvisorProps) {
  const [result, setResult] = useState<AdvisorResult | null>(initialResult ?? null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(initialAnalyzedAt ?? null)
  const [cached, setCached] = useState<boolean>(Boolean(initialResult))
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const lastDataHash = useRef("")
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Hash vacancy data to detect changes
  const dataHash = useMemo(() => {
    try {
      return JSON.stringify({
        t: vacancyData.vacancyTitle,
        sf: vacancyData.salaryFrom,
        st: vacancyData.salaryTo,
        r: vacancyData.responsibilities,
        rq: vacancyData.requirements,
        rs: (vacancyData.requiredSkills as string[])?.length,
        ds: (vacancyData.desiredSkills as string[])?.length,
        us: (vacancyData.unacceptableSkills as string[])?.length,
        c: (vacancyData.conditions as string[])?.length,
        cc: (vacancyData.conditionsCustom as string[])?.length,
        sf2: (vacancyData.stopFactors as Array<{ enabled: boolean }>)?.filter(f => f.enabled).length,
        pc: vacancyData.positionCategory,
        em: vacancyData.experienceMin,
      })
    } catch {
      return ""
    }
  }, [vacancyData])

  const fetchAnalysis = useCallback(async (signal?: AbortSignal, opts?: { force?: boolean }) => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/vacancy-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyId,
          vacancyData,
          companyDescription: companyDescription || "",
          focusedField: focusedField || "",
          force: Boolean(opts?.force),
        }),
        signal,
      })
      if (!res.ok) {
        if (res.status === 429) return // silently skip rate-limited
        throw new Error("API error")
      }
      const data = await res.json() as AdvisorResult & { _cached?: boolean; _analyzedAt?: string | null }
      const { _cached, _analyzedAt, ...rest } = data
      setResult(rest)
      setCached(Boolean(_cached))
      setAnalyzedAt(_analyzedAt ?? new Date().toISOString())
      lastDataHash.current = dataHash
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      // Keep previous result on error
    } finally {
      setLoading(false)
    }
  }, [vacancyId, vacancyData, companyDescription, focusedField, dataHash])

  // P0-28: focused-field-driven запросы оставляем (контекстный совет к
  // конкретному инпуту), но НЕ кэшируются — сервер вернёт fresh fallback.
  // Дебаунс срабатывает только при изменении dataHash относительно
  // последнего сохранённого, или если фокус сменился.
  useEffect(() => {
    if (dataHash === lastDataHash.current && !focusedField) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (abortRef.current) abortRef.current.abort()

    debounceTimer.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      fetchAnalysis(controller.signal)
    }, 1500)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [dataHash, focusedField, fetchAnalysis])

  // P0-28: безусловный initial fetch удалён. Если есть initialResult из
  // БД-кеша — показываем сразу без вызова Claude. Если нет кеша —
  // первый debounced fetch выше (на любое реальное изменение dataHash)
  // запросит анализ и закеширует. Пока нет ни кеша, ни правок — пользователю
  // показываем "пусто, нажмите Обновить".
  useEffect(() => {
    if (!result && !initialResult && !loading && lastDataHash.current === "") {
      // Помечаем начальный dataHash, чтобы debounced effect не дёрнул AI
      // сразу же при первом mount'е. Если пользователь сразу что-то поменяет —
      // dataHash сдвинется, и анализ запустится.
      lastDataHash.current = dataHash
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Propagate score changes upward
  useEffect(() => {
    if (result && onScoreChange) {
      onScoreChange({ score: result.score, label: result.scoreLabel })
    }
  }, [result, onScoreChange])

  const handleSectionClick = (sectionId: string) => {
    const targetId = SECTION_MAP[sectionId]
    if (targetId && onScrollToSection) {
      onScrollToSection(targetId)
    } else if (targetId) {
      const el = document.getElementById(targetId)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleApply = (field: string, value: unknown) => {
    if (onApplySuggestion) onApplySuggestion(field, value)
  }

  const scoreColor = result
    ? result.score < 40 ? "text-red-500" : result.score < 70 ? "text-amber-500" : "text-emerald-500"
    : "text-muted-foreground"

  const progressColor = result
    ? result.score < 40 ? "[&>div]:bg-red-500" : result.score < 70 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"
    : ""

  // Detect experience level from stop factors
  const experienceLevel = useMemo(() => {
    const expFactor = (vacancyData.stopFactors as Array<{ id: string; enabled: boolean; value?: string }>)
      ?.find(f => f.id === "experience" && f.enabled)
    if (!expFactor?.value) return null
    const years = parseInt(expFactor.value)
    if (isNaN(years)) return null
    if (years <= 3) return "1-3"
    if (years <= 5) return "3-5"
    return "5+"
  }, [vacancyData.stopFactors])

  // ── Mobile button ──
  const mobileButton = (
    <div className="fixed bottom-4 right-4 z-50 lg:hidden">
      <Button
        onClick={() => setMobileOpen(true)}
        className="rounded-full shadow-lg gap-2 h-12 px-5"
        variant={result && result.score < 40 ? "destructive" : "default"}
        style={result && result.score >= 40 ? { backgroundColor: "var(--ai)", color: "var(--ai-foreground)" } : undefined}
      >
        <Sparkles className="w-4 h-4" />
        AI-подсказки {result ? `(${result.score}%)` : ""}
      </Button>
    </div>
  )

  // ── Mobile overlay ──
  const mobileOverlay = mobileOpen && (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-background border-t rounded-t-2xl overflow-y-auto p-4 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">AI-ассистент</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        {renderContent()}
      </div>
    </div>
  )

  const staticTip = focusedField ? SECTION_TIPS[focusedField] ?? null : null

  // ── Тематическая запись (одна карточка на тему) ───────────────────────────
  function renderThemeRow({
    icon,
    label,
    status,
    message,
    rightContent,
    isScreening = false,
    extra,
    onClick,
  }: {
    icon: string
    label: string
    status: "ok" | "warning" | "error" | "info"
    message?: string
    rightContent?: React.ReactNode
    isScreening?: boolean
    extra?: React.ReactNode
    onClick?: () => void
  }) {
    const isError = status === "error"
    const isWarning = status === "warning"

    const statusIcon = (status === "ok" || status === "info")
      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
      : status === "warning"
        ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />

    const rowClass = cn(
      "w-full text-left rounded-md border px-2.5 py-2 transition-colors",
      isError && "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20",
      isWarning && "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20",
      !isError && !isWarning && "border-border",
      onClick && "hover:bg-accent/50 cursor-pointer",
    )

    const inner = (
      <div className="flex items-start gap-2">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className={cn("text-sm font-medium leading-tight", isError && "text-red-700 dark:text-red-400")}>
              {icon} {label}
            </span>
            {rightContent}
          </div>
          {message && (
            <p className={cn("text-xs mt-0.5 leading-relaxed", isError ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
              {message}
            </p>
          )}
          {isScreening && status !== "ok" && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              настраивается в Портрете
            </span>
          )}
        </div>
      </div>
    )

    return (
      <div key={label} className="space-y-1">
        {onClick
          ? <button type="button" onClick={onClick} className={rowClass}>{inner}</button>
          : <div className={rowClass}>{inner}</div>
        }
        {extra}
      </div>
    )
  }

  function renderContent() {
    if (!result && loading) {
      return (
        <div className="space-y-3">
          {staticTip && (
            <div key={focusedField} className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5 shrink-0">{staticTip.icon}</span>
                <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">{staticTip.text}</p>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Анализирую анкету...</p>
          </div>
        </div>
      )
    }

    if (!result) {
      return (
        <div className="space-y-3">
          {staticTip && (
            <div key={focusedField} className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">{staticTip.icon}</span>
                <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">{staticTip.text}</p>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Bot className="w-8 h-8 text-muted-foreground" />
            <p className="text-xs text-muted-foreground px-4">Анализ ещё не запускался. Нажмите кнопку чтобы оценить вакансию.</p>
            <Button size="sm" variant="outline" onClick={() => fetchAnalysis(undefined, { force: true })} disabled={loading}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />Запустить анализ
            </Button>
          </div>
        </div>
      )
    }

    // ── Данные для тематических записей ──────────────────────────────────────
    const sectionById = Object.fromEntries(result.sections.map(s => [s.id, s]))

    // Название — совмещаем AI-секцию title с локальным scoreVacancyTitle
    const titleText = (vacancyData.vacancyTitle as string) || ""
    const titleAiSection = sectionById["title"]
    const salaryFromNum = parseInt(String(vacancyData.salaryFrom || "0").replace(/\s/g, "")) || 0
    const workFormats = (vacancyData.workFormats as string[]) || []
    const titleLocalScore = titleText ? scoreVacancyTitle(titleText, {
      format: workFormats[0],
      salaryMin: salaryFromNum,
    }) : null
    const titleStatus: "ok" | "warning" | "error" =
      titleAiSection?.status === "error" ? "error"
        : titleAiSection?.status === "warning" ? "warning"
          : (titleLocalScore && titleLocalScore.score < 40) ? "error"
            : (titleLocalScore && titleLocalScore.score < 60) ? "warning"
              : "ok"
    const titleMessage = titleAiSection?.message
      || (titleLocalScore ? titleLocalScore.checks.find(c => c.status !== "ok")?.text : undefined)
      || (titleStatus === "ok" ? "Название выглядит хорошо" : undefined)

    // Зарплата и мотивация
    const salaryMin = salaryFromNum
    const salaryMax = parseInt(String(vacancyData.salaryTo || "0").replace(/\s/g, "")) || 0
    const bonuses = (vacancyData.bonus as string) || ""
    const payFrequency = (vacancyData.payFrequency as string[]) || []
    const motivationResult = (salaryMin || salaryMax || bonuses)
      ? analyzeMotivation({ salaryMin: salaryMin || undefined, salaryMax: salaryMax || undefined, bonuses, payFrequency, category: (vacancyData.positionCategory as string) || "" })
      : null
    const salaryAiSection = sectionById["salary"]
    const salaryStatus: "ok" | "warning" | "error" | "info" =
      salaryAiSection?.status === "error" ? "error"
        : salaryAiSection?.status === "warning" ? "warning"
          : motivationResult && motivationResult.score < 40 ? "error"
            : motivationResult && motivationResult.score < 60 ? "warning"
              : "ok"
    const salaryMessage = salaryAiSection?.message
      || (motivationResult ? motivationResult.checks.find(c => c.status !== "ok")?.text : undefined)
      || (motivationResult && motivationResult.score >= 60 ? "Условия мотивации — хорошие" : undefined)

    // О компании
    const companyDesc = companyDescription || (vacancyData.companyDescription as string) || ""
    const companyAiSection = sectionById["company"]
    const companyStatus: "ok" | "warning" | "error" =
      companyAiSection?.status === "error" ? "error"
        : companyAiSection?.status === "warning" ? "warning"
          : !companyDesc ? "warning"
            : "ok"
    const companyMessage = companyAiSection?.message
      || (!companyDesc ? "Описание компании не заполнено" : "Описание заполнено — редактируется в «О компании»")

    // Остальные AI-секции
    const responsibilitiesSection = sectionById["responsibilities"]
    const requirementsSection = sectionById["requirements"]
    const skillsSection = sectionById["skills"]
    const stopFactorsSection = sectionById["stopFactors"]
    const conditionsSection = sectionById["conditions"]

    // Формат работы
    const hasRemote = workFormats.some(f => /удалён/i.test(f))
    const hasHybrid = workFormats.some(f => /гибрид/i.test(f))
    const formatMessage = workFormats.length === 0 ? undefined
      : hasRemote ? "Удалёнка: пул кандидатов шире — нет географических ограничений"
        : hasHybrid ? "Гибрид — компромисс: +30% к пулу vs офис"
          : "Офис сужает пул, но повышает контроль"

    // Опыт
    const expInsight = experienceLevel ? (EXPERIENCE_INSIGHTS[experienceLevel] || null) : null

    // Варианты названия (чипы)
    const titleSuggestions = result.suggestions?.titles || []

    // Бонусы для мотивации
    const bonusSuggestions = motivationResult?.suggestions || []

    return (
      <div className="space-y-2">
        {/* Шапка: балл + прогресс */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={cn("text-2xl font-bold tabular-nums", scoreColor)}>{result.score}%</span>
            <Badge variant={result.score < 40 ? "destructive" : result.score < 70 ? "secondary" : "default"} className="text-xs">
              {result.scoreLabel}
            </Badge>
          </div>
          <Progress value={result.score} className={cn("h-2", progressColor)} />
          <p className="text-xs text-muted-foreground">
            Анкета заполнена — {result.score}% · {result.scoreLabel.toLowerCase()}
          </p>
        </div>

        {/* Статический контекстный подсказ */}
        {staticTip && (
          <div key={focusedField} className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5 shrink-0">{staticTip.icon}</span>
              <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">{staticTip.text}</p>
            </div>
          </div>
        )}

        {/* AI context tip */}
        {result.contextTip && !staticTip && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 animate-in fade-in duration-300">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">{result.contextTip}</p>
            </div>
          </div>
        )}

        {/* ── ТЕМАТИЧЕСКИЕ ЗАПИСИ ─────────────────────────────────────────── */}
        <div className="space-y-1.5">

          {/* 1. Название */}
          {titleText && renderThemeRow({
            icon: "✏️",
            label: "Название",
            status: titleStatus,
            message: titleMessage,
            onClick: () => handleSectionClick("title"),
            extra: titleSuggestions.length > 0 && onApplySuggestion ? (
              <div className="pl-2 flex flex-wrap gap-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground self-center">Варианты:</span>
                {titleSuggestions.map((s, i) => {
                  const sc = scoreVacancyTitle(s, { format: workFormats[0], salaryMin })
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleApply("vacancyTitle", s)}
                      className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                      title={`Оценка: ${sc.score}/100`}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            ) : undefined,
          })}

          {/* 2. О компании */}
          {renderThemeRow({
            icon: "🏢",
            label: "О компании",
            status: companyStatus,
            message: companyMessage,
            onClick: !companyDesc
              ? () => { window.open("/settings/company", "_blank") }
              : () => handleSectionClick("company"),
          })}

          {/* 3. Зарплата и мотивация */}
          {renderThemeRow({
            icon: "💰",
            label: "Зарплата и мотивация",
            status: salaryStatus,
            message: salaryMessage,
            rightContent: motivationResult ? (
              <span className={cn("text-xs font-bold tabular-nums shrink-0",
                motivationResult.score >= 60 ? "text-emerald-600 dark:text-emerald-400"
                  : motivationResult.score >= 40 ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
              )}>
                {motivationResult.score}/100
              </span>
            ) : undefined,
            onClick: () => handleSectionClick("salary"),
            extra: bonusSuggestions.length > 0 && onApplySuggestion ? (
              <div className="pl-2 space-y-0.5">
                <span className="text-[10px] text-muted-foreground">Добавить в бонусы:</span>
                {bonusSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const current = bonuses
                      const newText = current ? `${current}\n• ${s}` : `• ${s}`
                      onApplySuggestion!("bonus", newText)
                    }}
                    className="block w-full text-left text-[10px] px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors text-amber-800 dark:text-amber-200 underline decoration-dotted underline-offset-2"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ) : undefined,
          })}

          {/* 4. Обязанности */}
          {responsibilitiesSection && renderThemeRow({
            icon: "📋",
            label: responsibilitiesSection.title || "Обязанности",
            status: responsibilitiesSection.status,
            message: responsibilitiesSection.message,
            isScreening: AI_SCREENING_FIELDS.has("responsibilities"),
            onClick: !AI_SCREENING_FIELDS.has("responsibilities")
              ? () => handleSectionClick("responsibilities")
              : undefined,
          })}

          {/* 5. Требования */}
          {requirementsSection && renderThemeRow({
            icon: "🎯",
            label: requirementsSection.title || "Требования",
            status: requirementsSection.status,
            message: requirementsSection.message,
            isScreening: AI_SCREENING_FIELDS.has("requirements"),
            onClick: !AI_SCREENING_FIELDS.has("requirements")
              ? () => handleSectionClick("requirements")
              : undefined,
          })}

          {/* 6. Навыки */}
          {skillsSection && renderThemeRow({
            icon: "⚡",
            label: skillsSection.title || "Навыки",
            status: skillsSection.status,
            message: skillsSection.message,
            isScreening: AI_SCREENING_FIELDS.has("skills"),
            onClick: !AI_SCREENING_FIELDS.has("skills")
              ? () => handleSectionClick("skills")
              : undefined,
          })}

          {/* 7. Условия */}
          {conditionsSection && renderThemeRow({
            icon: "🏢",
            label: conditionsSection.title || "Условия",
            status: conditionsSection.status,
            message: conditionsSection.message,
            onClick: () => handleSectionClick("conditions"),
          })}

          {/* 8. Стоп-факторы — оценка кандидата настраивается в Портрете */}
          {stopFactorsSection && renderThemeRow({
            icon: "🚫",
            label: stopFactorsSection.title || "Стоп-факторы",
            status: stopFactorsSection.status,
            message: stopFactorsSection.message,
            isScreening: true,
            onClick: undefined,
          })}

          {/* Info: Формат работы */}
          {workFormats.length > 0 && renderThemeRow({
            icon: "🔄",
            label: `Формат: ${workFormats.join(", ")}`,
            status: "ok",
            message: formatMessage,
          })}

          {/* Info: Опыт */}
          {expInsight && renderThemeRow({
            icon: "📅",
            label: `Опыт: ${expInsight.label}`,
            status: "ok",
            message: expInsight.tip,
          })}

        </div>

        {/* Аналитика зарплат — компактная карточка */}
        {result.salaryAnalysis && (
          <SalaryAnalysisCard analysis={result.salaryAnalysis} />
        )}

        {/* Навыки для hh + шаблоны обязанностей/требований */}
        {result.suggestions && onApplySuggestion && (
          <SuggestionsPanel suggestions={result.suggestions} onApply={handleApply} vacancyData={vacancyData} />
        )}

        {/* Лучшее время публикации (статистика — в конце) */}
        <BestPublishTimeCard vacancyId={vacancyId} city={(vacancyData.positionCity as string) || (vacancyData.companyCity as string) || ""} />

        {/* P0-28: дата последнего анализа + force-refresh. */}
        <div className="pt-1 space-y-1">
          {analyzedAt && (
            <p className="text-[10px] text-muted-foreground text-center">
              {cached ? "Из кеша · " : ""}
              Проанализировано {formatDistanceToNow(new Date(analyzedAt), { addSuffix: true, locale: ru })}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-7 text-muted-foreground"
            onClick={() => fetchAnalysis(undefined, { force: true })}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
            Переанализировать (тратит токены)
          </Button>
        </div>
      </div>
    )
  }

  // ── Desktop panel ──
  return (
    <>
      {/* Desktop sidebar. self-stretch + h-full: колонка тянется на всю высоту
          строки (родитель — flex items-start), чтобы левый разделитель border-l
          шёл во всю высоту анкеты, а не обрывался на футере «Переанализировать». */}
      <div className="hidden lg:block flex-[1] min-w-[340px] self-stretch">
        <div className="space-y-3 border-l pl-4 h-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[var(--ai)]" />
              <span className="text-sm font-semibold text-[var(--ai)]">AI-ассистент</span>
              {loading && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </Button>
          </div>

          {!collapsed && renderContent()}
        </div>
      </div>

      {/* Mobile */}
      {!mobileOpen && mobileButton}
      {mobileOverlay}
    </>
  )
}

// ── AI Estimate Badge ───────────────────────────────────────────────────────
// Метка «Оценка AI» для блоков, которые основаны на статичном справочнике
// (захардкоженные данные), а не на реальных API-запросах.

function AIEstimateBadge() {
  return (
    <span
      title="Данные основаны на агрегированном справочнике (hh.ru, DreamJob, Forbes, ГородРабот — Q1 2026), а не на реальном API-запросе к hh в реальном времени"
      className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50 cursor-help select-none shrink-0"
    >
      Оценка AI
    </span>
  )
}

// ── Salary Analysis Card ────────────────────────────────────────────────────

function SalaryAnalysisCard({ analysis }: { analysis: SalaryAnalysis }) {
  const assessmentColor = analysis.currentAssessment.includes("ниже")
    ? "text-red-600 dark:text-red-400"
    : analysis.currentAssessment === "в рынке"
      ? "text-emerald-600 dark:text-emerald-400"
      : analysis.currentAssessment.includes("выше")
        ? "text-blue-600 dark:text-blue-400"
        : "text-muted-foreground"

  // Мини-шкала: позиция вилки относительно рынка
  const rangeMin = analysis.recommendedRange.min
  const rangeMax = analysis.recommendedRange.max
  const median = analysis.marketMedian
  const scaleWidth = rangeMax - rangeMin * 0.5
  const medianPos = Math.min(95, Math.max(5, ((median - rangeMin * 0.5) / scaleWidth) * 100))

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Аналитика зарплат</span>
        <AIEstimateBadge />
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Медиана рынка</span>
          <span className="text-xs font-semibold">{formatSalary(analysis.marketMedian)}</span>
        </div>
        {analysis.yoyGrowth > 0 && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {analysis.period} — рост +{analysis.yoyGrowth}% за год (было {formatSalary(analysis.previousMedian)} в Q1 2025)
          </p>
        )}
        {/* Мини-шкала */}
        <div className="relative h-3 bg-muted rounded-full overflow-hidden mt-1">
          <div className="absolute h-full bg-emerald-200 dark:bg-emerald-900/40 rounded-full" style={{ left: `${Math.max(0, ((rangeMin - rangeMin * 0.5) / scaleWidth) * 100)}%`, width: `${((rangeMax - rangeMin) / scaleWidth) * 100}%` }} />
          <div className="absolute top-0 h-full w-0.5 bg-primary" style={{ left: `${medianPos}%` }} title={`Медиана: ${formatSalary(median)}`} />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground -mt-0.5">
          <span>{formatSalary(rangeMin)}</span>
          <span>медиана</span>
          <span>{formatSalary(rangeMax)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Ваша вилка</span>
          <span className={cn("text-xs font-semibold", assessmentColor)}>{analysis.currentAssessment}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Рекомендуемая</span>
          <span className="text-xs font-medium">
            {formatSalary(analysis.recommendedRange.min)} – {formatSalary(analysis.recommendedRange.max)}
          </span>
        </div>
      </div>
      {analysis.widthWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">⚠️ {analysis.widthWarning}</p>
      )}
      {analysis.responseNote && (
        <p className="text-xs text-muted-foreground leading-relaxed">{analysis.responseNote}</p>
      )}
      {analysis.impactNote && (
        <p className="text-xs text-muted-foreground leading-relaxed">📈 {analysis.impactNote}</p>
      )}
      {analysis.currentAssessment === "не указана" && (
        <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">Вакансии без указанной зарплаты получают значительно меньше откликов</p>
      )}
      <p className="text-[10px] text-muted-foreground leading-relaxed border-t pt-2 mt-1">
        Справочные данные: hh.ru, DreamJob, Forbes, ГородРабот, CNews — {analysis.period}. Не являются гарантией результата.
      </p>
    </div>
  )
}

// ── Best Publish Time Card ──────────────────────────────────────────────────
// Лучшее время публикации по откликам компании (GET /best-publish-time).
// Эндпоинт агрегирует hh_responses по дню недели и часу (МСК). Честно помечаем,
// что это статистика откликов компании, а не рыночный бенчмарк hh.
interface PublishTimeData {
  enough: boolean
  total: number
  topDays?: { name: string; pct: number }[]
  topHours?: { range: string; pct: number }[]
}

function BestPublishTimeCard({ vacancyId, city }: { vacancyId?: string; city?: string }) {
  const [data, setData] = useState<PublishTimeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vacancyId) { setLoading(false); return }
    let alive = true
    fetch(`/api/modules/hr/vacancies/${vacancyId}/best-publish-time`)
      .then(r => r.ok ? r.json() : null)
      .then((d: PublishTimeData | null) => { if (alive) setData(d) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vacancyId])

  if (loading || !data) return null
  const cityLabel = city?.trim() ? `, ${city.trim()}` : ""

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-semibold">🕐 Лучшее время публикации</p>
      {!data.enough ? (
        <p className="text-xs text-muted-foreground">
          Пока мало данных для рекомендации ({data.total} откликов). Накопится статистика — покажем, в какие дни и часы кандидаты откликаются активнее.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {data.topDays && data.topDays.length > 0 && (
              <div className="flex items-baseline gap-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Дни:</span>
                <span className="font-medium">{data.topDays.map(d => `${d.name} (${d.pct}%)`).join(", ")}</span>
              </div>
            )}
            {data.topHours && data.topHours.length > 0 && (
              <div className="flex items-baseline gap-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Часы:</span>
                <span className="font-medium">{data.topHours.map(h => `${h.range} (${h.pct}%)`).join(", ")}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            По откликам вашей компании (время МСК{cityLabel ? ` · вакансия${cityLabel}` : ""}). Опирается на {data.total} откликов.
          </p>
        </>
      )}
    </div>
  )
}

// ── Suggestions Panel ───────────────────────────────────────────────────────
// Группы предложений:
//   1. «Навыки для hh» (skills) — все навыки можно добавить одним кликом
// Шаблоны обязанностей/требований — без изменений.
// Оценка кандидата (stopFactors → unacceptableSkills) убрана: живёт во вкладке «Портрет».

function SuggestionsPanel({ suggestions, onApply, vacancyData }: {
  suggestions: Suggestions
  onApply: (field: string, value: unknown) => void
  vacancyData: Record<string, unknown>
}) {
  const hasSkills = suggestions.skills.length > 0
  const hasDuties = !!suggestions.duties
  const hasRequirements = !!suggestions.requirements

  if (!hasSkills && !hasDuties && !hasRequirements) return null

  return (
    <div className="space-y-2 pt-1">
      {/* ── Группа 1: Навыки для hh ── без лимита */}
      {hasSkills && (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Навыки для hh</p>
          <div className="rounded-lg border p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Рекомендуемые навыки</span>
              <button
                onClick={() => {
                  const current = (vacancyData.requiredSkills as string[]) || []
                  // mergeSkills дедупит по канону (регистр/пробелы/дефисы) — без дублей.
                  onApply("requiredSkills", mergeSkills(current, suggestions.skills))
                }}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Добавить все
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {suggestions.skills.map(skill => {
                const alreadyHas = hasSkill((vacancyData.requiredSkills as string[]) || [], skill)
                  || hasSkill((vacancyData.desiredSkills as string[]) || [], skill)
                return (
                  <button
                    key={skill}
                    disabled={alreadyHas}
                    onClick={() => {
                      const current = (vacancyData.requiredSkills as string[]) || []
                      onApply("requiredSkills", mergeSkills(current, [skill]))
                    }}
                    className={cn(
                      "text-[11px] px-1.5 py-0.5 rounded border transition-colors",
                      alreadyHas
                        ? "bg-muted text-muted-foreground border-border cursor-default line-through"
                        : "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 cursor-pointer"
                    )}
                  >
                    {skill}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}


      {/* Duties template */}
      {hasDuties && (
        <div className="rounded-lg border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Шаблон обязанностей</span>
            <button
              onClick={() => onApply("responsibilities", suggestions.duties)}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Вставить
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-4">
            {suggestions.duties}
          </p>
        </div>
      )}

      {/* Requirements template */}
      {hasRequirements && (
        <div className="rounded-lg border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Шаблон требований</span>
            <button
              onClick={() => onApply("requirements", suggestions.requirements)}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Вставить
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-4">
            {suggestions.requirements}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Section card ─────────────────────────────────────────────────────────────
// Оставлен для совместимости (не используется в основном рендере, но может
// импортироваться снаружи или понадобиться в будущем).

function SectionCard({ section, onClick, compact }: {
  section: SectionAnalysis
  onClick: () => void
  compact?: boolean
}) {
  const isAiField = AI_SCREENING_FIELDS.has(section.id)

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-2.5 transition-colors hover:bg-accent/50 cursor-pointer",
        section.status === "error" && "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20",
        section.status === "warning" && "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20",
        section.status === "ok" && "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        {section.status === "ok" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        ) : section.status === "warning" ? (
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{section.title}</span>
            {isAiField && section.status !== "ok" && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">AI-скрининг</Badge>
            )}
          </div>
          {!compact && section.status !== "ok" && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{section.message}</p>
          )}
        </div>
      </div>
    </button>
  )
}
