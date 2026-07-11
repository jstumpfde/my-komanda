"use client"

/**
 * Интерактивные секции «Моего кабинета» — напоминания (готово/отложить) и
 * инбокс расхождений (принять/отклонить). Контракты сверены с реальными
 * роутами (коммит d4784dfc):
 *
 *   PATCH /api/modules/ai-rop/reminders/:id   { action: "done" }
 *   PATCH /api/modules/ai-rop/reminders/:id   { action: "snooze", hours: N }
 *   POST  /api/modules/ai-rop/discrepancies/:id/resolve   { action: "accepted" | "rejected" }
 */
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Bell, CheckCircle2, Clock, ThumbsDown, ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { formatDateTime, toDate } from "../_components/format"
import { SeverityBadge } from "./_ui"
import type { RopReminder } from "@/lib/db/schema"

// ─── Напоминания ─────────────────────────────────────────────────────────────

export function RemindersSection({ reminders }: { reminders: RopReminder[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="size-4 text-violet-600" />
          Напоминания
          {reminders.length > 0 && (
            <span className="font-normal text-muted-foreground">({reminders.length})</span>
          )}
        </CardTitle>
        <CardDescription>Договорённости и следующие шаги по звонкам</CardDescription>
      </CardHeader>
      <CardContent>
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет активных напоминаний.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reminders.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const SNOOZE_OPTIONS = [
  { label: "+1 час", hours: 1 },
  { label: "+4 часа", hours: 4 },
  { label: "+24 часа", hours: 24 },
]

function ReminderRow({ reminder }: { reminder: RopReminder }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const due = toDate(reminder.dueAt)
  const overdue = due ? due.getTime() < Date.now() : false

  function act(body: Record<string, unknown>, successMsg: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/modules/ai-rop/reminders/${reminder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error("request failed")
        toast.success(successMsg)
        router.refresh()
      } catch {
        toast.error("Не удалось обновить напоминание")
      }
    })
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border p-3",
        overdue ? "border-red-500/40 bg-red-500/5" : "border-border/60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{reminder.title}</p>
        <p
          className={cn(
            "mt-0.5 text-xs",
            overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {formatDateTime(reminder.dueAt)}
          {overdue && " · просрочено"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => act({ action: "done" }, "Напоминание закрыто")}
        >
          <CheckCircle2 className="mr-1 size-3.5" /> Готово
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={pending}>
              <Clock className="mr-1 size-3.5" /> Отложить
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SNOOZE_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.hours}
                onClick={() => act({ action: "snooze", hours: opt.hours }, `Отложено на ${opt.label.slice(1)}`)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ─── Расхождения ─────────────────────────────────────────────────────────────

export interface DiscrepancyItem {
  discrepancy: {
    id: string
    fieldLabel: string | null
    fieldName: string
    cardValue: string | null
    suggestedValue: string | null
    transcriptEvidence: string | null
    severity: string
  }
  callStartedAt: Date | string | null
  clientPhone: string | null
}

export function DiscrepancyInbox({ items }: { items: DiscrepancyItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-violet-600" />
          Расхождения
          {items.length > 0 && (
            <span className="font-normal text-muted-foreground">({items.length})</span>
          )}
        </CardTitle>
        <CardDescription>Карточка CRM разошлась с тем, что сказано в звонке</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет расхождений, ожидающих вашего решения.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <DiscrepancyCard key={item.discrepancy.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DiscrepancyCard({ item }: { item: DiscrepancyItem }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const d = item.discrepancy

  // Контракт роута resolve: body { action: "accepted" | "rejected" }.
  function act(action: "accepted" | "rejected") {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/modules/ai-rop/discrepancies/${d.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        })
        if (!res.ok) throw new Error("request failed")
        toast.success(action === "accepted" ? "Расхождение принято" : "Расхождение отклонено")
        router.refresh()
      } catch {
        toast.error("Не удалось обновить расхождение")
      }
    })
  }

  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{d.fieldLabel || d.fieldName}</span>
        <SeverityBadge severity={d.severity} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-muted-foreground line-through">{d.cardValue || "—"}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{d.suggestedValue || "—"}</span>
      </div>
      {d.transcriptEvidence && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">«{d.transcriptEvidence}»</p>
      )}
      <div className="mt-2.5 flex items-center gap-1.5">
        <Button size="sm" disabled={pending} onClick={() => act("accepted")}>
          <ThumbsUp className="mr-1 size-3.5" /> Принять
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act("rejected")}>
          <ThumbsDown className="mr-1 size-3.5" /> Отклонить
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        «Принять» помечает расхождение учтённым; запись в CRM сделает бот автоматически
        только в автоматическом режиме компании — в ручном режиме изменение в Bitrix
        нужно внести самостоятельно.
      </p>
    </div>
  )
}
