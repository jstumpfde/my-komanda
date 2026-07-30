"use client"

// Клиентская часть /ai-rop/reports: «Отправить сейчас» (превью + разовая
// отправка) и «Расписания» (список + Sheet-форма создания/редактирования).
// Все мутации — через API другого агента (app/api/modules/ai-rop/reports/**,
// см. отчёт агента-исполнителя зоны app/(modules)/ai-rop/reports для точных
// контрактов); после успеха — router.refresh() (сервер отдаёт свежий список
// расписаний как проп) + toast.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarClock, CheckCircle2, Loader2, MessageSquare, Pencil, Plus, Send, Trash2, User as UserIcon, XCircle } from "lucide-react"
import type { RopReportSchedule } from "@/lib/db/schema"
import type { BotChat } from "@/lib/ai-rop/bitrix-im"
import type { ScheduleFrequency, ScheduleRecipientKind, SchedulePeriodKind, ScheduleScope } from "@/lib/ai-rop/reports-scheduler"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { formatDateTime } from "../_components/format"

// ─────────────────────────────────────────────────────────────────────────

interface ManagerOption {
  id: string
  name: string | null
}

const PERIOD_LABELS: Record<SchedulePeriodKind, string> = {
  yesterday: "Вчера",
  today: "Сегодня",
  last_7_days: "Последние 7 дней",
  last_week: "Прошлая неделя",
  this_week: "Эта неделя",
  last_month: "Прошлый месяц",
}
const PERIOD_KINDS = Object.keys(PERIOD_LABELS) as SchedulePeriodKind[]

// Роуты preview/send принимают КОНКРЕТНЫЙ диапазон { from, to, periodLabel },
// а не periodKind (periodKind резолвится на сервере только у РАСПИСАНИЙ в момент
// срабатывания; разовая отправка резолвится здесь, в момент клика). Локальная
// копия lib/ai-rop/reports-scheduler.ts::resolvePeriod — импортировать её
// нельзя: модуль тянет drizzle/db в клиентский бандл.
function resolvePeriodClient(kind: SchedulePeriodKind): { from: string; to: string; periodLabel: string } {
  const isoDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const startOfWeekMon = (d: Date) => {
    const x = new Date(d)
    const day = x.getDay()
    x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
    x.setHours(0, 0, 0, 0)
    return x
  }
  const now = new Date()
  const periodLabel = PERIOD_LABELS[kind]
  switch (kind) {
    case "today":
      return { from: isoDate(now), to: isoDate(now), periodLabel }
    case "last_7_days": {
      const from = new Date(now); from.setDate(from.getDate() - 6)
      return { from: isoDate(from), to: isoDate(now), periodLabel }
    }
    case "last_week": {
      const thisMon = startOfWeekMon(now)
      const lastSun = new Date(thisMon); lastSun.setDate(lastSun.getDate() - 1)
      return { from: isoDate(startOfWeekMon(lastSun)), to: isoDate(lastSun), periodLabel }
    }
    case "this_week":
      return { from: isoDate(startOfWeekMon(now)), to: isoDate(now), periodLabel }
    case "last_month": {
      const firstThis = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastEnd = new Date(firstThis); lastEnd.setDate(lastEnd.getDate() - 1)
      const lastStart = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1)
      return { from: isoDate(lastStart), to: isoDate(lastEnd), periodLabel }
    }
    case "yesterday":
    default: {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      return { from: isoDate(d), to: isoDate(d), periodLabel }
    }
  }
}

const WEEK_DAYS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Пн" }, { id: 2, label: "Вт" }, { id: 3, label: "Ср" },
  { id: 4, label: "Чт" }, { id: 5, label: "Пт" }, { id: 6, label: "Сб" }, { id: 7, label: "Вс" },
]

function safeParseDays(json: string | null): number[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((d): d is number => typeof d === "number") : []
  } catch {
    return []
  }
}

function frequencyLabel(s: RopReportSchedule): string {
  if (s.frequency === "daily") return `Ежедневно в ${s.timeHhmm}`
  const days = safeParseDays(s.daysOfWeek)
  const labels = days.map((d) => WEEK_DAYS.find((w) => w.id === d)?.label ?? "?").join(", ")
  return `По дням: ${labels || "—"} в ${s.timeHhmm}`
}

function isHHMM(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

// ─────────────────────────────────────────────────────────────────────────
// Общий выбор получателя (используется и в «Отправить сейчас», и в форме расписания).

function RecipientFields({
  recipientKind,
  setRecipientKind,
  recipientId,
  setRecipientId,
  recipientName,
  setRecipientName,
  botChats,
  showNameField = true,
}: {
  recipientKind: ScheduleRecipientKind
  setRecipientKind: (v: ScheduleRecipientKind) => void
  recipientId: string
  setRecipientId: (v: string) => void
  recipientName: string
  setRecipientName: (v: string) => void
  botChats: BotChat[]
  showNameField?: boolean
}) {
  const chatOptions = botChats.filter((c) => c.type === "chat")
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={recipientKind}
        onValueChange={(v) => {
          setRecipientKind(v as ScheduleRecipientKind)
          setRecipientId("")
          setRecipientName("")
        }}
      >
        <SelectTrigger className="h-9 w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="user">Личное сообщение (Bitrix ID)</SelectItem>
          <SelectItem value="chat">Групповой чат Bitrix</SelectItem>
        </SelectContent>
      </Select>

      {recipientKind === "user" ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Bitrix ID пользователя"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="h-9 sm:w-[200px]"
          />
          {showNameField && (
            <Input
              placeholder="Название получателя (для отображения)"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="h-9 sm:w-[260px]"
            />
          )}
        </div>
      ) : chatOptions.length > 0 ? (
        <Select
          value={recipientId}
          onValueChange={(v) => {
            setRecipientId(v)
            setRecipientName(chatOptions.find((c) => c.id === v)?.title ?? "")
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-[280px]"><SelectValue placeholder="Выберите чат" /></SelectTrigger>
          <SelectContent>
            {chatOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">
          Список чатов Bitrix пуст или недоступен — бот не добавлен ни в один чат портала.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// «Отправить сейчас»

function SendNowSection({
  managers,
  botChats,
  dryRunMessages,
}: {
  managers: ManagerOption[]
  botChats: BotChat[]
  dryRunMessages: boolean
}) {
  const [scope, setScope] = useState<ScheduleScope>("team")
  const [managerId, setManagerId] = useState(managers[0]?.id ?? "")
  const [periodKind, setPeriodKind] = useState<SchedulePeriodKind>("yesterday")
  const [recipientKind, setRecipientKind] = useState<ScheduleRecipientKind>("user")
  const [recipientId, setRecipientId] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)

  const busy = previewing || sending

  function validateScope(): string | null {
    if (scope === "manager" && !managerId) return "Выберите менеджера для персонального отчёта"
    return null
  }

  async function doPreview() {
    const err = validateScope()
    if (err) { toast.error(err); return }
    setPreviewing(true)
    setPreview(null)
    try {
      const res = await fetch("/api/modules/ai-rop/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          managerId: scope === "manager" ? managerId : undefined,
          ...resolvePeriodClient(periodKind),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || "Не удалось сформировать отчёт")
        return
      }
      setPreview({ title: data.title, text: data.text })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setPreviewing(false)
    }
  }

  async function doSend() {
    const err = validateScope()
    if (err) { toast.error(err); return }
    if (!recipientId.trim()) { toast.error("Укажите получателя"); return }
    setSending(true)
    try {
      const res = await fetch("/api/modules/ai-rop/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Роут /reports/send принимает плоский recipientId (Bitrix user id или
        // "chatN") без recipientKind — kind здесь только различает UI выбора.
        body: JSON.stringify({
          scope,
          managerId: scope === "manager" ? managerId : undefined,
          ...resolvePeriodClient(periodKind),
          recipientId: recipientId.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        toast.error(data?.error || "Не удалось отправить отчёт")
        return
      }
      toast.success("Отчёт отправлен")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardContent className="py-4 flex flex-col gap-4">
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Тип отчёта</Label>
          <Tabs value={scope} onValueChange={(v) => setScope(v as ScheduleScope)}>
            <TabsList>
              <TabsTrigger value="team">Общий по команде</TabsTrigger>
              <TabsTrigger value="manager">По менеджеру</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {scope === "manager" && (
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Менеджер</Label>
            {managers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет менеджеров с привязкой к Bitrix.</p>
            ) : (
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger className="h-9 w-full sm:w-[280px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Период</Label>
          <Select value={periodKind} onValueChange={(v) => setPeriodKind(v as SchedulePeriodKind)}>
            <SelectTrigger className="h-9 w-full sm:w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_KINDS.map((k) => (
                <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Получатель</Label>
          <RecipientFields
            recipientKind={recipientKind}
            setRecipientKind={setRecipientKind}
            recipientId={recipientId}
            setRecipientId={setRecipientId}
            recipientName={recipientName}
            setRecipientName={setRecipientName}
            botChats={botChats}
            showNameField={false}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={doPreview} disabled={busy}>
            {previewing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Предпросмотр
          </Button>
          <Button size="sm" className="gap-1.5" onClick={doSend} disabled={busy}>
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Отправить
          </Button>
          {dryRunMessages && (
            <span className="text-xs text-muted-foreground">
              Сейчас включён тестовый режим отправки (dry-run) — сообщение не уйдёт реально в Bitrix.
            </span>
          )}
        </div>

        {preview && (
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Превью {preview.title ? `— ${preview.title}` : ""}
            </Label>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{preview.text}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// «Расписания» — форма создания/редактирования

interface ScheduleFormState {
  name: string
  scope: ScheduleScope
  managerId: string
  recipientKind: ScheduleRecipientKind
  recipientId: string
  recipientName: string
  frequency: ScheduleFrequency
  time: string
  daysOfWeek: number[]
  periodKind: SchedulePeriodKind
  enabled: boolean
}

function initialFormState(managers: ManagerOption[], schedule: RopReportSchedule | null): ScheduleFormState {
  if (schedule) {
    return {
      name: schedule.name,
      scope: schedule.scope as ScheduleScope,
      managerId: schedule.managerId ?? managers[0]?.id ?? "",
      recipientKind: schedule.recipientKind as ScheduleRecipientKind,
      recipientId: schedule.recipientId,
      recipientName: schedule.recipientName ?? "",
      frequency: schedule.frequency as ScheduleFrequency,
      time: schedule.timeHhmm,
      daysOfWeek: safeParseDays(schedule.daysOfWeek),
      periodKind: schedule.periodKind as SchedulePeriodKind,
      enabled: schedule.enabled !== false,
    }
  }
  return {
    name: "",
    scope: "team",
    managerId: managers[0]?.id ?? "",
    recipientKind: "user",
    recipientId: "",
    recipientName: "",
    frequency: "daily",
    time: "09:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    periodKind: "yesterday",
    enabled: true,
  }
}

function ScheduleForm({
  managers,
  botChats,
  schedule,
  onSaved,
}: {
  managers: ManagerOption[]
  botChats: BotChat[]
  schedule: RopReportSchedule | null
  onSaved: () => void
}) {
  const [form, setForm] = useState<ScheduleFormState>(() => initialFormState(managers, schedule))
  const [saving, setSaving] = useState(false)

  function patch(next: Partial<ScheduleFormState>) {
    setForm((prev) => ({ ...prev, ...next }))
  }

  function toggleDay(id: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(id)
        ? prev.daysOfWeek.filter((d) => d !== id)
        : [...prev.daysOfWeek, id].sort((a, b) => a - b),
    }))
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Введите название расписания"
    if (!form.recipientId.trim()) return "Укажите получателя"
    if (!isHHMM(form.time)) return "Время должно быть в формате ЧЧ:ММ"
    if (form.scope === "manager" && !form.managerId) return "Выберите менеджера"
    if (form.frequency === "weekly" && form.daysOfWeek.length === 0) return "Выберите хотя бы один день недели"
    return null
  }

  async function save() {
    const err = validate()
    if (err) { toast.error(err); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        scope: form.scope,
        managerId: form.scope === "manager" ? form.managerId : null,
        recipientKind: form.recipientKind,
        recipientId: form.recipientId.trim(),
        recipientName: form.recipientName.trim() || null,
        frequency: form.frequency,
        time: form.time,
        daysOfWeek: form.frequency === "weekly" ? form.daysOfWeek : null,
        periodKind: form.periodKind,
        enabled: form.enabled,
      }
      const url = schedule
        ? `/api/modules/ai-rop/reports/schedules/${schedule.id}`
        : `/api/modules/ai-rop/reports/schedules`
      const res = await fetch(url, {
        method: schedule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        toast.error(data?.error || "Не удалось сохранить расписание")
        return
      }
      toast.success(schedule ? "Расписание обновлено" : "Расписание создано")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Название</Label>
        <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Например, Утренний отчёт" />
      </div>

      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Тип отчёта</Label>
        <Tabs value={form.scope} onValueChange={(v) => patch({ scope: v as ScheduleScope })}>
          <TabsList>
            <TabsTrigger value="team">Команда</TabsTrigger>
            <TabsTrigger value="manager">Менеджер</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {form.scope === "manager" && (
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Менеджер</Label>
          {managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет менеджеров с привязкой к Bitrix.</p>
          ) : (
            <Select value={form.managerId} onValueChange={(v) => patch({ managerId: v })}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Получатель</Label>
        <RecipientFields
          recipientKind={form.recipientKind}
          setRecipientKind={(v) => patch({ recipientKind: v })}
          recipientId={form.recipientId}
          setRecipientId={(v) => patch({ recipientId: v })}
          recipientName={form.recipientName}
          setRecipientName={(v) => patch({ recipientName: v })}
          botChats={botChats}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Частота</Label>
          <Tabs value={form.frequency} onValueChange={(v) => patch({ frequency: v as ScheduleFrequency })}>
            <TabsList>
              <TabsTrigger value="daily">Ежедневно</TabsTrigger>
              <TabsTrigger value="weekly">По дням</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Время</Label>
          <Input type="time" value={form.time} onChange={(e) => patch({ time: e.target.value })} className="w-[140px]" />
        </div>
      </div>

      {form.frequency === "weekly" && (
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Дни недели</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_DAYS.map((d) => {
              const active = form.daysOfWeek.includes(d.id)
              return (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-8 w-11 px-0"
                  onClick={() => toggleDay(d.id)}
                >
                  {d.label}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Период отчёта</Label>
        <Select value={form.periodKind} onValueChange={(v) => patch({ periodKind: v as SchedulePeriodKind })}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_KINDS.map((k) => (
              <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={form.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        <Label className="text-sm">Включено</Label>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// «Расписания» — список

function SchedulesSection({
  schedules,
  managers,
  botChats,
}: {
  schedules: RopReportSchedule[]
  managers: ManagerOption[]
  botChats: BotChat[]
}) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RopReportSchedule | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setSheetOpen(true)
  }
  function openEdit(s: RopReportSchedule) {
    setEditing(s)
    setSheetOpen(true)
  }
  function onSaved() {
    setSheetOpen(false)
    router.refresh()
  }

  async function toggleEnabled(s: RopReportSchedule) {
    setBusyId(s.id)
    try {
      const res = await fetch(`/api/modules/ai-rop/reports/schedules/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !s.enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        toast.error(data?.error || "Не удалось изменить расписание")
        return
      }
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(s: RopReportSchedule) {
    if (!window.confirm(`Удалить расписание «${s.name}»?`)) return
    setBusyId(s.id)
    try {
      const res = await fetch(`/api/modules/ai-rop/reports/schedules/${s.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        toast.error(data?.error || "Не удалось удалить расписание")
        return
      }
      toast.success("Расписание удалено")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-3.5" />
          Добавить расписание
        </Button>
      </div>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Расписания не настроены. Создайте первое — и отчёт будет уходить автоматически.
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <DataTable>
            <DataHead>
              <DataHeadCell>Название</DataHeadCell>
              <DataHeadCell>Получатель</DataHeadCell>
              <DataHeadCell>Частота</DataHeadCell>
              <DataHeadCell>Период</DataHeadCell>
              <DataHeadCell>Последний запуск</DataHeadCell>
              <DataHeadCell align="center">Вкл</DataHeadCell>
              <DataHeadCell align="right">Действия</DataHeadCell>
            </DataHead>
            <tbody>
              {schedules.map((s) => (
                <DataRow key={s.id} className={s.enabled === false ? "opacity-60" : undefined}>
                  <DataCell>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.scope === "manager" ? "по менеджеру" : "общий по команде"}</div>
                  </DataCell>
                  <DataCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {s.recipientKind === "chat" ? <MessageSquare className="size-3.5" /> : <UserIcon className="size-3.5" />}
                      {s.recipientName || s.recipientId}
                    </span>
                  </DataCell>
                  <DataCell className="text-muted-foreground">{frequencyLabel(s)}</DataCell>
                  <DataCell className="text-muted-foreground">{PERIOD_LABELS[s.periodKind as SchedulePeriodKind] ?? s.periodKind}</DataCell>
                  <DataCell className="text-muted-foreground">
                    {s.lastRunAt ? (
                      <span className="inline-flex items-center gap-1">
                        {s.lastRunStatus === "ok" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-red-600" />}
                        {formatDateTime(s.lastRunAt)}
                      </span>
                    ) : "—"}
                  </DataCell>
                  <DataCell align="center">
                    <Switch checked={s.enabled !== false} disabled={busyId === s.id} onCheckedChange={() => toggleEnabled(s)} />
                  </DataCell>
                  <DataCell align="right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" className="size-7" disabled={busyId === s.id} onClick={() => openEdit(s)} title="Изменить">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" disabled={busyId === s.id} onClick={() => remove(s)} title="Удалить">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableCard>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-violet-600" />
              {editing ? "Изменить расписание" : "Новое расписание"}
            </SheetTitle>
            <SheetDescription>Отчёт уйдёт в личку или групповой чат Bitrix в указанное время.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <ScheduleForm key={editing?.id ?? "new"} managers={managers} botChats={botChats} schedule={editing} onSaved={onSaved} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────

export function ReportsClient({
  managers,
  schedules,
  botChats,
  dryRunMessages,
}: {
  managers: ManagerOption[]
  schedules: RopReportSchedule[]
  botChats: BotChat[]
  dryRunMessages: boolean
}) {
  return (
    <Tabs defaultValue="send">
      <TabsList className="mb-4">
        <TabsTrigger value="send" className="gap-1.5"><Send className="size-3.5" />Отправить сейчас</TabsTrigger>
        <TabsTrigger value="schedules" className="gap-1.5"><CalendarClock className="size-3.5" />Расписания{schedules.length > 0 ? ` (${schedules.length})` : ""}</TabsTrigger>
      </TabsList>
      <TabsContent value="send">
        <SendNowSection managers={managers} botChats={botChats} dryRunMessages={dryRunMessages} />
      </TabsContent>
      <TabsContent value="schedules">
        <SchedulesSection schedules={schedules} managers={managers} botChats={botChats} />
      </TabsContent>
    </Tabs>
  )
}
