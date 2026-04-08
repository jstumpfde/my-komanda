"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Globe, Clock, Coffee, CalendarOff, Palmtree, Save, Plus, Trash2, Copy,
} from "lucide-react"
import Link from "next/link"

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

      <div className="space-y-4 max-w-3xl">

        {/* ═══ Рабочие дни ═══ */}
        <Card className="rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Рабочие дни и часы</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={applyToAll}>
              <Copy className="size-3" />Применить ко всем
            </Button>
          </div>
          <div className="space-y-0">
            {WEEKDAYS.map((day, i) => (
              <div key={day.id} className={cn(
                "flex items-center gap-3 py-2 px-2 rounded transition-colors",
                i % 2 === 1 && "bg-muted/30",
                "hover:bg-muted/40",
              )}>
                <Switch checked={schedule[i].enabled} onCheckedChange={(v) => updateDay(i, { enabled: v })} />
                <span className={cn("min-w-[80px] text-sm font-medium", !schedule[i].enabled && "text-muted-foreground")}>{day.short}</span>
                {schedule[i].enabled ? (
                  <div className="flex items-center gap-2">
                    <Select value={schedule[i].from} onValueChange={(v) => updateDay(i, { from: v })}>
                      <SelectTrigger className="w-24 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                      <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-sm">—</span>
                    <Select value={schedule[i].to} onValueChange={(v) => updateDay(i, { to: v })}>
                      <SelectTrigger className="w-24 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                      <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Выходной</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ═══ Обеденный перерыв ═══ */}
        <Card className="rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Coffee className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Обеденный перерыв</span>
          </div>
          <div>
            <div className="flex items-center gap-4">
              <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
              <span className={cn("text-sm", !lunchEnabled && "text-muted-foreground")}>{lunchEnabled ? "Перерыв включён" : "Без перерыва"}</span>
              {lunchEnabled && (
                <div className="flex items-center gap-2 ml-2">
                  <Select value={lunchFrom} onValueChange={setLunchFrom}>
                    <SelectTrigger className="w-24 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                    <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-muted-foreground">—</span>
                  <Select value={lunchTo} onValueChange={setLunchTo}>
                    <SelectTrigger className="w-24 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                    <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ═══ Праздничные дни ═══ */}
        <Card className="rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarOff className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Выходные и праздничные дни</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Даты когда компания не работает</p>
          <div className="space-y-2">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Дата</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Название</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2 text-sm font-mono text-muted-foreground">{h.date}</td>
                    <td className="px-3 py-2 text-sm">{h.name}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHolidays((prev) => prev.filter((x) => x.id !== h.id))}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 pt-1">
              <Input value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} placeholder="ДД.ММ" className="w-24 h-9 text-sm bg-[var(--input-bg)] font-mono" maxLength={5} />
              <Input value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="Название праздника" className="flex-1 h-9 text-sm bg-[var(--input-bg)]" onKeyDown={(e) => { if (e.key === "Enter") addHoliday() }} />
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs shrink-0" onClick={addHoliday} disabled={!newHolidayDate || !newHolidayName.trim()}>
                <Plus className="size-3.5" />Добавить
              </Button>
            </div>
          </div>
        </Card>

        {/* ═══ Отпуска и отсутствия ═══ */}
        <Card className="rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Palmtree className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Отпуска и отсутствия</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAbsenceDialogOpen(true)}>
              <Plus className="size-3" />Добавить
            </Button>
          </div>
          <div>
            {absences.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Нет запланированных отпусков</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Сотрудник</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Тип</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Начало</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Окончание</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Статус</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {absences.map((a) => {
                    const st = ABSENCE_STATUS_CFG[a.status]
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-3 py-2.5 text-sm font-medium">{a.employee}</td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground">{ABSENCE_TYPES[a.type]}</td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground font-mono">{a.dateFrom}</td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground font-mono">{a.dateTo}</td>
                        <td className="px-3 py-2.5"><Badge variant="outline" className={cn("text-[10px] px-2.5 py-0.5 rounded-full font-medium border-transparent", st.cls)}>{st.label}</Badge></td>
                        <td className="px-3 py-2.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAbsences((prev) => prev.filter((x) => x.id !== a.id))}>
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* ═══ Ссылка на HR ═══ */}
        <div className="rounded-lg border border-dashed border-border p-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Настройки интервью и слотов для кандидатов</p>
          <Link href="/hr/hiring-settings">
            <Button variant="ghost" size="sm" className="text-xs">Настройки найма →</Button>
          </Link>
        </div>

        {/* ═══ Сохранить ═══ */}
        <div className="flex justify-end pb-2">
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
