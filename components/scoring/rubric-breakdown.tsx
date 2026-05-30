"use client"

// Общий UI рубричного скоринга: компактный бейдж балла + раскрываемая раскладка.
// Используется и в лаборатории (/hr/scoring-lab), и в карточке кандидата.

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CheckCircle2, AlertTriangle, XCircle, Quote, ChevronDown, ChevronUp } from "lucide-react"
import { WEIGHT_LABELS, type RubricResult, type WeightLevel, type Verdict } from "@/lib/scoring/types"

export const WEIGHT_BADGE: Record<WeightLevel, string> = {
  critical:   "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  important:  "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  nice:       "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  irrelevant: "bg-muted text-muted-foreground border-border",
}

export const VERDICT_CFG: Record<Verdict, { label: string; short: string; chip: string; icon: typeof CheckCircle2 }> = {
  strong: { label: "Сильное соответствие", short: "сильный",      chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: CheckCircle2 },
  maybe:  { label: "Под вопросом",          short: "под вопросом", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",       icon: AlertTriangle },
  weak:   { label: "Слабое соответствие",   short: "слабый",       chip: "bg-muted text-muted-foreground border-border",                                                    icon: AlertTriangle },
  reject: { label: "Стоп-фактор — отказ",   short: "отказ",        chip: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",                  icon: XCircle },
}

export function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

// Компактный кликабельный бейдж: «82% · сильный ▾».
export function RubricScoreBadge({ result, expanded, onToggle }: { result: RubricResult; expanded?: boolean; onToggle?: () => void }) {
  const v = VERDICT_CFG[result.verdict]
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", v.chip)}
    >
      <span className="tabular-nums">{result.total}%</span>
      <span className="font-medium">· {v.short}</span>
      {onToggle && (expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
    </button>
  )
}

// Детальная раскладка: стоп-фактор, вывод, критерии с доказательствами.
export function RubricBreakdown({ result, showMeta = true }: { result: RubricResult; showMeta?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      {result.knockoutHit && (
        <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Сработал стоп-фактор: <b>{result.knockoutHit}</b> → автоматический отказ (балл 0).</span>
        </div>
      )}

      <p className="text-sm text-foreground">{result.summary}</p>

      <div className="space-y-2.5 pt-1">
        {result.criteria.map(c => (
          <div key={c.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-foreground">{c.label}</span>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", WEIGHT_BADGE[c.weight])}>{WEIGHT_LABELS[c.weight]}</Badge>
              </span>
              <span className={cn("font-semibold tabular-nums", scoreColor(c.score))}>{c.score}</span>
            </div>
            <Progress value={c.score} className="h-1.5" />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Quote className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
              <span>{c.evidence} <span className="opacity-60">· увер.: {c.confidence}</span></span>
            </p>
          </div>
        ))}
      </div>

      {showMeta && (
        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          модель: {result.model} · prompt-cache: запись {result.cache.creationTokens} / чтение {result.cache.readTokens} токенов
        </p>
      )}
    </div>
  )
}
