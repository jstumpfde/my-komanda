"use client"

import { useState, useEffect } from "react"
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
  Globe, Clock, Coffee, CalendarOff, Palmtree, Save, Plus, Trash2, Copy, ChevronDown, Loader2,
} from "lucide-react"
import { type CountryCode, COUNTRY_LABELS, getHolidaysForCountry } from "@/lib/holidays"
import type { CompanyWorkSchedule } from "@/lib/db/schema"

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
  { value: "Asia/Almaty", label: "Алматы (UTC+6)" },
  { value: "Asia/Tashkent", label: "Ташкент (UTC+5)" },
  { value: "Europe/Minsk", label: "Минск (UTC+3)" },
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

interface Holiday { id: string; date: string; name: string; isCustom?: boolean }

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

interface TeamMember { id: string; name: string }

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

function buildHolidays(country: CountryCode, customHolidays: Holiday[]): Holiday[] {
  const base = getHolidaysForCountry(country).map((h, i) => ({
    id: `country-${i}`,
    date: h.date,
    name: h.name,
    isCustom: false,
  }))
  return [...base, ...customHolidays]
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CompanySchedulePage() {
  // Schedule
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE)
  const [timezone, setTimezone] = useState("Europe/Moscow")
  const [country, setCountry] = useState<CountryCode>("RU")
  // Lunch
  const [lunchEnabled, setLunchEnabled] = useState(true)
  const [lunchFrom, setLunchFrom] = useState("13:00")
  const [lunchTo, setLunchTo] = useState("14:00")
  // Holidays
  const [customHolidays, setCustomHolidays] = useState<Holiday[]>([])
  const holidays = buildHolidays(country, customHolidays)
  const [newHolidayDate, setNewHolidayDate] = useState("")
  const [newHolidayName, setNewHolidayName] = useState("")
  // Absences
  const [absences, setAbsences] = useState<Absence[]>([])
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false)
  const [absForm, setAbsForm] = useState({ employee: "", type: "vacation" as AbsenceType, dateFrom: "", dateTo: "", comment: "" })
  // Реальные сотрудники компании для выпадающего списка отсутствий.
  const [employees, setEmployees] = useState<TeamMember[]>([])
  // Загрузка/сохранение
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Гидратация из standalone-хранилища компании.
  useEffect(() => {
    let cancelled = false
    fetch("/api/companies/work-schedule")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return
        const ws = (data.workSchedule ?? {}) as CompanyWorkSchedule
        if (Array.isArray(ws.schedule) && ws.schedule.length === 7) setSchedule(ws.schedule)
        if (ws.timezone) setTimezone(ws.timezone)
        if (ws.country) setCountry(ws.country as CountryCode)
        if (ws.lunch) { setLunchEnabled(ws.lunch.enabled); setLunchFrom(ws.lunch.from); setLunchTo(ws.lunch.to) }
        if (Array.isArray(ws.customHolidays)) setCustomHolidays(ws.customHolidays.map(h => ({ ...h, isCustom: true })))
        if (Array.isArray(ws.absences)) setAbsences(ws.absences as Absence[])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Список сотрудников (для отсутствий) — реальная команда, не мок.
  useEffect(() => {
    let cancelled = false
    fetch("/api/team")
      .then(r => (r.ok ? r.json() : null))
      .then(rows => {
        if (cancelled || !Array.isArray(rows)) return
        setEmployees((rows as { id: string; name: string; email?: string }[]).map(m => ({ id: m.id, name: m.name || m.email || "—" })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Единое сохранение всей страницы (standalone — просто пишем своё значение).
  const handleSave = async (overrideAbsences?: Absence[]) => {
    setSaving(true)
    try {
      const payload: CompanyWorkSchedule = {
        schedule,
        timezone,
        country,
        lunch: { enabled: lunchEnabled, from: lunchFrom, to: lunchTo },
        // В хранилище — только пользовательские праздники (страновые подставляются из lib/holidays).
        customHolidays: customHolidays.map(({ id, date, name }) => ({ id, date, name })),
        absences: overrideAbsences ?? absences,
      }
      const res = await fetch("/api/companies/work-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("save failed")
      toast.success("Расписание сохранено")
    } catch {
      toast.error("Не удалось сохранить расписание")
    } finally {
      setSaving(false)
    }
  }

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
    setCustomHolidays((prev) => [...prev, { id: `h-${prev.length}-${newHolidayDate}`, date: newHolidayDate, name: newHolidayName.trim(), isCustom: true }])
    setNewHolidayDate("")
    setNewHolidayName("")
  }

  const removeHoliday = (id: string) => {
    setCustomHolidays((prev) => prev.filter((x) => x.id !== id))
  }

  const addAbsence = () => {
    if (!absForm.employee || !absForm.dateFrom || !absForm.dateTo) return
    const next = [...absences, { ...absForm, id: `a-${absences.length}-${absForm.dateFrom}`, status: "planned" as AbsenceStatus }]
    setAbsences(next)
    setAbsForm({ employee: "", type: "vacation", dateFrom: "", dateTo: "", comment: "" })
    setAbsenceDialogOpen(false)
    // Отсутствия персистим сразу — кнопка «Добавить» подразумевает сохранение.
    handleSave(next)
  }

  const removeAbsence = (id: string) => {
    const next = absences.filter((x) => x.id !== id)
    setAbsences(next)
    handleSave(next)
  }

  const lunchSummary = lunchEnabled ? `${lunchFrom}–${lunchTo}` : "Выключен"
  const holidaySummary = `${holidays.length} ${holidays.length === 1 ? "праздник" : holidays.length < 5 ? "праздника" : "праздников"} (${COUNTRY_LABELS[country]})`
  const absenceSummary = absences.length === 0 ? "Нет запланированных" : `${absences.length} запланировано`

  return (
    <div>
      <div className="flex flex-col gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-violet-600" /><h1 className="text-lg font-semibold">Расписание компании</h1></div>
          <p className="text-sm text-muted-foreground">График работы, перерывы, выходные и отпуска</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
            <SelectTrigger className="w-44 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(COUNTRY_LABELS) as [CountryCode, string][]).map(([code, label]) => (
                <SelectItem key={code} value={code}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground shrink-0" />
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-56 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-3">

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
                <p className="text-xs text-muted-foreground truncate mt-0.5">{scheduleSummary(schedule)} · обед {lunchSummary}</p>
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
                  "grid grid-cols-[44px_64px_1fr] items-center px-4 py-2 border-b border-border/50",
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
              {/* Обед — встроен в блок рабочих дней последней строкой.
                  Та же grid-сетка, что и WEEKDAYS, чтобы все колонки совпали. */}
              <div className="grid grid-cols-[44px_64px_1fr] items-center px-4 py-2 bg-muted/10">
                <div><Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} /></div>
                <span className={cn("text-sm font-medium inline-flex items-center gap-1", !lunchEnabled && "text-muted-foreground")}>
                  <Coffee className="size-3.5 text-orange-600" />
                  Обед
                </span>
                {lunchEnabled ? (
                  <div className="flex items-center gap-2">
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
                ) : (
                  <span className="text-sm text-muted-foreground">Без перерыва</span>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* ═══ Аккордеон 2: Праздничные дни ═══ */}
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{h.name}</span>
                    {!h.isCustom && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                        {COUNTRY_LABELS[country]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {h.isCustom ? (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeHoliday(h.id)}>
                        <Trash2 className="size-3 text-muted-foreground" />
                      </Button>
                    ) : (
                      <span />
                    )}
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

        {/* ═══ Аккордеон 3: Отпуска и отсутствия ═══ */}
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
                    const st = ABSENCE_STATUS_CFG[a.status] ?? ABSENCE_STATUS_CFG.planned
                    return (
                      <div key={a.id} className={cn(
                        "grid grid-cols-[1fr_90px_90px_90px_100px_40px] items-center px-4 py-1.5 border-b last:border-b-0",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                      )}>
                        <span className="text-sm font-medium truncate">{a.employee}</span>
                        <span className="text-sm text-muted-foreground">{ABSENCE_TYPES[a.type] ?? a.type}</span>
                        <span className="text-sm text-muted-foreground font-mono">{a.dateFrom}</span>
                        <span className="text-sm text-muted-foreground font-mono">{a.dateTo}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0 rounded-full font-medium border-transparent w-fit", st.cls)}>{st.label}</Badge>
                        <div className="flex justify-center">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAbsence(a.id)}>
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

        {/* ═══ Сохранить ═══ */}
        <div className="flex justify-end pb-2 pt-1">
          <Button className="gap-2 h-9 px-5" onClick={() => handleSave()} disabled={!loaded || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить
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
                <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue placeholder={employees.length ? "Выберите сотрудника" : "Нет сотрудников"} /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent>
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
    </div>
  )
}
