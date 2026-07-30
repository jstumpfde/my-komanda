/**
 * Локальные UI-хелперы страницы «Кабинет РОПа» (бейджи настроения/вердикта,
 * цвет оценки). Не переиспользуются другими страницами модуля — если
 * понадобятся ещё где-то, поднять в _components/ (чужая зона — координатору).
 */
import type { ManagerDynamics } from "@/lib/ai-rop/team-dynamics"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CheckCircle2, CircleDot, XCircle, TrendingUp, TrendingDown, Minus, CircleDashed } from "lucide-react"

type Sentiment = "positive" | "neutral" | "negative"

const SENTIMENT_STYLE: Record<Sentiment, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  positive: {
    label: "Позитив",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  neutral: {
    label: "Нейтрально",
    className: "bg-muted/40 text-muted-foreground border-muted-foreground/30",
    Icon: CircleDot,
  },
  negative: {
    label: "Негатив",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900",
    Icon: XCircle,
  },
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return null
  const s = SENTIMENT_STYLE[sentiment]
  return (
    <Badge variant="outline" className={cn("text-[11px]", s.className)}>
      <s.Icon className="size-3" /> {s.label}
    </Badge>
  )
}

const VERDICT_STYLE: Record<ManagerDynamics["verdict"], { label: string; className: string; Icon: typeof TrendingUp; order: number }> = {
  declining: {
    label: "Просел",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900",
    Icon: TrendingDown,
    order: 0,
  },
  stuck: {
    label: "Застрял",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
    Icon: Minus,
    order: 1,
  },
  growing: {
    label: "Растёт",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
    Icon: TrendingUp,
    order: 2,
  },
  insufficient: {
    label: "Мало данных",
    className: "bg-muted/40 text-muted-foreground border-muted-foreground/30",
    Icon: CircleDashed,
    order: 3,
  },
}

export function verdictOrder(verdict: ManagerDynamics["verdict"]): number {
  return VERDICT_STYLE[verdict].order
}

export function VerdictBadge({ verdict }: { verdict: ManagerDynamics["verdict"] }) {
  const v = VERDICT_STYLE[verdict]
  return (
    <Badge variant="outline" className={cn("text-[11px] shrink-0", v.className)}>
      <v.Icon className="size-3" /> {v.label}
    </Badge>
  )
}

/** Оценка звонка 0..10 — цвет по порогам (аналог AiScoreBadge, но для шкалы /10). */
function scoreClasses(score: number): string {
  if (score >= 8) return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
  if (score >= 6) return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
  if (score >= 4) return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
  return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900"
}

export function ManagerScoreBadge({ score }: { score: number | null }) {
  const has = score != null
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-bold px-1.5 h-6 min-w-[2.25rem] text-xs shrink-0",
        has ? scoreClasses(score!) : "bg-muted/40 text-muted-foreground/60 border-muted",
      )}
    >
      {has ? score!.toFixed(1) : "—"}
    </span>
  )
}

/** Левая цветная полоса карточки приоритетного звонка — сильнее риск = заметнее. */
export function riskStripeClass(risk: number): string {
  if (risk >= 12) return "border-l-4 border-l-red-500"
  if (risk >= 8) return "border-l-4 border-l-amber-500"
  return "border-l-4 border-l-transparent"
}
