"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle2, AlertTriangle, XCircle, Sparkles, ChevronDown, ChevronUp,
  Loader2, RefreshCw, Bot, X, Plus, TrendingUp, Lightbulb,
} from "lucide-react"
import { formatSalary, marketStats } from "@/lib/salary-benchmarks"
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
  withoutSalaryLoss: number
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
  vacancyData: Record<string, unknown>
  companyDescription?: string
  focusedField?: string
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
  conditions: "section-6",
  company: "section-1",
}

const AI_SCREENING_FIELDS = new Set(["responsibilities", "requirements", "skills", "stopFactors"])

// ── Experience insight data ─────────────────────────────────────────────────

const EXPERIENCE_INSIGHTS: Record<string, { label: string; volumePercent: number; qualityPercent: number; tip: string }> = {
  "1-3": { label: "1-3 года", volumePercent: 85, qualityPercent: 35, tip: "Много откликов, но качество ниже. Подходит для junior/middle позиций" },
  "3-5": { label: "3-5 лет", volumePercent: 55, qualityPercent: 65, tip: "Оптимальный баланс количества и качества откликов" },
  "5+": { label: "5+ лет", volumePercent: 25, qualityPercent: 90, tip: "Мало откликов, но высокое качество. Для senior/lead позиций" },
}

// ── Component ────────────────────────────────────────────────────────────────

export function VacancyAdvisor({ vacancyData, companyDescription, focusedField, onScrollToSection, onApplySuggestion, onScoreChange }: VacancyAdvisorProps) {
  const [result, setResult] = useState<AdvisorResult | null>(null)
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

  const fetchAnalysis = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/vacancy-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyData,
          companyDescription: companyDescription || "",
          focusedField: focusedField || "",
        }),
        signal,
      })
      if (!res.ok) {
        if (res.status === 429) return // silently skip rate-limited
        throw new Error("API error")
      }
      const data = await res.json() as AdvisorResult
      setResult(data)
      lastDataHash.current = dataHash
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      // Keep previous result on error
    } finally {
      setLoading(false)
    }
  }, [vacancyData, companyDescription, focusedField, dataHash])

  // Debounced fetch on data change
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

  // Initial fetch
  useEffect(() => {
    fetchAnalysis()
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

  const errors = result?.sections.filter(s => s.status === "error") || []
  const warnings = result?.sections.filter(s => s.status === "warning") || []
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

  function renderContent() {
    if (!result && loading) {
      return (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Анализирую анкету...</p>
        </div>
      )
    }

    if (!result) return null

    return (
      <div className="space-y-3">
        {/* Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={cn("text-2xl font-bold tabular-nums", scoreColor)}>{result.score}%</span>
            <Badge variant={result.score < 40 ? "destructive" : result.score < 70 ? "secondary" : "default"} className="text-xs">
              {result.scoreLabel}
            </Badge>
          </div>
          <Progress value={result.score} className={cn("h-2", progressColor)} />
          <p className="text-xs text-muted-foreground">
            Анкета заполнена на {result.score}% — {result.scoreLabel.toLowerCase()}
          </p>
        </div>

        {/* Context tip */}
        {result.contextTip && (
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

        {/* Salary analysis */}
        {result.salaryAnalysis && (
          <SalaryAnalysisCard analysis={result.salaryAnalysis} />
        )}

        {/* Motivation analysis */}
        <MotivationAnalysisCard
          salaryMin={parseInt(String(vacancyData.salaryFrom || "0").replace(/\s/g, "")) || 0}
          salaryMax={parseInt(String(vacancyData.salaryTo || "0").replace(/\s/g, "")) || 0}
          bonuses={(vacancyData.bonus as string) || ""}
          payFrequency={(vacancyData.payFrequency as string[]) || []}
          category={(vacancyData.positionCategory as string) || ""}
          onAppendBonus={onApplySuggestion ? (text: string) => {
            const current = (vacancyData.bonus as string) || ""
            const newText = current ? `${current}\n• ${text}` : `• ${text}`
            onApplySuggestion("bonus", newText)
          } : undefined}
        />

        {/* Experience insight — соответствует полю "Требуемый опыт" */}
        {experienceLevel && EXPERIENCE_INSIGHTS[experienceLevel] && (
          <ExperienceInsightCard level={experienceLevel} />
        )}

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

        {oks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Заполнено</p>
            {oks.map(s => (
              <SectionCard key={s.id} section={s} onClick={() => handleSectionClick(s.id)} compact />
            ))}
          </div>
        )}

        {/* Company description — соответствует описанию компании */}
        <CompanyDescriptionCard description={companyDescription || ""} />

        {/* Market context — динамика рынка внизу */}
        <MarketContextCard />

        {/* Refresh */}
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-7 text-muted-foreground"
            onClick={() => fetchAnalysis()}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
            Обновить анализ
          </Button>
        </div>
      </div>
    )
  }

  // ── Desktop panel ──
  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block flex-[1] min-w-[340px]">
        <div className="space-y-3 border-l pl-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">AI-ассистент</span>
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
      {analysis.currentAssessment === "не указана" && analysis.withoutSalaryLoss > 0 && (
        <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">Без зарплаты теряется до {analysis.withoutSalaryLoss}% откликов</p>
      )}
    </div>
  )
}

// ── Experience Insight Card ─────────────────────────────────────────────────

function ExperienceInsightCard({ level }: { level: string }) {
  const insight = EXPERIENCE_INSIGHTS[level]
  if (!insight) return null

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Опыт: {insight.label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{insight.tip}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-20 shrink-0">Откликов</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${insight.volumePercent}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground w-8 text-right">{insight.volumePercent}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-20 shrink-0">Качество</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${insight.qualityPercent}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground w-8 text-right">{insight.qualityPercent}%</span>
        </div>
      </div>
      {level === "1-3" && (
        <p className="text-[10px] text-muted-foreground">43% вакансий рынка открыты для 1-3 лет. Junior-вакансий стало на ~{marketStats.juniorVacancyDecline}% меньше за год.</p>
      )}
      {level === "3-5" && (
        <p className="text-[10px] text-muted-foreground">Рекомендуемый диапазон — оптимальный баланс количества и качества откликов.</p>
      )}
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
  const scoreColor = result.score >= 60 ? "text-emerald-600 dark:text-emerald-400"
    : result.score >= 40 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400"
  const barColor = result.score >= 80 ? "bg-emerald-500"
    : result.score >= 60 ? "bg-emerald-400"
    : result.score >= 40 ? "bg-amber-500"
    : "bg-red-500"

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Оценка названия</span>
      </div>

      <p className="text-xs font-medium text-foreground truncate">&ldquo;{title}&rdquo;</p>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${result.score}%` }} />
        </div>
        <span className={cn("text-xs font-bold tabular-nums", scoreColor)}>{result.score}/100</span>
        <Badge variant={result.score >= 60 ? "default" : result.score >= 40 ? "secondary" : "destructive"} className="text-[10px] h-4 px-1.5">
          {result.label}
        </Badge>
      </div>

      <div className="space-y-0.5">
        {result.checks.map((c, i) => (
          <div key={i} className="flex items-start gap-1.5">
            {c.status === "ok" ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
            ) : c.status === "error" ? (
              <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
            )}
            <span className="text-[10px] text-muted-foreground leading-relaxed">{c.text}</span>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && onApply && (
        <div className="pt-1 border-t space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">Варианты с высоким откликом:</span>
          {suggestions.map((s, i) => {
            const sScore = scoreVacancyTitle(s, context)
            const sColor = sScore.score >= 60 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            return (
              <button
                key={i}
                onClick={() => onApply(s)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors group"
              >
                <span className="text-xs text-blue-800 dark:text-blue-200 underline decoration-dotted underline-offset-2 group-hover:text-blue-600">{s}</span>
                <span className={cn("text-[10px] font-bold ml-1.5", sColor)}>&rarr; {sScore.score}/100</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Motivation Analysis Card ────────────────────────────────────────────────

function MotivationAnalysisCard({ salaryMin, salaryMax, bonuses, payFrequency, category, onAppendBonus }: {
  salaryMin: number
  salaryMax: number
  bonuses: string
  payFrequency: string[]
  category: string
  onAppendBonus?: (text: string) => void
}) {
  // Don't show if nothing is filled
  if (!salaryMin && !salaryMax && !bonuses) return null

  const result = analyzeMotivation({ salaryMin: salaryMin || undefined, salaryMax: salaryMax || undefined, bonuses, payFrequency, category })

  const barColor = result.score >= 80 ? "bg-emerald-500"
    : result.score >= 60 ? "bg-emerald-400"
    : result.score >= 40 ? "bg-amber-500"
    : "bg-red-500"
  const scoreColor = result.score >= 60 ? "text-emerald-600 dark:text-emerald-400"
    : result.score >= 40 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400"

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Анализ мотивации</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${result.score}%` }} />
        </div>
        <span className={cn("text-xs font-bold tabular-nums", scoreColor)}>{result.score}/100</span>
      </div>

      <div className="space-y-0.5">
        {result.checks.map((c, i) => (
          <div key={i} className="flex items-start gap-1.5">
            {c.status === "ok" ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
            ) : c.status === "error" ? (
              <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
            )}
            <span className="text-[10px] text-muted-foreground leading-relaxed">{c.text}</span>
          </div>
        ))}
      </div>

      {result.suggestions.length > 0 && onAppendBonus && (
        <div className="pt-1 border-t space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">Добавить в бонусы:</span>
          {result.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onAppendBonus(s)}
              className="w-full text-left text-[10px] px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors text-amber-800 dark:text-amber-200 underline decoration-dotted underline-offset-2"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Market Context Card ─────────────────────────────────────────────────────

function MarketContextCard() {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">📊 Рынок {marketStats.period}</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Зарплаты +{marketStats.overallMedianGrowth}%, резюме +{marketStats.resumeGrowth}%, конкуренция растёт. Junior −{marketStats.juniorVacancyDecline}%.
      </p>
      <p className="text-[9px] text-muted-foreground/70">{marketStats.source}</p>
    </div>
  )
}

// ── Company Description Card ────────────────────────────────────────────────

function CompanyDescriptionCard({ description }: { description: string }) {
  if (!description) return null // handled by sections

  const preview = description.length > 100 ? description.slice(0, 100) + "..." : description

  return (
    <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Описание компании подтянуто</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{preview}</p>
    </div>
  )
}

// ── Suggestions Panel ───────────────────────────────────────────────────────

function SuggestionsPanel({ suggestions, onApply, vacancyData }: {
  suggestions: Suggestions
  onApply: (field: string, value: unknown) => void
  vacancyData: Record<string, unknown>
}) {
  const hasSkills = suggestions.skills.length > 0
  const hasStopFactors = suggestions.stopFactors.length > 0
  const hasDuties = !!suggestions.duties
  const hasRequirements = !!suggestions.requirements

  if (!hasSkills && !hasStopFactors && !hasDuties && !hasRequirements) return null

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Рекомендации AI</p>

      {/* Skills */}
      {hasSkills && (
        <div className="rounded-lg border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Рекомендуемые навыки</span>
            <button
              onClick={() => {
                const current = (vacancyData.requiredSkills as string[]) || []
                const newSkills = suggestions.skills.filter(s => !current.includes(s))
                onApply("requiredSkills", [...current, ...newSkills])
              }}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Добавить все
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.skills.map(skill => {
              const alreadyHas = ((vacancyData.requiredSkills as string[]) || []).includes(skill)
                || ((vacancyData.desiredSkills as string[]) || []).includes(skill)
              return (
                <button
                  key={skill}
                  disabled={alreadyHas}
                  onClick={() => {
                    const current = (vacancyData.requiredSkills as string[]) || []
                    onApply("requiredSkills", [...current, skill])
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
      )}

      {/* Stop factors */}
      {hasStopFactors && (
        <div className="rounded-lg border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Стоп-факторы</span>
            <button
              onClick={() => {
                const current = (vacancyData.unacceptableSkills as string[]) || []
                const newFactors = suggestions.stopFactors.filter(s => !current.includes(s))
                onApply("unacceptableSkills", [...current, ...newFactors])
              }}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Добавить все
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.stopFactors.map(factor => {
              const alreadyHas = ((vacancyData.unacceptableSkills as string[]) || []).includes(factor)
              return (
                <button
                  key={factor}
                  disabled={alreadyHas}
                  onClick={() => {
                    const current = (vacancyData.unacceptableSkills as string[]) || []
                    onApply("unacceptableSkills", [...current, factor])
                  }}
                  className={cn(
                    "text-[11px] px-1.5 py-0.5 rounded border transition-colors",
                    alreadyHas
                      ? "bg-muted text-muted-foreground border-border cursor-default line-through"
                      : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer"
                  )}
                >
                  {factor}
                </button>
              )
            })}
          </div>
        </div>
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
