"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Calendar, Clock, Save, Plus, X, Bell, MessageSquare, Link2, Trash2, RefreshCw, CheckCircle2 } from "lucide-react"

const WEEKDAYS = [
  { id: "mon", label: "Пн" }, { id: "tue", label: "Вт" }, { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" }, { id: "fri", label: "Пт" }, { id: "sat", label: "Сб" }, { id: "sun", label: "Вс" },
]

export default function ScheduleSettingsPage() {
  type DaySchedule = { enabled: boolean; start: string; end: string }
  const [daySchedule, setDaySchedule] = useState<Record<string, DaySchedule>>({
    mon: { enabled: true,  start: "09:00", end: "19:00" },
    tue: { enabled: true,  start: "09:00", end: "18:00" },
    wed: { enabled: true,  start: "09:00", end: "19:00" },
    thu: { enabled: true,  start: "09:00", end: "18:00" },
    fri: { enabled: true,  start: "09:00", end: "18:00" },
    sat: { enabled: false, start: "10:00", end: "15:00" },
    sun: { enabled: false, start: "10:00", end: "15:00" },
  })
  const workDays = Object.entries(daySchedule).filter(([, v]) => v.enabled).map(([k]) => k)
  const updateDay = (id: string, patch: Partial<DaySchedule>) =>
    setDaySchedule(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  const [defaultDuration, setDefaultDuration] = useState("45")
  const [buffer, setBuffer] = useState("15")
  type BlockedEntry = { id: string } & ({ type: "date"; date: string } | { type: "range"; from: string; to: string })
  const [blockedDates, setBlockedDates] = useState<BlockedEntry[]>([
    { id: "b1", type: "date", date: "2026-03-20" },
    { id: "b2", type: "date", date: "2026-04-01" },
  ])
  const [addMode, setAddMode] = useState<"date" | "range" | "hours">("date")
  const [newBlockedDate, setNewBlockedDate] = useState("")
  const [rangeFrom, setRangeFrom] = useState("")
  const [rangeTo, setRangeTo] = useState("")
  // Недоступные часы
  type BlockedHour = { id: string; day: string; from: string; to: string }
  const [blockedHours, setBlockedHours] = useState<BlockedHour[]>([])
  const [hourDay, setHourDay] = useState("everyday")
  const [hourFrom, setHourFrom] = useState("12:00")
  const [hourTo, setHourTo] = useState("13:00")
  const DAY_OPTIONS = [
    { value: "everyday", label: "Каждый день" },
    { value: "mon", label: "Пн" }, { value: "tue", label: "Вт" }, { value: "wed", label: "Ср" },
    { value: "thu", label: "Чт" }, { value: "fri", label: "Пт" }, { value: "sat", label: "Сб" }, { value: "sun", label: "Вс" },
  ]
  const addBlockedHour = () => {
    if (!hourFrom || !hourTo || hourFrom >= hourTo) { toast.error("Укажите корректный диапазон часов"); return }
    setBlockedHours(prev => [...prev, { id: Date.now().toString(), day: hourDay, from: hourFrom, to: hourTo }])
    toast.success("Временной блок добавлен")
  }
  // Обед
  const [lunchEnabled, setLunchEnabled] = useState(true)
  const [lunchFrom, setLunchFrom] = useState("13:00")
  const [lunchTo, setLunchTo] = useState("14:00")

  // Интеграции с календарями
  type CalProvider = "google" | "outlook" | "apple" | "caldav"
  type CalIntegration = { id: string; provider: CalProvider; label: string; url?: string; status: "connected" | "syncing" | "error" }
  const [calIntegrations, setCalIntegrations] = useState<CalIntegration[]>([])
  const [calProvider, setCalProvider] = useState<CalProvider>("google")
  const [calUrl, setCalUrl] = useState("")

  const CAL_PROVIDERS: Record<CalProvider, { label: string; icon: string; needsUrl: boolean; hint: string }> = {
    google:  { label: "Google Calendar",  icon: "🗓️", needsUrl: false, hint: "Подключение через OAuth" },
    outlook: { label: "Outlook / Microsoft 365", icon: "📅", needsUrl: false, hint: "Подключение через Microsoft OAuth" },
    apple:   { label: "Apple Calendar (iCloud)", icon: "🍎", needsUrl: true,  hint: "Вставьте CalDAV URL из настроек iCloud" },
    caldav:  { label: "Другой CalDAV",    icon: "🔗", needsUrl: true,  hint: "URL-адрес CalDAV-сервера" },
  }

  const addCalIntegration = () => {
    const p = CAL_PROVIDERS[calProvider]
    if (p.needsUrl && !calUrl.trim()) { toast.error("Введите URL календаря"); return }
    const newInt: CalIntegration = {
      id: Date.now().toString(),
      provider: calProvider,
      label: p.label,
      url: calUrl || undefined,
      status: "connected",
    }
    setCalIntegrations(prev => [...prev, newInt])
    setCalUrl("")
    toast.success(`${p.label} подключён`)
  }

  const removeCalIntegration = (id: string) => {
    setCalIntegrations(prev => prev.filter(c => c.id !== id))
    toast.info("Календарь отключён")
  }

  const syncCalIntegration = (id: string) => {
    setCalIntegrations(prev => prev.map(c => c.id === id ? { ...c, status: "syncing" } : c))
    setTimeout(() => {
      setCalIntegrations(prev => prev.map(c => c.id === id ? { ...c, status: "connected" } : c))
      toast.success("Синхронизация завершена")
    }, 1500)
  }

  // Напоминания
  const [remind24h, setRemind24h] = useState(true)
  const [remindMorning, setRemindMorning] = useState(true)
  const [remindBeforeHours, setRemindBeforeHours] = useState("2")
  const [remindNoShow, setRemindNoShow] = useState(false)
  const [noShowDelay, setNoShowDelay] = useState("15")


  const addBlockedDate = () => {
    if (addMode === "date") {
      if (!newBlockedDate) return
      setBlockedDates(prev => [...prev, { id: Date.now().toString(), type: "date", date: newBlockedDate }])
      setNewBlockedDate("")
    } else {
      if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) { toast.error("Укажите корректный период"); return }
      setBlockedDates(prev => [...prev, { id: Date.now().toString(), type: "range", from: rangeFrom, to: rangeTo }])
      setRangeFrom(""); setRangeTo("")
    }
  }

  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })

  return (
        <>
<div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Планировщик слотов</h1>
              <p className="text-muted-foreground text-sm">Настройки расписания и напоминаний для интервью</p>
            </div>

            <div className="space-y-6">
              {/* Рабочие дни */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4" /> Рабочее расписание</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {WEEKDAYS.map(d => {
                    const s = daySchedule[d.id]
                    return (
                      <div key={d.id} className="flex items-center gap-3 py-2">
                        <span className="w-6 text-sm font-medium text-foreground shrink-0">{d.label}</span>
                        <Switch checked={s.enabled} onCheckedChange={v => updateDay(d.id, { enabled: v })} />
                        {s.enabled ? (
                          <div className="flex items-center gap-2">
                            <Input type="time" value={s.start} onChange={e => updateDay(d.id, { start: e.target.value })} className="h-9 w-28 text-sm" />
                            <span className="text-muted-foreground">—</span>
                            <Input type="time" value={s.end} onChange={e => updateDay(d.id, { end: e.target.value })} className="h-9 w-28 text-sm" />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Выходной</span>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
                <CardContent className="pt-0 space-y-4">

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Длительность по умолчанию</Label>
                      <Select value={defaultDuration} onValueChange={setDefaultDuration}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 мин</SelectItem>
                          <SelectItem value="30">30 мин</SelectItem>
                          <SelectItem value="45">45 мин</SelectItem>
                          <SelectItem value="60">60 мин</SelectItem>
                          <SelectItem value="90">90 мин</SelectItem>
                          <SelectItem value="120">120 мин</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Буфер между встречами</Label>
                      <Select value={buffer} onValueChange={setBuffer}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 мин</SelectItem>
                          <SelectItem value="10">10 мин</SelectItem>
                          <SelectItem value="15">15 мин</SelectItem>
                          <SelectItem value="20">20 мин</SelectItem>
                          <SelectItem value="30">30 мин</SelectItem>
                          <SelectItem value="45">45 мин</SelectItem>
                          <SelectItem value="60">60 мин</SelectItem>
                          <SelectItem value="90">90 мин</SelectItem>
                          <SelectItem value="120">120 мин</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Недоступные даты */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><X className="w-4 h-4" /> Недоступное время</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Обед */}
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        🍽️ Перерыв на обед
                      </Label>
                      <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
                    </div>
                    {lunchEnabled && (
                      <div className="flex items-center gap-2 pt-1">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">с</Label>
                        <Input type="time" value={lunchFrom} onChange={e => setLunchFrom(e.target.value)} className="h-8 w-32 text-sm" />
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">до</Label>
                        <Input type="time" value={lunchTo} onChange={e => setLunchTo(e.target.value)} className="h-8 w-32 text-sm" />
                        <span className="text-xs text-muted-foreground">каждый день</span>
                      </div>
                    )}
                  </div>

                  {/* Переключатель режима */}
                  <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
                    {(["date", "range", "hours"] as const).map(m => (
                      <button key={m}
                        className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all",
                          addMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setAddMode(m)}
                      >
                        {m === "date" ? "Дата" : m === "range" ? "Период (отпуск)" : "Часы"}
                      </button>
                    ))}
                  </div>

                  {/* Добавленные даты */}
                  {(addMode === "date" || addMode === "range") && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {blockedDates.map(entry => (
                          <Badge key={entry.id} variant="outline" className="gap-1.5 text-xs">
                            {entry.type === "date" ? fmtDate(entry.date) : `${fmtDate(entry.from)} — ${fmtDate(entry.to)}`}
                            <button onClick={() => setBlockedDates(prev => prev.filter(x => x.id !== entry.id))}><X className="w-3 h-3" /></button>
                          </Badge>
                        ))}
                      </div>
                      {addMode === "date" ? (
                        <div className="flex items-center gap-2">
                          <Input type="date" value={newBlockedDate} onChange={e => setNewBlockedDate(e.target.value)} className="h-9 w-48" />
                          <Button variant="outline" size="sm" onClick={addBlockedDate}><Plus className="w-3.5 h-3.5 mr-1" /> Добавить</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">с</Label>
                            <Input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="h-9 w-44" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">по</Label>
                            <Input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="h-9 w-44" />
                          </div>
                          <Button variant="outline" size="sm" onClick={addBlockedDate}><Plus className="w-3.5 h-3.5 mr-1" /> Добавить</Button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Недоступные часы */}
                  {addMode === "hours" && (
                    <div className="space-y-3">
                      {blockedHours.length > 0 && (
                        <div className="space-y-1.5">
                          {blockedHours.map(h => {
                            const dayLabel = DAY_OPTIONS.find(d => d.value === h.day)?.label ?? h.day
                            return (
                              <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm">
                                <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">{dayLabel}</span>
                                <span className="flex-1">{h.from} — {h.to}</span>
                                <button onClick={() => setBlockedHours(prev => prev.filter(x => x.id !== h.id))} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">День недели</Label>
                          <Select value={hourDay} onValueChange={setHourDay}>
                            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DAY_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">с</Label>
                          <Input type="time" value={hourFrom} onChange={e => setHourFrom(e.target.value)} className="h-9 w-32 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">до</Label>
                          <Input type="time" value={hourTo} onChange={e => setHourTo(e.target.value)} className="h-9 w-32 text-sm" />
                        </div>
                        <Button variant="outline" size="sm" className="h-9" onClick={addBlockedHour}><Plus className="w-3.5 h-3.5 mr-1" /> Добавить</Button>
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>

              {/* Напоминания */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Напоминания кандидатам</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">За 24 часа до встречи</Label>
                      <p className="text-xs text-muted-foreground">Сообщение в канал кандидата</p>
                    </div>
                    <Switch checked={remind24h} onCheckedChange={setRemind24h} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Утреннее напоминание</Label>
                      <p className="text-xs text-muted-foreground">В 10:00 или за настраиваемое время</p>
                    </div>
                    <Switch checked={remindMorning} onCheckedChange={setRemindMorning} />
                  </div>

                  {remindMorning && (
                    <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                      <Label className="text-sm">За сколько часов до встречи</Label>
                      <Select value={remindBeforeHours} onValueChange={setRemindBeforeHours}>
                        <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 час</SelectItem>
                          <SelectItem value="2">2 часа</SelectItem>
                          <SelectItem value="3">3 часа</SelectItem>
                          <SelectItem value="4">4 часа</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Если не пришёл</Label>
                      <p className="text-xs text-muted-foreground">Бот напишет кандидату после неявки</p>
                    </div>
                    <Switch checked={remindNoShow} onCheckedChange={setRemindNoShow} />
                  </div>

                  {remindNoShow && (
                    <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                      <Label className="text-sm">Через сколько минут</Label>
                      <Select value={noShowDelay} onValueChange={setNoShowDelay}>
                        <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 мин</SelectItem>
                          <SelectItem value="30">30 мин</SelectItem>
                          <SelectItem value="60">60 мин</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Интеграции с календарями */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4" /> Интеграции с календарями
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Подключите внешние календари — занятое время автоматически блокируется для записи</p>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Подключённые */}
                  {calIntegrations.length > 0 && (
                    <div className="space-y-2">
                      {calIntegrations.map(cal => (
                        <div key={cal.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                          <span className="text-lg shrink-0">{CAL_PROVIDERS[cal.provider].icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{cal.label}</p>
                            {cal.url && <p className="text-xs text-muted-foreground truncate">{cal.url}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {cal.status === "connected" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                            {cal.status === "syncing" && <RefreshCw className="w-4 h-4 text-primary animate-spin" />}
                            {cal.status === "error" && <X className="w-4 h-4 text-destructive" />}
                            <button
                              onClick={() => syncCalIntegration(cal.id)}
                              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              title="Синхронизировать"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeCalIntegration(cal.id)}
                              className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                              title="Отключить"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Добавить */}
                  <div className="space-y-3 p-3 rounded-lg border border-dashed">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Добавить календарь</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(CAL_PROVIDERS) as [CalProvider, typeof CAL_PROVIDERS[CalProvider]][]).map(([key, p]) => (
                        <button
                          key={key}
                          onClick={() => { setCalProvider(key); setCalUrl("") }}
                          className={cn(
                            "flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-all",
                            calProvider === key
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border hover:border-primary/30 text-muted-foreground"
                          )}
                        >
                          <span>{p.icon}</span>
                          <span className="text-xs font-medium leading-tight">{p.label}</span>
                        </button>
                      ))}
                    </div>

                    {CAL_PROVIDERS[calProvider].needsUrl && (
                      <div className="space-y-1">
                        <Input
                          placeholder={calProvider === "apple" ? "https://caldav.icloud.com/…" : "https://your-server/caldav/…"}
                          value={calUrl}
                          onChange={e => setCalUrl(e.target.value)}
                          className="h-9 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">{CAL_PROVIDERS[calProvider].hint}</p>
                      </div>
                    )}

                    {!CAL_PROVIDERS[calProvider].needsUrl && (
                      <p className="text-xs text-muted-foreground">{CAL_PROVIDERS[calProvider].hint}</p>
                    )}

                    <Button size="sm" className="gap-1.5 w-full" onClick={addCalIntegration}>
                      <Plus className="w-3.5 h-3.5" />
                      Подключить {CAL_PROVIDERS[calProvider].label}
                    </Button>
                  </div>

                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button className="gap-1.5" onClick={() => toast.success("Настройки расписания сохранены")}><Save className="w-4 h-4" /> Сохранить</Button>
              </div>
            </div>
    </>
  )
}
