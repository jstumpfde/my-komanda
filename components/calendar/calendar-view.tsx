"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  subDays,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns"
import { ru } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Clock,
  Globe,
  Link2,
  Copy,
  Check,
  Trash2,
  Building2,
  UserCircle,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { RU_HOLIDAYS } from "@/lib/schedule/holidays"
import { WeekView } from "@/components/calendar/week-view"
import { DayView } from "@/components/calendar/day-view"
import { MonthView } from "@/components/calendar/month-view"
import { EventModal } from "@/components/calendar/event-modal"
import { Badge } from "@/components/ui/badge"
import type { CalendarEvent } from "@/components/calendar/week-view"
import type { EventFormData } from "@/components/calendar/event-modal"

type ViewMode = "week" | "day" | "month"
type FilterMode = "all" | "mine" | "hr"

interface Room {
  id: string
  name: string
  capacity?: number | null
  floor?: string | null
  equipment?: string[] | null
  isActive?: boolean | null
}

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "Компания" },
  { value: "hr", label: "HR" },
  { value: "mine", label: "Мой" },
]

const VALID_VIEW_MODES: ViewMode[] = ["week", "day", "month"]
const VALID_FILTER_MODES: FilterMode[] = ["all", "mine", "hr"]

/**
 * CalendarView — автономный клиентский компонент календаря.
 * Монтировать только при активном табе «Календарь» (ленивый рендер).
 *
 * Query-параметры (читаются/пишутся):
 *   view   — day | week | month  (вид внутри календаря)
 *   filter — all | hr | mine     (фильтр событий)
 *
 * Параметр `tab` (interviews | calendar) управляется родительской страницей
 * и в этом компоненте не затрагивается.
 */
export function CalendarView({ vacancyId }: { vacancyId?: string } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = searchParams?.get("view") as ViewMode | null
    return v && VALID_VIEW_MODES.includes(v) ? v : "week"
  })
  const [filter, setFilter] = useState<FilterMode>(() => {
    const f = searchParams?.get("filter") as FilterMode | null
    return f && VALID_FILTER_MODES.includes(f) ? f : "all"
  })

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    let changed = false
    if (sp.get("view") !== viewMode) { sp.set("view", viewMode); changed = true }
    if (sp.get("filter") !== filter) { sp.set("filter", filter); changed = true }
    if (changed) router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filter])

  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(false)

  // Modal & settings state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Calendar settings
  interface DaySchedule { enabled: boolean; start: string; end: string; slot: string }
  const DEFAULT_WEEK_SCHEDULE: Record<number, DaySchedule> = {
    1: { enabled: true,  start: "09:00", end: "18:00", slot: "60" },
    2: { enabled: true,  start: "09:00", end: "18:00", slot: "60" },
    3: { enabled: true,  start: "09:00", end: "18:00", slot: "60" },
    4: { enabled: true,  start: "09:00", end: "18:00", slot: "60" },
    5: { enabled: true,  start: "09:00", end: "18:00", slot: "60" },
    6: { enabled: false, start: "10:00", end: "16:00", slot: "60" },
    0: { enabled: false, start: "10:00", end: "16:00", slot: "60" },
  }
  const [weekSchedule, setWeekSchedule] = useState<Record<number, DaySchedule>>(DEFAULT_WEEK_SCHEDULE)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const updateDay = (day: number, patch: Partial<DaySchedule>) => {
    setWeekSchedule(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
  }

  const loadCalendarSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/calendar/settings")
      if (res.ok) {
        const data = await res.json() as {
          calendarWeekSchedule?: Record<string, DaySchedule> | null
          calendarExcludedHolidayIds?: string[] | null
          calendarCustomHolidays?: { from: string; to: string; label: string }[] | null
        }
        if (data.calendarWeekSchedule && typeof data.calendarWeekSchedule === "object") {
          const loaded: Record<number, DaySchedule> = { ...DEFAULT_WEEK_SCHEDULE }
          for (const [k, v] of Object.entries(data.calendarWeekSchedule)) {
            const day = parseInt(k, 10)
            if (!isNaN(day) && v && typeof v === "object") {
              loaded[day] = v as DaySchedule
            }
          }
          setWeekSchedule(loaded)
        }
        if (Array.isArray(data.calendarExcludedHolidayIds)) {
          setExcludedHolidayIds(data.calendarExcludedHolidayIds)
        }
        if (Array.isArray(data.calendarCustomHolidays)) {
          setCustomHolidays(data.calendarCustomHolidays)
        }
      }
    } catch {
      // Тихо — дефолт уже установлен
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveCalendarSettings = async () => {
    setSavingSchedule(true)
    try {
      const toSave: Record<string, DaySchedule> = {}
      for (const [k, v] of Object.entries(weekSchedule)) {
        toSave[String(k)] = v
      }
      const res = await fetch("/api/modules/hr/calendar/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarWeekSchedule: toSave }),
      })
      if (res.ok) {
        toast.success("Расписание сохранено")
      } else {
        toast.error("Не удалось сохранить расписание")
      }
    } catch {
      toast.error("Ошибка сохранения")
    } finally {
      setSavingSchedule(false)
    }
  }

  // ── Company-level праздники (единый источник #14) ──────────────────────────
  const [excludedHolidayIds, setExcludedHolidayIds] = useState<string[]>([])
  const [customHolidays, setCustomHolidays] = useState<{ from: string; to: string; label: string }[]>([])
  const [savingHolidays, setSavingHolidays] = useState(false)
  const [customHolidayDialogOpen, setCustomHolidayDialogOpen] = useState(false)

  const toggleExcludedHoliday = (id: string) => {
    setExcludedHolidayIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }
  const removeCustomHoliday = (idx: number) => {
    setCustomHolidays(prev => prev.filter((_, i) => i !== idx))
  }
  const addCustomHoliday = (h: { from: string; to: string; label: string }) => {
    setCustomHolidays(prev => [...prev, h])
  }
  const saveHolidays = async () => {
    setSavingHolidays(true)
    try {
      const res = await fetch("/api/modules/hr/calendar/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarExcludedHolidayIds: excludedHolidayIds,
          calendarCustomHolidays: customHolidays,
        }),
      })
      if (res.ok) {
        toast.success("Праздничные дни сохранены")
      } else {
        toast.error("Не удалось сохранить праздники")
      }
    } catch {
      toast.error("Ошибка сохранения")
    } finally {
      setSavingHolidays(false)
    }
  }
  const [timezone, setTimezone] = useState("Europe/Moscow")
  const [showWeekNumbers, setShowWeekNumbers] = useState(false)
  const [defaultView, setDefaultView] = useState<ViewMode>("week")
  const [icalFeeds, setIcalFeeds] = useState<{ id: string; name: string; url: string; active: boolean }[]>([
    { id: "1", name: "Google Calendar", url: "", active: false },
  ])
  const [newFeedUrl, setNewFeedUrl] = useState("")
  const [copiedFeed, setCopiedFeed] = useState(false)

  // Room management
  const [newRoomName, setNewRoomName] = useState("")
  const [newRoomCapacity, setNewRoomCapacity] = useState("")
  const [syncCompanyRooms, setSyncCompanyRooms] = useState(false)

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return
    try {
      const res = await fetch("/api/modules/hr/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName.trim(), capacity: newRoomCapacity ? parseInt(newRoomCapacity) : null }),
      })
      if (res.ok) {
        const data = await res.json()
        setRooms(prev => [...prev, data.data ?? data])
        setNewRoomName("")
        setNewRoomCapacity("")
        toast.success(`Переговорная "${newRoomName.trim()}" добавлена`)
      } else {
        toast.error("Не удалось добавить переговорную")
      }
    } catch {
      setRooms(prev => [...prev, { id: String(Date.now()), name: newRoomName.trim(), capacity: newRoomCapacity ? parseInt(newRoomCapacity) : null }])
      setNewRoomName("")
      setNewRoomCapacity("")
      toast.success(`Переговорная "${newRoomName.trim()}" добавлена (локально)`)
    }
  }

  const DAYS_ORDER: { day: number; label: string }[] = [
    { day: 1, label: "Пн" }, { day: 2, label: "Вт" }, { day: 3, label: "Ср" },
    { day: 4, label: "Чт" }, { day: 5, label: "Пт" }, { day: 6, label: "Сб" }, { day: 0, label: "Вс" },
  ]
  const TIME_OPTIONS = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"]
  const SLOT_OPTIONS = [{ v: "15", l: "15м" },{ v: "30", l: "30м" },{ v: "45", l: "45м" },{ v: "60", l: "60м" },{ v: "90", l: "90м" },{ v: "120", l: "2ч" }]

  const addIcalFeed = () => {
    if (!newFeedUrl.trim()) return
    setIcalFeeds(prev => [...prev, { id: String(Date.now()), name: "Внешний календарь", url: newFeedUrl.trim(), active: true }])
    setNewFeedUrl("")
    toast.success("Календарь добавлен")
  }

  const removeIcalFeed = (id: string) => {
    setIcalFeeds(prev => prev.filter(f => f.id !== id))
    toast.success("Календарь удалён")
  }

  const toggleIcalFeed = (id: string) => {
    setIcalFeeds(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f))
  }

  const exportIcalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/modules/hr/calendar/ical`

  const copyExportUrl = async () => {
    await navigator.clipboard.writeText(exportIcalUrl)
    setCopiedFeed(true)
    toast.success("Ссылка скопирована")
    setTimeout(() => setCopiedFeed(false), 2000)
  }

  const getDateRange = useCallback(() => {
    if (viewMode === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }
    }
    if (viewMode === "day") {
      return { start: currentDate, end: currentDate }
    }
    const ms = startOfMonth(currentDate)
    const me = endOfMonth(currentDate)
    return {
      start: startOfWeek(ms, { weekStartsOn: 1 }),
      end: endOfWeek(me, { weekStartsOn: 1 }),
    }
  }, [viewMode, currentDate])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange()
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        filter,
      })
      // Внутри вакансии — показываем события только этой вакансии.
      if (vacancyId) params.set("vacancyId", vacancyId)
      const res = await fetch(`/api/modules/hr/calendar?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data)
      }
    } finally {
      setLoading(false)
    }
  }, [getDateRange, filter, vacancyId])

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/modules/hr/rooms")
    if (res.ok) {
      const data = await res.json()
      setRooms(data)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  useEffect(() => {
    loadCalendarSettings()
  }, [loadCalendarSettings])

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "week") {
      setCurrentDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)))
    } else if (viewMode === "day") {
      setCurrentDate((d) => (dir === 1 ? addDays(d, 1) : subDays(d, 1)))
    } else {
      setCurrentDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)))
    }
  }

  const getTitle = () => {
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
      const we = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(ws, "d MMM", { locale: ru })} — ${format(we, "d MMM yyyy", { locale: ru })}`
    }
    if (viewMode === "day") {
      return format(currentDate, "d MMMM yyyy", { locale: ru })
    }
    return format(currentDate, "LLLL yyyy", { locale: ru })
  }

  const openNewEvent = (date?: Date) => {
    setSelectedEvent(null)
    setDefaultDate(date ?? new Date())
    setModalOpen(true)
  }

  const openEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setDefaultDate(null)
    setModalOpen(true)
  }

  const handleSave = async (data: EventFormData) => {
    if (selectedEvent) {
      await fetch(`/api/modules/hr/calendar/${selectedEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          startAt: new Date(data.startAt).toISOString(),
          endAt: new Date(data.endAt).toISOString(),
          roomId: data.roomId || null,
        }),
      })
    } else {
      await fetch("/api/modules/hr/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          startAt: new Date(data.startAt).toISOString(),
          endAt: new Date(data.endAt).toISOString(),
          roomId: data.roomId || null,
          // Внутри вакансии — новое событие привязываем к ней.
          vacancyId: data.vacancyId ?? vacancyId ?? null,
        }),
      })
    }
    await loadEvents()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/modules/hr/calendar/${id}`, { method: "DELETE" })
    await loadEvents()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] px-4 sm:px-14">
      {/* Top bar — Row 2: Navigation (left) + Filters & Actions (right) */}
      <div className="flex items-center justify-between py-3 border-b gap-4">
        {/* Navigation — left */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Сегодня
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium capitalize min-w-[180px]">
            {getTitle()}
          </span>
        </div>

        {/* Filters & Actions — right */}
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <TabsList>
              {FILTER_OPTIONS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day">День</TabsTrigger>
              <TabsTrigger value="week">Неделя</TabsTrigger>
              <TabsTrigger value="month">Месяц</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button onClick={() => openNewEvent()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Новое событие
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)} title="Настройки календаря">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="h-3" />

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Загрузка...</div>
          </div>
        )}
        {viewMode === "week" && (
          <WeekView
            currentDate={currentDate}
            events={events}
            weekSchedule={weekSchedule}
            onSlotClick={(date) => openNewEvent(date)}
            onEventClick={openEditEvent}
          />
        )}
        {viewMode === "day" && (
          <DayView
            currentDate={currentDate}
            events={events}
            onSlotClick={(date) => openNewEvent(date)}
            onEventClick={openEditEvent}
          />
        )}
        {viewMode === "month" && (
          <MonthView
            currentDate={currentDate}
            events={events}
            weekSchedule={weekSchedule}
            onEventClick={openEditEvent}
          />
        )}
      </div>

      {/* Event modal */}
      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={selectedEvent}
        defaultDate={defaultDate}
        rooms={rooms}
        onSave={handleSave}
        onDelete={selectedEvent ? handleDelete : undefined}
      />

      {/* ═══ Settings Sheet ═══ */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="size-5" />Настройки календаря
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-2 px-4 pb-6">

            {/* ── Рабочее время по дням ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="size-4" />Рабочее время</CardTitle>
                <CardDescription>Настройте расписание для каждого дня недели</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 overflow-x-auto">
                {DAYS_ORDER.map(({ day, label }) => {
                  const s = weekSchedule[day]
                  return (
                    <div key={day} className="flex items-center gap-2 min-w-max">
                      <Switch checked={s.enabled} onCheckedChange={v => updateDay(day, { enabled: v })} className="scale-90" />
                      <span className={cn("w-6 text-xs font-semibold shrink-0", s.enabled ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                      <Select value={s.start} onValueChange={v => updateDay(day, { start: v })} disabled={!s.enabled}>
                        <SelectTrigger className={cn("h-7 w-[90px] text-xs", !s.enabled && "opacity-40")}><SelectValue /></SelectTrigger>
                        <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                      <span className={cn("text-xs", !s.enabled && "text-muted-foreground/40")}>—</span>
                      <Select value={s.end} onValueChange={v => updateDay(day, { end: v })} disabled={!s.enabled}>
                        <SelectTrigger className={cn("h-7 w-[90px] text-xs", !s.enabled && "opacity-40")}><SelectValue /></SelectTrigger>
                        <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={s.slot} onValueChange={v => updateDay(day, { slot: v })} disabled={!s.enabled}>
                        <SelectTrigger className={cn("h-7 w-[76px] text-xs", !s.enabled && "opacity-40")}><SelectValue /></SelectTrigger>
                        <SelectContent>{SLOT_OPTIONS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )
                })}
                <div className="flex justify-end mt-2">
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveCalendarSettings} disabled={savingSchedule}>
                    <Check className="size-3" />
                    {savingSchedule ? "Сохранение…" : "Сохранить расписание"}
                  </Button>
                </div>
                <Separator className="my-2" />
                <div>
                  <Label className="text-sm font-medium">Праздничные дни РФ</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                    Отметьте дни, когда НЕ работаете. Эти настройки применяются и в расписании вакансий.
                  </p>
                  <div className="grid grid-cols-2 gap-y-1.5 mb-3">
                    {RU_HOLIDAYS.map(h => (
                      <label key={h.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={excludedHolidayIds.includes(h.id)}
                          onCheckedChange={() => toggleExcludedHoliday(h.id)}
                        />
                        <span className="text-foreground text-xs font-mono">
                          {String(h.day).padStart(2, "0")}.{String(h.month).padStart(2, "0")}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">{h.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm font-medium">Свои нерабочие дни</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setCustomHolidayDialogOpen(true)}
                    >
                      <Plus className="size-3" /> Добавить
                    </Button>
                  </div>
                  {customHolidays.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic mb-2">
                      Корпоративные выходные, перенесённые дни и т.п.
                    </p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {customHolidays.map((c, i) => (
                        <div key={i} className="flex items-center justify-between rounded border bg-card px-2.5 py-1.5 text-xs">
                          <div>
                            <span className="font-medium">{c.label || "(без названия)"}</span>
                            <span className="text-muted-foreground ml-2">
                              {c.from === c.to ? c.from : `${c.from} — ${c.to}`}
                            </span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeCustomHoliday(i)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveHolidays} disabled={savingHolidays}>
                      <Check className="size-3" />
                      {savingHolidays ? "Сохранение…" : "Сохранить праздники"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Отображение ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Globe className="size-4" />Отображение</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-xs w-24 shrink-0">Часовой пояс</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Europe/Kaliningrad">Калининград (UTC+2)</SelectItem>
                      <SelectItem value="Europe/Moscow">Москва (UTC+3)</SelectItem>
                      <SelectItem value="Europe/Samara">Самара (UTC+4)</SelectItem>
                      <SelectItem value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</SelectItem>
                      <SelectItem value="Asia/Novosibirsk">Новосибирск (UTC+7)</SelectItem>
                      <SelectItem value="Asia/Vladivostok">Владивосток (UTC+10)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs w-24 shrink-0">Вид по умолч.</Label>
                  <Select value={defaultView} onValueChange={v => setDefaultView(v as ViewMode)}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">День</SelectItem>
                      <SelectItem value="week">Неделя</SelectItem>
                      <SelectItem value="month">Месяц</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs flex-1">Номера недель</Label>
                  <Switch checked={showWeekNumbers} onCheckedChange={setShowWeekNumbers} className="scale-90" />
                </div>
              </CardContent>
            </Card>

            {/* ── Видимость календарей и переговорные ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="size-4" />Видимость календарей</CardTitle>
                <CardDescription>Какие календари и переговорные отображать в сетке</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-blue-500" />
                    <Label className="text-sm flex items-center gap-1.5"><Building2 className="size-3.5" />Компания (общий)</Label>
                  </div>
                  <Switch defaultChecked className="scale-90" />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-violet-500" />
                    <Label className="text-sm flex items-center gap-1.5"><Users className="size-3.5" />HR-отдел</Label>
                  </div>
                  <Switch defaultChecked className="scale-90" />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-emerald-500" />
                    <Label className="text-sm flex items-center gap-1.5"><UserCircle className="size-3.5" />Мой личный</Label>
                  </div>
                  <Switch defaultChecked className="scale-90" />
                </div>

                <Separator className="my-2" />

                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Переговорные</p>

                {rooms.map(room => {
                  const busy = events.some(e => e.roomId === room.id)
                  return (
                    <div key={room.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2.5 rounded-full", busy ? "bg-red-500" : "bg-amber-500")} />
                        <span className="text-sm">{room.name}</span>
                        {room.capacity && <span className="text-[10px] text-muted-foreground">({room.capacity})</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px] h-5", busy ? "text-red-600 border-red-200" : "text-emerald-600 border-emerald-200")}>
                          {busy ? "Занята" : "Свободна"}
                        </Badge>
                        <Switch defaultChecked className="scale-90" />
                      </div>
                    </div>
                  )
                })}

                <div className="flex gap-2 mt-1">
                  <Input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="Название" className="h-7 text-xs flex-1" />
                  <Input type="number" value={newRoomCapacity} onChange={e => setNewRoomCapacity(e.target.value)} placeholder="Мест" className="h-7 text-xs w-14" />
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={handleAddRoom} disabled={!newRoomName.trim()}>
                    <Plus className="size-3 mr-1" />Добавить
                  </Button>
                </div>

                <div className="flex items-center justify-between mt-1">
                  <p className="text-[11px] text-muted-foreground">Синхронизация с календарём компании</p>
                  <Switch checked={syncCompanyRooms} onCheckedChange={setSyncCompanyRooms} className="scale-90" />
                </div>
              </CardContent>
            </Card>

            {/* ── Внешние календари (iCal) ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Link2 className="size-4" />Внешние календари (iCal)</CardTitle>
                <CardDescription>Подключите Google Calendar, Outlook или другой iCal-совместимый календарь</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {icalFeeds.map(feed => (
                  <div key={feed.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                    <Switch checked={feed.active} onCheckedChange={() => toggleIcalFeed(feed.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{feed.name}</p>
                      {feed.url && <p className="text-[10px] text-muted-foreground font-mono truncate">{feed.url}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeIcalFeed(feed.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Input
                    value={newFeedUrl}
                    onChange={e => setNewFeedUrl(e.target.value)}
                    placeholder="https://calendar.google.com/...ical"
                    className="h-9 text-sm font-mono flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={addIcalFeed} disabled={!newFeedUrl.trim()}>
                    <Plus className="size-4 mr-1" />Добавить
                  </Button>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-medium mb-1.5">Экспорт вашего календаря</p>
                  <p className="text-[11px] text-muted-foreground mb-2">Добавьте эту ссылку в Google Calendar, Apple Calendar или Outlook</p>
                  <div className="flex gap-2">
                    <Input value={exportIcalUrl} readOnly className="h-9 text-xs font-mono flex-1 bg-muted" />
                    <Button size="sm" variant="outline" onClick={copyExportUrl}>
                      {copiedFeed ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </SheetContent>
      </Sheet>

      {/* ── Диалог «Свой нерабочий день» ── */}
      <CalendarCustomHolidayDialog
        open={customHolidayDialogOpen}
        onOpenChange={setCustomHolidayDialogOpen}
        onAdd={(h) => { addCustomHoliday(h); setCustomHolidayDialogOpen(false) }}
      />
    </div>
  )
}

// ── Диалог добавления кастомного нерабочего дня ─────────────────────────────

function CalendarCustomHolidayDialog({
  open, onOpenChange, onAdd,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdd: (h: { from: string; to: string; label: string }) => void
}) {
  const [mode, setMode] = useState<"single" | "range">("single")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  const reset = () => { setMode("single"); setFrom(""); setTo(""); setLabel(""); setError(null) }
  useEffect(() => { if (!open) reset() }, [open])

  const submit = () => {
    if (!from) { setError("Укажите дату"); return }
    const finalTo = mode === "range" ? to : from
    if (mode === "range" && !to) { setError("Укажите дату окончания"); return }
    if (finalTo < from) { setError("Дата окончания раньше начала"); return }
    if (!label.trim()) { setError("Введите название"); return }
    onAdd({ from, to: finalTo, label: label.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Свой нерабочий день</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="flex gap-2">
            {(["single", "range"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 h-9 rounded-md border text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-input",
                )}
              >
                {m === "single" ? "Один день" : "Период"}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label className="text-sm">{mode === "single" ? "Дата" : "С"}</Label>
            <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setError(null) }} />
          </div>
          {mode === "range" && (
            <div className="space-y-2">
              <Label className="text-sm">До</Label>
              <Input type="date" value={to} onChange={e => { setTo(e.target.value); setError(null) }} />
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm">Название</Label>
            <Input
              value={label}
              onChange={e => { setLabel(e.target.value); setError(null) }}
              placeholder="Например: Корпоративный отпуск"
              maxLength={100}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="button" onClick={submit}>Добавить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
