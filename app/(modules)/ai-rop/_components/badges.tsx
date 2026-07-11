"use client"

// Общие бейджи/индикаторы модуля AI-РОП — тональность, статус звонка,
// звёздная оценка. semantic tokens (emerald/amber/red/muted) по
// DESIGN-REFERENCE.md, без кастомных hex.
import { Star, Smile, Meh, Frown, CircleDot } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Тональность ────────────────────────────────────────────────────────────

export function SentimentBadge({ value }: { value: string | null | undefined }) {
  if (value === "positive") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Smile className="size-3" /> Позитив
      </Badge>
    )
  }
  if (value === "negative") {
    return (
      <Badge variant="outline" className="gap-1 border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
        <Frown className="size-3" /> Негатив
      </Badge>
    )
  }
  if (value === "neutral") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Meh className="size-3" /> Нейтрально
      </Badge>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

// ─── Статус звонка (pipeline) ───────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "В очереди",
  downloading: "Скачивается",
  transcribing: "Транскрипция",
  analyzing: "AI-анализ",
  syncing: "Синк CRM",
  done: "Готово",
  failed: "Ошибка",
  no_recording: "Без записи",
  budget_exceeded: "Бюджет исчерпан",
}
const IN_PROGRESS = new Set(["downloading", "transcribing", "analyzing", "syncing"])

export function CallStatusBadge({ value }: { value: string }) {
  const label = STATUS_LABELS[value] ?? value
  if (value === "done") {
    return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{label}</Badge>
  }
  if (value === "failed" || value === "budget_exceeded") {
    return <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">{label}</Badge>
  }
  if (value === "no_recording") {
    return <Badge variant="outline" className="text-muted-foreground">{label}</Badge>
  }
  if (value === "pending" || IN_PROGRESS.has(value)) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <CircleDot className="size-3 animate-pulse" /> {label}
      </Badge>
    )
  }
  return <Badge variant="outline">{label}</Badge>
}

// ─── Звёздная оценка (0..10, шаг 2 → 5 звёзд) ───────────────────────────────

export function StarRating({ score, max = 10, size = "sm" }: { score: number | null | undefined; max?: number; size?: "sm" | "md" }) {
  if (score == null) return <span className="text-muted-foreground">—</span>
  const stars = 5
  const filled = Math.round((score / max) * stars)
  const cls = size === "md" ? "size-4" : "size-3.5"
  return (
    <span className="inline-flex items-center gap-1" title={`${score.toFixed(1)} / ${max}`}>
      <span className="inline-flex">
        {Array.from({ length: stars }).map((_, i) => (
          <Star key={i} className={cn(cls, i < filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
        ))}
      </span>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">{score.toFixed(1)}</span>
    </span>
  )
}

// ─── CRM-исход лида (STATUS_ID) ─────────────────────────────────────────────

export function LeadOutcomeBadge({ statusId }: { statusId: string }) {
  if (statusId === "JUNK") {
    return <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">Не в работе</Badge>
  }
  if (statusId === "CONVERTED") {
    return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Конвертирован в сделку</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">В работе</Badge>
}

// ─── Call stage бейдж (этап разговора — из AI-разбора) ──────────────────────

export function CallStageBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null
  return <Badge variant="secondary" className="font-normal">{value}</Badge>
}
