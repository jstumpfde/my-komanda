/**
 * Локальные UI-хелперы экрана «Контрагенты» (/ai-rop/counterparties,
 * /ai-rop/counterparties/[id]). Держим отдельно от /ai-rop/clients и
 * /ai-rop/deals — своя зона, свои хелперы (см. докблок clients/_ui.tsx).
 */
import { Badge } from "@/components/ui/badge"
import { Phone, MessageSquare, Mail, Radio, PhoneIncoming, PhoneOutgoing } from "lucide-react"
import { counterpartyKindLabel, connectorKindLabel } from "@/lib/salesradar/ui-labels"

const KIND_STYLES: Record<string, string> = {
  client: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
  supplier: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400",
  partner: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-400",
  internal: "border-transparent bg-muted text-muted-foreground",
  unknown: "border-transparent bg-muted text-muted-foreground",
}

export function CounterpartyKindBadge({ kind }: { kind: string }) {
  return (
    <Badge variant="outline" className={KIND_STYLES[kind] ?? KIND_STYLES.unknown}>
      {counterpartyKindLabel(kind)}
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

export function touchIcon(channel: string, className = "size-3.5") {
  if (channel === "imap") return <Mail className={className} />
  if (channel === "telegram_bot" || channel === "telegram_user") return <MessageSquare className={className} />
  if (channel === "whatsapp_agg") return <MessageSquare className={className} />
  if (channel.startsWith("bitrix") || channel === "call") return <Phone className={className} />
  return <Radio className={className} />
}

export function directionIcon(direction: "in" | "out" | null, className = "size-3 text-muted-foreground") {
  if (direction === "in") return <PhoneIncoming className={className} />
  if (direction === "out") return <PhoneOutgoing className={className} />
  return null
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
