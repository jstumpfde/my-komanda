/**
 * Локальные UI-хелперы для страниц «Клиенты 360» (/ai-rop/clients,
 * /ai-rop/clients/[phone]). НЕ трогать app/(modules)/ai-rop/_components —
 * это отдельная зона другого агента; если позже понадобится дедуп —
 * эти же хелперы можно перенести туда как общие.
 *
 * ВАЖНО: этот файл намеренно БЕЗ "use client" — обе страницы модуля
 * Server Component, и все хелперы ниже чистые (без hooks/обработчиков),
 * поэтому их можно звать прямо из серверного рендера. Если в файле
 * появится "use client", импорт функций (не JSX-компонентов) из него
 * в Server Component сломается — эти экспорты станут client reference
 * и не будут вызываемыми как обычные функции на сервере.
 */
import type { ReactNode } from "react"
import { Phone, MessageSquare, Mail, Users, Smile, Meh, Frown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ───────── Настроение ─────────

export function SentimentMini({
  positive,
  neutral,
  negative,
}: {
  positive: number
  neutral: number
  negative: number
}) {
  const total = positive + neutral + negative
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      {positive > 0 && (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <Smile className="size-3" />
          {positive}
        </span>
      )}
      {neutral > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Meh className="size-3" />
          {neutral}
        </span>
      )}
      {negative > 0 && (
        <span className="inline-flex items-center gap-1 text-red-600">
          <Frown className="size-3" />
          {negative}
        </span>
      )}
    </div>
  )
}

const SENTIMENT_META: Record<string, { label: string; className: string }> = {
  positive: {
    label: "Позитив",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
  },
  neutral: {
    label: "Нейтрально",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  negative: {
    label: "Негатив",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900",
  },
}

// Одиночный бейдж настроения (карточка таймлайна).
export function SentimentBadge({ value }: { value: string | null }) {
  if (!value) return null
  const meta = SENTIMENT_META[value] ?? { label: value, className: "bg-muted text-muted-foreground border-transparent" }
  return (
    <Badge variant="outline" className={cn("text-[11px]", meta.className)}>
      {meta.label}
    </Badge>
  )
}

// ───────── Тип взаимодействия ─────────

export function typeIcon(t: string, className = "size-3.5"): ReactNode {
  if (t === "chat") return <MessageSquare className={className} />
  if (t === "email") return <Mail className={className} />
  if (t === "meeting") return <Users className={className} />
  return <Phone className={className} />
}

export function typeIconBg(t: string): string {
  if (t === "chat") return "bg-emerald-500"
  if (t === "email") return "bg-blue-500"
  if (t === "meeting") return "bg-amber-500"
  return "bg-violet-500"
}

export function typeLabel(t: string): string {
  return ({ call: "Звонок", chat: "Чат", email: "Email", meeting: "Встреча" } as Record<string, string>)[t] || t
}

// ───────── Даты ─────────

function toDate(s: string | null): Date | null {
  if (!s) return null
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function formatRelative(s: string | null): string {
  const d = toDate(s)
  if (!d) return "—"
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 1) return "сегодня"
  if (days < 2) return "вчера"
  if (days < 7) return `${days} дн. назад`
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`
  if (days < 365) return `${Math.floor(days / 30)} мес. назад`
  return `${Math.floor(days / 365)} г. назад`
}

export function formatDate(s: string | null): string {
  const d = toDate(s)
  if (!d) return "—"
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

export function formatDateTime(s: string | null): string {
  const d = toDate(s)
  if (!d) return "—"
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "—"
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}с`
  return `${m}:${String(s).padStart(2, "0")}`
}

export function truncateText(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s
}

// ───────── Оборванные нити ─────────

export const LOOSE_THREAD_LABELS: Record<string, string> = {
  no_next_action: "Нет следующего шага",
  promise_overdue: "Просрочено обещание",
  negative_unfollowed: "Негатив без ответа",
  long_silence: "Долгая тишина",
}
