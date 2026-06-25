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

// Зона советчика:
//   'vacancy'  — секции про поля страницы «Вакансия» (название, зарплата,
//                обязанности, требования, условия, описание компании).
//   'portrait' — секции про «Портрет» / AI-скоринг (стоп-факторы,
//                разделение требований, навыки must/nice).
//   undefined  — все секции (поведение до разделения, обратная совместимость).
export type AdvisorZone = "vacancy" | "portrait"

// Какие id секций относятся к зоне Портрета.
const PORTRAIT_SECTION_IDS = new Set(["stopFactors", "skills"])

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
  /** Фильтр зоны: если передан — показываются только секции этой зоны. */
  zone?: AdvisorZone
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

export function VacancyAdvisor({ vacancyId, vacancyData, companyDescription, focusedField, initialResult, initialAnalyzedAt, onScrollToSection, onApplySuggestion, onScoreChange, zone }: VacancyAdvisorProps) {
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

  // Темы с собственной карточкой выше (название/зарплата/компания) НЕ дублируем
  // в списках «Критично/Рекомендации» — иначе одно и то же оценивается дважды
  // и противоречит (название «90/100 🟢» сверху и «перегружено 🟠» снизу).
  const CARDED_TOPICS = new Set(["title", "salary"]) // эти темы — карточками выше, в нижних списках не дублируем

  // Фильтр зоны: в vacancy-зоне скрываем портретные секции, в portrait — наоборот.
  const zoneSections = (sections: SectionAnalysis[]) => {
    if (!zone) return sections
    if (zone === "portrait") return sections.filter(s => PORTRAIT_SECTION_IDS.has(s.id))
    // vacancy: скрываем портретные (они на вкладке Портрет)
    return sections.filter(s => !PORTRAIT_SECTION_IDS.has(s.id))
  }

  const errors = zoneSections(result?.sections.filter(s => s.status === "error" && !CARDED_TOPICS.has(s.id)) || [])
  const warnings = zoneSections(result?.sections.filter(s => s.status === "warning" && !CARDED_TOPICS.has(s.id)) || [])
  const oks = result?.sections.filter(s => s.status === "ok") || []

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

    return (
      <div className="space-y-3">
        {/* Заполненность анкеты — одна строка (% жирным+цветным, «средне» бейджем). Без
            большого дубль-числа и полосы: «насколько готово» живёт в «Готовности вакансии». */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-muted-foreground">Анкета заполнена —</span>
          <span className={cn("font-semibold tabular-nums", scoreColor)}>{result.score}%</span>
          <Badge variant={result.score < 40 ? "destructive" : result.score < 70 ? "secondary" : "default"} className="text-xs">
            {result.scoreLabel}
          </Badge>
        </div>

        {/* Static contextual tip (instant, no AI call) */}
        {staticTip && (
          <div key={focusedField} className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5 shrink-0">{staticTip.icon}</span>
              <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">{staticTip.text}</p>
            </div>
          </div>
        )}

        {/* AI context tip (from last analysis) */}
        {result.contextTip && !staticTip && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 animate-in fade-in duration-300">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">{result.contextTip}</p>
            </div>
          </div>
        )}

        {/* Title scoring + suggestions */}
        <TitleScoringCard
          title={(vacancyData.vacancyTitle as string) || ""}
          context={{
            format: (vacancyData.workFormats as string[])?.[0],
            salaryMin: parseInt(String(vacancyData.salaryFrom || "0").replace(/\s/g, "")) || 0,
          }}
          suggestions={result.suggestions?.titles || []}
          onApply={onApplySuggestion ? (t: string) => handleApply("vacancyTitle", t) : undefined}
        />

        {/* О компании — сразу под названием (как в форме: блок «Компания» идёт вверху) */}
        <CompanyDescriptionCard description={companyDescription || (vacancyData.companyDescription as string) || ""} />

        {/* 3. Формат работы */}
        <FormatCard workFormats={(vacancyData.workFormats as string[]) || []} />

        {/* 4. Опыт */}
        <ExperienceInsightCard level={experienceLevel || "3-5"} currentLevel={experienceLevel} />

        {/* 5. Зарплата и мотивация — объединено: рынок + балл + бонусы (была отдельная «Аналитика зарплат») */}
        <MotivationAnalysisCard
          salaryMin={parseInt(String(vacancyData.salaryFrom || "0").replace(/\s/g, "")) || 0}
          salaryMax={parseInt(String(vacancyData.salaryTo || "0").replace(/\s/g, "")) || 0}
          bonuses={(vacancyData.bonus as string) || ""}
          payFrequency={(vacancyData.payFrequency as string[]) || []}
          category={(vacancyData.positionCategory as string) || ""}
          salaryAnalysis={result.salaryAnalysis}
          onAppendBonus={onApplySuggestion ? (text: string) => {
            const current = (vacancyData.bonus as string) || ""
            const newText = current ? `${current}\n• ${text}` : `• ${text}`
            onApplySuggestion("bonus", newText)
          } : undefined}
        />

        {/* 6b. Лучшее время публикации — по откликам компании */}
        <BestPublishTimeCard vacancyId={vacancyId} city={(vacancyData.positionCity as string) || (vacancyData.companyCity as string) || ""} />

        {/* Sections: критичные и рекомендации — соответствуют секциям 4-5 (обязанности, требования, навыки, стоп-факторы) */}
        {errors.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Критично</p>
            {errors.map(s => (
              <SectionCard key={s.id} section={s} onClick={() => handleSectionClick(s.id)} />
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Рекомендации</p>
            {warnings.map(s => (
              <SectionCard key={s.id} section={s} onClick={() => handleSectionClick(s.id)} />
            ))}
          </div>
        )}

        {/* Clickable suggestions — рекомендуемые навыки, стоп-факторы, шаблоны */}
        {result.suggestions && onApplySuggestion && (
          <SuggestionsPanel suggestions={result.suggestions} onApply={handleApply} vacancyData={vacancyData} />
        )}

        {/* 14. Профиль продавца — на основе бизнес-критериев */}
        <SellerProfileCard
          avgDealSize={(vacancyData.avgDealSize as string) || ""}
          salesCycle={(vacancyData.salesCycle as string) || ""}
          salesType={(vacancyData.salesType as string[]) || []}
          targetAudience={(vacancyData.targetAudience as string[]) || []}
          currentRequirements={(vacancyData.requirements as string) || ""}
          onFillRequirements={onApplySuggestion ? (text) => onApplySuggestion("requirements", text) : undefined}
        />

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

// ── Format Card ─────────────────────────────────────────────────────────────

function FormatCard({ workFormats }: { workFormats: string[] }) {
  if (!workFormats || workFormats.length === 0) return null

  const hasRemote = workFormats.some(f => /удалён/i.test(f))
  const hasOffice = workFormats.some(f => /офис/i.test(f))
  const hasHybrid = workFormats.some(f => /гибрид/i.test(f))

  const tips: { emoji: string; text: string }[] = []
  if (hasRemote) tips.push({ emoji: "✅", text: "Удалёнка: пул кандидатов шире — нет географических ограничений" })
  if (hasOffice && !hasRemote) tips.push({ emoji: "📍", text: "Офис сужает пул, но повышает контроль. Зарплаты выше +10-20%" })
  if (hasHybrid) tips.push({ emoji: "🔄", text: "Гибрид — компромисс: +30% к пулу vs офис" })

  return (
    <div className="rounded-lg border p-3 space-y-2">
      {/* QW5: заголовок и бейджи формата — в одну строку */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">Формат работы</span>
        </div>
        {workFormats.map(f => (
          <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
        ))}
      </div>
      {tips.map((t, i) => (
        <p key={i} className="text-xs text-muted-foreground leading-relaxed">{t.emoji} {t.text}</p>
      ))}
    </div>
  )
}

// ── Experience Insight Card ─────────────────────────────────────────────────

function ExperienceInsightCard({ level, currentLevel }: { level: string; currentLevel?: string | null }) {
  const insight = EXPERIENCE_INSIGHTS[level] || EXPERIENCE_INSIGHTS["3-5"]
  if (!insight) return null

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Опыт: {insight.label}{currentLevel === level ? " (текущий)" : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{insight.tip}</p>
    </div>
  )
}

// ── Market Context Card ─────────────────────────────────────────────────────

// ── Title Scoring Card ──────────────────────────────────────────────────────

function TitleScoringCard({ title, context, suggestions, onApply }: {
  title: string
  context: { format?: string; city?: string; salaryMin?: number }
  suggestions: string[]
  onApply?: (title: string) => void
}) {
  if (!title) return null

  const result = scoreVacancyTitle(title, context)
  // Подложка под балл — бледная, цвет по числу (≥75 зелёная, ≥40 янтарная, ниже красная), без рамки.
  const scoreBg = result.score >= 75 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
    : result.score >= 40 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
    : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
  const issues = result.checks.filter(c => c.status !== "ok")

  return (
    <div className="rounded-lg border p-3 space-y-2">
      {/* Заголовок темы + балл на бледной подложке (цвет по числу), без рамки */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Lightbulb className="w-3.5 h-3.5 text-primary" />Оценка названия
        </span>
        <span className="flex items-baseline gap-1.5 shrink-0">
          <span className={cn("text-sm font-medium tabular-nums px-2 py-0.5 rounded", scoreBg)}>{result.score}/100</span>
          <span className="text-[10px] text-muted-foreground">{result.label}</span>
        </span>
      </div>

      {/* Замечание (что улучшить) — вместо списка галочек */}
      {issues.length > 0 ? (
        <div className="space-y-1">
          {issues.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5">
              {c.status === "error"
                ? <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />}
              <span className="text-[11px] text-muted-foreground leading-relaxed">{c.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Название выглядит хорошо.</p>
      )}

      {/* Варианты — с новой строки, чипами */}
      {suggestions.length > 0 && onApply && (
        <div className="pt-1.5 border-t">
          <span className="text-[10px] font-medium text-muted-foreground">Варианты:</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onApply(s)}
                className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Seller Profile Card ─────────────────────────────────────────────────────

function SellerProfileCard({ avgDealSize, salesCycle, salesType, targetAudience, currentRequirements, onFillRequirements }: {
  avgDealSize: string
  salesCycle: string
  salesType: string[]
  targetAudience: string[]
  currentRequirements: string
  onFillRequirements?: (text: string) => void
}) {
  // Показываем только если заполнено хотя бы одно поле
  if (!avgDealSize && !salesCycle && salesType.length === 0 && targetAudience.length === 0) return null

  const tips: string[] = []
  const reqTemplate: string[] = []

  // Средний чек
  const dealNum = parseInt(avgDealSize.replace(/\D/g, ""))
  if (dealNum >= 100000) {
    tips.push("💼 Нужен опыт продаж сложных решений, не FMCG")
    reqTemplate.push("• Опыт продаж продуктов с чеком от 100к ₽")
  }
  if (dealNum >= 500000) {
    tips.push("🎯 Длинные сделки — нужна системность и работа с CRM")
    reqTemplate.push("• Опыт продаж enterprise-решений с чеком 500к+")
  }

  // Цикл сделки
  const cycleMap: Record<string, string> = {
    "1-3d": "Быстрые продажи — важна скорость и напор",
    "1-2w": "Средний цикл — баланс скорости и качества",
    "1-3m": "Нужна системность и работа с CRM",
    "3-6m": "Сложные сделки — навыки выстраивания отношений",
    "6m+": "Enterprise-продажи — опыт C-level переговоров",
  }
  if (salesCycle && cycleMap[salesCycle]) {
    tips.push(`🔄 ${cycleMap[salesCycle]}`)
    if (salesCycle === "3-6m" || salesCycle === "6m+") {
      reqTemplate.push("• Опыт длинных сделок (3+ месяцев)")
    }
  }

  // ЛПР
  if (targetAudience.includes("Собственники") || targetAudience.includes("Директора/CEO")) {
    tips.push("👔 Опыт переговоров C-level / с собственниками")
    reqTemplate.push("• Опыт ведения переговоров на уровне C-level")
  }

  // Тип продаж
  if (salesType.includes("Холодные звонки")) {
    reqTemplate.push("• Опыт холодных продаж")
  }
  if (salesType.includes("Тендеры")) {
    reqTemplate.push("• Опыт участия в тендерах")
  }

  if (tips.length === 0) return null

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-primary">Профиль продавца</span>
      </div>
      <div className="space-y-1">
        {tips.map((t, i) => (
          <p key={i} className="text-xs text-foreground leading-relaxed">{t}</p>
        ))}
      </div>
      {onFillRequirements && reqTemplate.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const combined = currentRequirements
              ? `${currentRequirements}\n${reqTemplate.join("\n")}`
              : reqTemplate.join("\n")
            onFillRequirements(combined)
          }}
          className="w-full text-left text-xs px-2 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 mt-1"
        >
          <Plus className="w-3 h-3" /> Заполнить требования из профиля
        </button>
      )}
    </div>
  )
}

// ── Motivation Analysis Card ────────────────────────────────────────────────

function MotivationAnalysisCard({ salaryMin, salaryMax, bonuses, payFrequency, category, salaryAnalysis, onAppendBonus }: {
  salaryMin: number
  salaryMax: number
  bonuses: string
  payFrequency: string[]
  category: string
  salaryAnalysis?: SalaryAnalysis
  onAppendBonus?: (text: string) => void
}) {
  // Don't show if nothing is filled
  if (!salaryMin && !salaryMax && !bonuses) return null

  const result = analyzeMotivation({ salaryMin: salaryMin || undefined, salaryMax: salaryMax || undefined, bonuses, payFrequency, category })

  // Балл на бледной подложке (цвет по числу), без рамки — как у названия.
  const scoreBg = result.score >= 75 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
    : result.score >= 40 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
    : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
  const issues = result.checks.filter(c => c.status !== "ok")

  // Мини-шкала рынка (из бывшей «Аналитики зарплат»).
  const a = salaryAnalysis
  let medianPos = 0, rangeLeft = 0, rangeWidth = 0
  if (a) {
    const scaleWidth = a.recommendedRange.max - a.recommendedRange.min * 0.5
    medianPos = Math.min(95, Math.max(5, ((a.marketMedian - a.recommendedRange.min * 0.5) / scaleWidth) * 100))
    rangeLeft = Math.max(0, ((a.recommendedRange.min - a.recommendedRange.min * 0.5) / scaleWidth) * 100)
    rangeWidth = ((a.recommendedRange.max - a.recommendedRange.min) / scaleWidth) * 100
  }
  const assessmentColor = a?.currentAssessment.includes("ниже") ? "text-red-600 dark:text-red-400"
    : a?.currentAssessment === "в рынке" ? "text-emerald-600 dark:text-emerald-400"
    : "text-muted-foreground"

  return (
    <div className="rounded-lg border p-3 space-y-2">
      {/* Заголовок + балл на подложке */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />Зарплата и мотивация
        </span>
        <span className="flex items-baseline gap-1.5 shrink-0">
          <span className={cn("text-sm font-medium tabular-nums px-2 py-0.5 rounded", scoreBg)}>{result.score}/100</span>
          <span className="text-[10px] text-muted-foreground">{result.label}</span>
        </span>
      </div>

      {/* Рынок — компактная полоска */}
      {a && (
        <div className="space-y-1">
          <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="absolute h-full bg-emerald-200 dark:bg-emerald-900/40 rounded-full" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-primary" style={{ left: `${medianPos}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>ваша вилка: <span className={cn("font-medium", assessmentColor)}>{a.currentAssessment}</span></span>
            <span>медиана {formatSalary(a.marketMedian)}</span>
          </div>
        </div>
      )}

      {/* Замечания: рынок (impactNote) + мотивация (только предупреждения) */}
      {(a?.impactNote || issues.length > 0) && (
        <div className="space-y-1">
          {a?.impactNote && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-muted-foreground leading-relaxed">{a.impactNote}</span>
            </div>
          )}
          {issues.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5">
              {c.status === "error"
                ? <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />}
              <span className="text-[11px] text-muted-foreground leading-relaxed">{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Бонусы — реальные шаблоны */}
      {result.suggestions.length > 0 && onAppendBonus && (
        <div className="pt-1.5 border-t space-y-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">Добавить в бонусы:</span>
          {result.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onAppendBonus(s)}
              className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors text-amber-800 dark:text-amber-200 underline decoration-dotted underline-offset-2"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// MarketContextCard удалён: содержал незаверенные рыночные цифры без источника.

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

// ── Company Description Card ────────────────────────────────────────────────

function CompanyDescriptionCard({ description }: { description: string }) {
  // Пустое описание — подсказка с кнопкой заполнения
  if (!description) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">🏢 О компании</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          ⚠️ Описание компании не заполнено.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Описание компании помогает привлечь мотивированных кандидатов.
        </p>
        <a
          href="/settings/company"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
        >
          Заполнить в настройках →
        </a>
      </div>
    )
  }

  // Описание заполнено — компактное подтверждение без повтора текста: само
  // описание редактируется в блоке «О компании» формы рядом.
  // AI-блок только оценивает/подсказывает — прямые «изменить» убраны.
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold">🏢 О компании</span>
      </div>
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="text-xs text-emerald-700 dark:text-emerald-400">Описание заполнено — редактируется в блоке «О компании» формы</span>
      </div>
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

function SectionCard({ section, onClick, compact }: {
  section: SectionAnalysis
  onClick: () => void
  compact?: boolean
}) {
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
          </div>
          {!compact && section.status !== "ok" && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{section.message}</p>
          )}
        </div>
      </div>
    </button>
  )
}
