/**
 * Локальные UI-хелперы экрана «Сделки» (/ai-rop/deals, /ai-rop/deals/[id]).
 * Не общие с /ai-rop/clients — та зона по докблоку clients/_ui.tsx намеренно
 * держит свои хелперы локальными до появления явной задачи на дедуп.
 */
import { Badge } from "@/components/ui/badge"
import { Sparkles } from "lucide-react"
import { connectorKindLabel, dealStatusLabel } from "@/lib/salesradar/ui-labels"

export function ShadowBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-400"
    >
      <Sparkles className="size-3" />
      Теневая
    </Badge>
  )
}

const STATUS_STYLES: Record<string, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400",
  won: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
  lost: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  stale: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
  merged: "border-transparent bg-muted text-muted-foreground",
}

export function DealStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status] ?? "border-transparent bg-muted text-muted-foreground"}>
      {dealStatusLabel(status)}
    </Badge>
  )
}

export function ChannelBadges({ channels }: { channels: string[] }) {
  if (channels.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((c) => (
        <Badge key={c} variant="secondary" className="text-[11px] font-normal">
          {connectorKindLabel(c)}
        </Badge>
      ))}
    </div>
  )
}

export function formatMoney(amount: string | null, currency: string | null): string {
  if (!amount) return "—"
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) return "—"
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n)
  const curLabel = currency === "RUB" || !currency ? "₽" : currency
  return `${formatted} ${curLabel}`
}

function toDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
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

export function formatDateTime(s: string | null): string {
  const d = toDate(s)
  if (!d) return "—"
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
}
