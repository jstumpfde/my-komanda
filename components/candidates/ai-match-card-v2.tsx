"use client"

// Группа 25: карточка разбора по критериям Портрета (осевой скоринг v2) + A/B
// сравнение v1/v2. Рендерится в candidate-drawer.tsx, табе «Портрет» (value="rubric").
// Балл здесь подписан «Осевой балл (справочно)» — единственная пользовательская
// оценка называется «Портрет» (resumeScore), см. [[portrait-unified-scoring-redesign]].

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AiScoreBadge } from "@/components/dashboard/ai-score-badge"
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CandidateScoreV2 } from "@/lib/db/schema"

interface AiMatchCardV2Props {
  details:   CandidateScoreV2 | null | undefined
  scoreV1:   number | null | undefined
  scoreV2:   number | null | undefined
}

const CRITERIA_LABELS: Record<keyof CandidateScoreV2["criteria_scores"], string> = {
  relevant_experience: "Релевантный опыт",
  hard_skills:         "Hard skills",
  tenure_stability:    "Стабильность",
  results_in_numbers:  "Цифры результатов",
  soft_skills_fit:     "Soft skills fit",
  company_size_match:  "Размер компаний",
  managerial_match:    "Управленческий опыт",
  education:           "Образование",
  location_readiness:  "Готовность к локации",
}

const DECISION_LABELS: Record<CandidateScoreV2["decision"], { label: string; cls: string }> = {
  strong_match: { label: "strong_match", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/60" },
  match:        { label: "match",        cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/60" },
  maybe:        { label: "maybe",        cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/60" },
  weak:         { label: "weak",         cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300/60" },
  reject:       { label: "reject",       cls: "bg-destructive/10 text-destructive border-destructive/30" },
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-700 dark:text-emerald-400"
  if (score >= 40) return "text-amber-700 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

// Данные приходят из сохранённого AI-JSON (lib/ai-score-candidate-v2.ts) —
// формат эволюционировал (напр. reasoning.questions_for_interview добавлено
// позже), а старые персистированные записи не бэкфилятся. Без нормализации
// обращение к отсутствующему полю (.length/.map на undefined) роняло рендер
// таба целиком (инцидент 08.07, кандидат «Аргинбаев Карим» — запись от 05.07
// без questions_for_interview). Норм-функция подставляет безопасные дефолты
// для каждого поля, которое ниже читается без опциональной цепочки.
function normalizeDetails(details: CandidateScoreV2): CandidateScoreV2 {
  return {
    ...details,
    reasoning: {
      pros: details.reasoning?.pros ?? [],
      cons: details.reasoning?.cons ?? [],
      questions_for_interview: details.reasoning?.questions_for_interview ?? [],
    },
    criteria_scores: details.criteria_scores ?? ({} as CandidateScoreV2["criteria_scores"]),
    matched_must_have: details.matched_must_have ?? [],
    missed_must_have: details.missed_must_have ?? [],
    matched_nice_to_have: details.matched_nice_to_have ?? [],
    triggered_deal_breakers: details.triggered_deal_breakers ?? [],
    extracted_facts: {
      ...details.extracted_facts,
      hard_skills_mentioned: details.extracted_facts?.hard_skills_mentioned ?? [],
      results_with_numbers:  details.extracted_facts?.results_with_numbers ?? [],
      red_flags:             details.extracted_facts?.red_flags ?? [],
      green_flags:           details.extracted_facts?.green_flags ?? [],
      managerial_experience: details.extracted_facts?.managerial_experience ?? { has: false, team_size: null },
    },
  }
}

export function AiMatchCardV2({ details: rawDetails, scoreV1, scoreV2 }: AiMatchCardV2Props) {
  const [expanded, setExpanded]   = useState(true)
  const [showCriteria, setShowCriteria] = useState(true)

  if (!rawDetails) return null
  const details = normalizeDetails(rawDetails)

  const decision = DECISION_LABELS[details.decision] ?? {
    label: String(details.decision ?? "—"),
    cls:   "bg-muted text-muted-foreground border-border",
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      {/* Header: decision слева, балл справа */}
      <div className="p-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline" className={cn("text-xs", decision.cls)}>
            {decision.label}
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Осевой балл (справочно)</span>
            <AiScoreBadge score={details.score} size="md" />
          </div>
        </div>
      </div>

      {/* Pros */}
      {details.reasoning.pros.length > 0 && (
        <div className="p-3 border-b border-border/60 space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Сильные стороны
          </h4>
          <ul className="space-y-1 text-sm">
            {details.reasoning.pros.map((p, i) => (
              <li key={i} className="flex gap-2"><span className="text-emerald-600">•</span><span>{stripLeadingBullet(p)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Cons */}
      {details.reasoning.cons.length > 0 && (
        <div className="p-3 border-b border-border/60 space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Слабые места
          </h4>
          <ul className="space-y-1 text-sm">
            {details.reasoning.cons.map((c, i) => (
              <li key={i} className="flex gap-2"><span className="text-amber-600">•</span><span>{stripLeadingBullet(c)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions for interview */}
      {details.reasoning.questions_for_interview.length > 0 && (
        <div className="p-3 border-b border-border/60 space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Вопросы к кандидату
          </h4>
          <ul className="space-y-1 text-sm">
            {details.reasoning.questions_for_interview.map((q, i) => (
              <li key={i} className="flex gap-2"><span className="text-muted-foreground">•</span><span>{stripLeadingBullet(q)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Must-have summary */}
      {(details.matched_must_have.length > 0 || details.missed_must_have.length > 0) && (
        <div className="p-3 border-b border-border/60 space-y-1.5">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Must-have</h4>
            <span className="text-xs text-muted-foreground">
              {details.matched_must_have.length}/{details.matched_must_have.length + details.missed_must_have.length}
            </span>
          </div>
          <ul className="space-y-1 text-xs">
            {details.matched_must_have.map((m, i) => (
              <li key={`ok-${i}`} className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" /> {m}
              </li>
            ))}
            {details.missed_must_have.map((m, i) => (
              <li key={`miss-${i}`} className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <XCircle className="w-3 h-3 shrink-0" /> {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Triggered deal-breakers */}
      {details.triggered_deal_breakers.length > 0 && (
        <div className="p-4 border-b border-border/60 space-y-2 bg-destructive/5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Сработали deal-breakers
          </h4>
          <ul className="space-y-1 text-sm">
            {details.triggered_deal_breakers.map((d, i) => (
              <li key={i} className="text-red-600 dark:text-red-400">• {stripLeadingBullet(d)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Toggles */}
      <div className="p-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowCriteria(v => !v)} className="text-xs">
          {showCriteria ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          Критерии
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)} className="text-xs">
          {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          Извлечённые факты
        </Button>
      </div>

      {/* Criteria scores */}
      {showCriteria && (
        <div className="px-4 pb-4 space-y-2">
          {(Object.keys(details.criteria_scores) as (keyof CandidateScoreV2["criteria_scores"])[]).map(key => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{CRITERIA_LABELS[key]}</span>
                <span className={cn("tabular-nums font-medium", scoreColor(details.criteria_scores[key]))}>
                  {details.criteria_scores[key]}
                </span>
              </div>
              <Progress value={details.criteria_scores[key]} className="h-1.5" />
            </div>
          ))}
        </div>
      )}

      {/* Extracted facts */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 text-xs">
          <FactRow label="Общий опыт" value={details.extracted_facts.total_years_experience} suffix=" лет" />
          <FactRow label="Industry match" value={details.extracted_facts.industry_match} />
          <FactRow label="Средний tenure" value={details.extracted_facts.avg_tenure_years} suffix=" лет" />
          {details.extracted_facts.managerial_experience.has && (
            <FactRow
              label="Управленческий опыт"
              value={`да${details.extracted_facts.managerial_experience.team_size ? `, команда ${details.extracted_facts.managerial_experience.team_size}` : ""}`}
            />
          )}
          <FactList label="Hard skills" items={details.extracted_facts.hard_skills_mentioned} />
          <FactList label="Цифры результатов" items={details.extracted_facts.results_with_numbers} />
          <FactList label="Red flags" items={details.extracted_facts.red_flags} cls="text-red-600 dark:text-red-400" />
          <FactList label="Green flags" items={details.extracted_facts.green_flags} cls="text-emerald-700 dark:text-emerald-400" />
        </div>
      )}
    </div>
  )
}

function FactRow({ label, value, suffix = "" }: { label: string; value: string | number | null; suffix?: string }) {
  if (value == null || value === "") return null
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}{suffix}</span>
    </div>
  )
}

// Данные из AI (red_flags/green_flags/hard_skills_mentioned и т.д.) иногда уже
// приходят с собственным маркером в начале строки («• …», «- …», «– …») — если
// поверх этого рендерить свой «• », получается задвоенный буллет «• •». Срезаем
// ведущий маркер на рендере (данные в БД трогать не нужно — это косметика вывода).
function stripLeadingBullet(text: string): string {
  return text.replace(/^[\s]*[•\-–—*]\s*/, "")
}

function FactList({ label, items, cls }: { label: string; items: string[]; cls?: string }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-muted-foreground mb-1">{label}:</p>
      <ul className={cn("ml-3 space-y-0.5", cls)}>
        {items.map((it, i) => <li key={i}>• {stripLeadingBullet(it)}</li>)}
      </ul>
    </div>
  )
}
