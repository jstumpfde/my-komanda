"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Globe, Clock, Coffee, CalendarOff, Palmtree, Save, Plus, Trash2, Copy, ChevronDown, Users, Settings,
} from "lucide-react"

// ─── Data ───────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { id: "mon", label: "Понедельник", short: "Пн" },
  { id: "tue", label: "Вторник", short: "Вт" },
  { id: "wed", label: "Среда", short: "Ср" },
  { id: "thu", label: "Четверг", short: "Чт" },
  { id: "fri", label: "Пятница", short: "Пт" },
  { id: "sat", label: "Суббота", short: "Сб" },
  { id: "sun", label: "Воскресенье", short: "Вс" },
]

const HALF_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)
  .flatMap((h) => [h, h.replace(":00", ":30")])

const TIMEZONES = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Novosibirsk", label: "Новосибирск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
]

interface DaySchedule { enabled: boolean; from: string; to: string }

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: false, from: "10:00", to: "15:00" },
  { enabled: false, from: "10:00", to: "15:00" },
]

interface Holiday { id: string; date: string; name: string }

const RU_HOLIDAYS: Holiday[] = [
  { id: "h1", date: "01.01", name: "Новый год" },
  { id: "h2", date: "07.01", name: "Рождество" },
  { id: "h3", date: "23.02", name: "День защитника Отечества" },
  { id: "h4", date: "08.03", name: "Международный женский день" },
  { id: "h5", date: "01.05", name: "Праздник Весны и Труда" },
  { id: "h6", date: "09.05", name: "День Победы" },
  { id: "h7", date: "12.06", name: "День России" },
  { id: "h8", date: "04.11", name: "День народного единства" },
]

type AbsenceType = "vacation" | "sick" | "dayoff" | "remote" | "business_trip"
type AbsenceStatus = "planned" | "approved" | "pending" | "rejected"

const ABSENCE_TYPES: Record<AbsenceType, string> = {
  vacation: "Отпуск", sick: "Больничный", dayoff: "Отгул", remote: "Удалёнка", business_trip: "Командировка",
}

const ABSENCE_STATUS_CFG: Record<AbsenceStatus, { label: string; cls: string }> = {
  planned:  { label: "Запланирован", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  approved: { label: "Одобрен",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  pending:  { label: "На рассмотрении", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  rejected: { label: "Отклонён",    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

interface Absence {
  id: string; employee: string; type: AbsenceType; dateFrom: string; dateTo: string; status: AbsenceStatus; comment: string
}

const MOCK_EMPLOYEES = ["Иванова Анна", "Петров Андрей", "Сидорова Ксения", "Козлов Дмитрий", "Новиков Роман"]

// ─── Individual schedules ──────────────────────────────────────────────────

interface IndividualSchedule {
  employeeId: string
  employeeName: string
  days: Record<string, { active: boolean; start: string; end: string }>
}

const WEEKDAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const WEEKDAY_SHORT: Record<string, string> = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" }

function formatIndividualSchedule(days: Record<string, { active: boolean; start: string; end: string }>): string {
  const enabled = WEEKDAY_IDS.map(id => days[id]?.active ? { day: WEEKDAY_SHORT[id], start: days[id].start, end: days[id].end } : null).filter(Boolean)
  const disabled = WEEKDAY_IDS.map(id => !days[id]?.active ? WEEKDAY_SHORT[id] : null).filter(Boolean)
  if (enabled.length === 0) return "Все дни — выходные"
  const groups: { days: string[]; start: string; end: string }[] = []
  for (const item of enabled) {
    if (!item) continue
    const last = groups[groups.length - 1]
    if (last && last.start === item.start && last.end === item.end) last.days.push(item.day)
    else groups.push({ days: [item.day], start: item.start, end: item.end })
  }
  const parts = groups.map(g => {
    const d = g.days.length > 2 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days.join(", ")
    return `${d} ${g.start}–${g.end}`
  })
  if (disabled.length > 0) {
    const d = disabled.length > 2 ? `${disabled[0]}–${disabled[disabled.length - 1]}` : disabled.join(", ")
    parts.push(`${d} выходной`)
  }
  return parts.join(", ")
}

// Mock data: employees with individual schedules (loaded from team members with customSchedule)
const MOCK_INDIVIDUAL_SCHEDULES: IndividualSchedule[] = [
  {
    employeeId: "m1", employeeName: "Анна Иванова",
    days: {
      mon: { active: true, start: "10:00", end: "19:00" }, tue: { active: true, start: "10:00", end: "19:00" },
      wed: { active: true, start: "10:00", end: "19:00" }, thu: { active: true, start: "10:00", end: "19:00" },
      fri: { active: true, start: "10:00", end: "17:00" }, sat: { active: false, start: "10:00", end: "15:00" },
      sun: { active: false, start: "10:00", end: "15:00" },
    },
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function scheduleSummary(schedule: DaySchedule[]): string {
  const enabled = schedule.map((d, i) => d.enabled ? { day: WEEKDAYS[i].short, from: d.from, to: d.to } : null).filter(Boolean)
  const disabled = schedule.map((d, i) => !d.enabled ? WEEKDAYS[i].short : null).filter(Boolean)
  if (enabled.length === 0) return "Все дни — выходные"
  const groups: { days: string[]; from: string; to: string }[] = []
  for (const item of enabled) {
    if (!item) continue
    const last = groups[groups.length - 1]
    if (last && last.from === item.from && last.to === item.to) last.days.push(item.day)
    else groups.push({ days: [item.day], from: item.from, to: item.to })
  }
  const parts = groups.map(g => {
    const dayStr = g.days.length > 2 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days.join(", ")
    return `${dayStr} ${g.from}–${g.to}`
  })
  if (disabled.length > 0) {
    const dStr = disabled.length > 2 ? `${disabled[0]}–${disabled[disabled.length - 1]}` : disabled.join(", ")
    parts.push(`${dStr} выходной`)
  }
  return parts.join(", ")
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CompanySchedulePage() {
  // Schedule
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE)
  const [timezone, setTimezone] = useState("Europe/Moscow")
  // Lunch
  const [lunchEnabled, setLunchEnabled] = useState(true)
  const [lunchFrom, setLunchFrom] = useState("13:00")
  const [lunchTo, setLunchTo] = useState("14:00")
  // Holidays
  const [holidays, setHolidays] = useState<Holiday[]>(RU_HOLIDAYS)
  const [newHolidayDate, setNewHolidayDate] = useState("")
  const [newHolidayName, setNewHolidayName] = useState("")
  // Absences
  const [absences, setAbsences] = useState<Absence[]>([])
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false)
  const [absForm, setAbsForm] = useState({ employee: "", type: "vacation" as AbsenceType, dateFrom: "", dateTo: "", comment: "" })
  // Individual schedules
  const [individualSchedules] = useState<IndividualSchedule[]>(MOCK_INDIVIDUAL_SCHEDULES)
  // Accordion state
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["schedule"]))

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const updateDay = (i: number, patch: Partial<DaySchedule>) =>
    setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))

  const applyToAll = () => {
    const first = schedule.find((d) => d.enabled)
    if (!first) return
    setSchedule((prev) => prev.map((d) => d.enabled ? { ...d, from: first.from, to: first.to } : d))
    toast.success("Время применено ко всем рабочим дням")
  }

  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) return
    setHolidays((prev) => [...prev, { id: `h-${Date.now()}`, date: newHolidayDate, name: newHolidayName.trim() }])
    setNewHolidayDate("")
    setNewHolidayName("")
  }

  const addAbsence = () => {
    if (!absForm.employee || !absForm.dateFrom || !absForm.dateTo) return
    setAbsences((prev) => [...prev, { ...absForm, id: `a-${Date.now()}`, status: "pending" }])
    setAbsForm({ employee: "", type: "vacation", dateFrom: "", dateTo: "", comment: "" })
    setAbsenceDialogOpen(false)
    toast.success("Отсутствие добавлено")
  }

  const lunchSummary = lunchEnabled ? `${lunchFrom}–${lunchTo}` : "Выключен"
  const holidaySummary = `${holidays.length} ${holidays.length === 1 ? "праздник" : holidays.length < 5 ? "праздника" : "праздников"}`
  const absenceSummary = absences.length === 0 ? "Нет запланированных" : `${absences.length} запланировано`
  const individualSummary = individualSchedules.length === 0
    ? "Все по графику компании"
    : `${individualSchedules.length} ${individualSchedules.length === 1 ? "сотрудник" : individualSchedules.length < 5 ? "сотрудника" : "сотрудников"} с индивидуальным графиком`

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground mb-0.5">Расписание компании</h1>
          <p className="text-sm text-muted-foreground">График работы, перерывы, выходные и отпуска</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Globe className="size-4 text-muted-foreground" />
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-64 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 max-w-3xl">

        {/* ═══ Аккордеон 1: Рабочие дни ═══ */}
        <Card className="overflow-hidden">
          <button
            onClick={() => toggle("schedule")}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
          >
            <Clock className="size-4 text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">Рабочие дни и часы</span>
              {!expanded.has("schedule") && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{scheduleSummary(schedule)}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {expanded.has("schedule") && (
                <button
                  onClick={(e) => { e.stopPropagation(); applyToAll() }}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium px-2 py-0.5 rounded border border-border hover:bg-muted/50 transition-colors"
                >
                  <Copy className="w-3 h-3" /> Применить ко всем
                </button>
              )}
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded.has("schedule") && "rotate-180")} />
            </div>
          </button>
          {expanded.has("schedule") && (
            <CardContent className="p-0 border-t">
              {WEEKDAYS.map((day, i) => (
                <div key={day.id} className={cn(
                  "grid grid-cols-[40px_64px_1fr] items-center px-4 py-1.5 border-b last:border-b-0",
                  i % 2 === 0 ? "bg-background" : "bg-muted/10",
                )}>
                  <div><Switch checked={schedule[i].enabled} onCheckedChange={(v) => updateDay(i, { enabled: v })} /></div>
                  <span className={cn("text-sm font-medium", !schedule[i].enabled && "text-muted-foreground")}>{day.short}</span>
                  {schedule[i].enabled ? (
                    <div className="flex items-center gap-2">
                      <Select value={schedule[i].from} onValueChange={(v) => updateDay(i, { from: v })}>
                        <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                        <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                      <span className="text-muted-foreground text-xs">—</span>
                      <Select value={schedule[i].to} onValueChange={(v) => updateDay(i, { to: v })}>
                        <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                        <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Выходной</span>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        {/* ═══ Аккордеон 2: Обеденный перерыв ═══ */}
        <Card className="overflow-hidden">
          <button
            onClick={() => toggle("lunch")}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
          >
            <Coffee className="size-4 text-orange-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">Обеденный перерыв</span>
              {!expanded.has("lunch") && (
                <p className="text-xs text-muted-foreground mt-0.5">{lunchSummary}</p>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded.has("lunch") && "rotate-180")} />
          </button>
          {expanded.has("lunch") && (
            <CardContent className="p-0 border-t">
              <div className="flex items-center gap-4 px-4 py-2.5">
                <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
                <span className={cn("text-sm", !lunchEnabled && "text-muted-foreground")}>{lunchEnabled ? "Перерыв включён" : "Без перерыва"}</span>
                {lunchEnabled && (
                  <div className="flex items-center gap-2 ml-2">
                    <Select value={lunchFrom} onValueChange={setLunchFrom}>
                      <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                      <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-xs">—</span>
                    <Select value={lunchTo} onValueChange={setLunchTo}>
                      <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                      <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* ═══ Аккордеон 3: Праздничные дни ═══ */}
        <Card className="overflow-hidden">
          <button
            onClick={() => toggle("holidays")}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
          >
            <CalendarOff className="size-4 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">Выходные и праздничные дни</span>
              {!expanded.has("holidays") && (
                <p className="text-xs text-muted-foreground mt-0.5">{holidaySummary}</p>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded.has("holidays") && "rotate-180")} />
          </button>
          {expanded.has("holidays") && (
            <CardContent className="p-0 border-t">
              {/* Header */}
              <div className="grid grid-cols-[80px_1fr_40px] items-center px-4 py-1.5 bg-muted/20 border-b">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Дата</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Название</span>
                <span />
              </div>
              {holidays.map((h, idx) => (
                <div key={h.id} className={cn(
                  "grid grid-cols-[80px_1fr_40px] items-center px-4 py-1.5 border-b last:border-b-0",
                  idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                )}>
                  <span className="text-sm font-mono text-muted-foreground">{h.date}</span>
                  <span className="text-sm">{h.name}</span>
                  <div className="flex justify-center">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHolidays((prev) => prev.filter((x) => x.id !== h.id))}>
                      <Trash2 className="size-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/10">
                <Input value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} placeholder="ДД.ММ" className="w-20 h-7 text-sm bg-[var(--input-bg)] font-mono" maxLength={5} />
                <Input value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="Название праздника" className="flex-1 h-7 text-sm bg-[var(--input-bg)]" onKeyDown={(e) => { if (e.key === "Enter") addHoliday() }} />
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={addHoliday} disabled={!newHolidayDate || !newHolidayName.trim()}>
                  <Plus className="size-3" />Добавить
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ═══ Аккордеон 4: Отпуска и отсутствия ═══ */}
        <Card className="overflow-hidden">
          <button
            onClick={() => toggle("absences")}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
          >
            <Palmtree className="size-4 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">Отпуска и отсутствия</span>
              {!expanded.has("absences") && (
                <p className="text-xs text-muted-foreground mt-0.5">{absenceSummary}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {expanded.has("absences") && (
                <button
                  onClick={(e) => { e.stopPropagation(); setAbsenceDialogOpen(true) }}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium px-2 py-0.5 rounded border border-border hover:bg-muted/50 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Добавить
                </button>
              )}
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded.has("absences") && "rotate-180")} />
            </div>
          </button>
          {expanded.has("absences") && (
            <CardContent className="p-0 border-t">
              {absences.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Нет запланированных отпусков</div>
              ) : (
                <>
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_90px_90px_90px_100px_40px] items-center px-4 py-1.5 bg-muted/20 border-b">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Сотрудник</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Тип</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Начало</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Конец</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Статус</span>
                    <span />
                  </div>
                  {absences.map((a, idx) => {
                    const st = ABSENCE_STATUS_CFG[a.status]
                    return (
                      <div key={a.id} className={cn(
                        "grid grid-cols-[1fr_90px_90px_90px_100px_40px] items-center px-4 py-1.5 border-b last:border-b-0",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                      )}>
                        <span className="text-sm font-medium truncate">{a.employee}</span>
                        <span className="text-sm text-muted-foreground">{ABSENCE_TYPES[a.type]}</span>
                        <span className="text-sm text-muted-foreground font-mono">{a.dateFrom}</span>
                        <span className="text-sm text-muted-foreground font-mono">{a.dateTo}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0 rounded-full font-medium border-transparent w-fit", st.cls)}>{st.label}</Badge>
                        <div className="flex justify-center">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAbsences((prev) => prev.filter((x) => x.id !== a.id))}>
                            <Trash2 className="size-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </CardContent>
          )}
        </Card>

        {/* ═══ Аккордеон 5: Индивидуальные графики ═══ */}
        <Card className="overflow-hidden">
          <button
            onClick={() => toggle("individual")}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
          >
            <Users className="size-4 text-purple-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">Индивидуальные графики сотрудников</span>
              {!expanded.has("individual") && (
                <p className="text-xs text-muted-foreground mt-0.5">{individualSummary}</p>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded.has("individual") && "rotate-180")} />
          </button>
          {expanded.has("individual") && (
            <CardContent className="p-0 border-t">
              {individualSchedules.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Все сотрудники работают по графику компании
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_2fr_40px] items-center px-4 py-1.5 bg-muted/20 border-b">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Сотрудник</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">График</span>
                    <span />
                  </div>
                  {individualSchedules.map((emp, idx) => (
                    <div key={emp.employeeId} className={cn(
                      "grid grid-cols-[1fr_2fr_40px] items-center px-4 py-1.5 border-b last:border-b-0",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                    )}>
                      <span className="text-sm font-medium truncate">{emp.employeeName}</span>
                      <span className="text-xs text-muted-foreground truncate">{formatIndividualSchedule(emp.days)}</span>
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Настроить график"
                          onClick={() => toast.success(`Откройте настройки ${emp.employeeName} в разделе Команда`)}
                        >
                          <Settings className="size-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          )}
        </Card>

        {/* ═══ Сохранить ═══ */}
        <div className="flex justify-end pb-2 pt-1">
          <Button className="gap-2 h-9 px-5" onClick={() => toast.success("Расписание сохранено")}>
            <Save className="size-4" />Сохранить
          </Button>
        </div>
      </div>

      {/* ═══ Модалка: добавить отсутствие ═══ */}
      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Добавить отсутствие</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Сотрудник</Label>
              <Select value={absForm.employee} onValueChange={(v) => setAbsForm({ ...absForm, employee: v })}>
                <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                <SelectContent>{MOCK_EMPLOYEES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Тип</Label>
              <Select value={absForm.type} onValueChange={(v) => setAbsForm({ ...absForm, type: v as AbsenceType })}>
                <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ABSENCE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Дата начала</Label>
                <Input type="date" value={absForm.dateFrom} onChange={(e) => setAbsForm({ ...absForm, dateFrom: e.target.value })} className="h-9 text-sm bg-[var(--input-bg)]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Дата окончания</Label>
                <Input type="date" value={absForm.dateTo} onChange={(e) => setAbsForm({ ...absForm, dateTo: e.target.value })} className="h-9 text-sm bg-[var(--input-bg)]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Комментарий</Label>
              <Textarea value={absForm.comment} onChange={(e) => setAbsForm({ ...absForm, comment: e.target.value })} rows={2} placeholder="Необязательно" className="text-sm bg-[var(--input-bg)]" />
            </div>
            <Button onClick={addAbsence} disabled={!absForm.employee || !absForm.dateFrom || !absForm.dateTo} className="w-full">Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
