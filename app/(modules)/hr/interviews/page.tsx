"use client"

import { useState, useMemo, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Video, Building2, ExternalLink, ChevronLeft, ChevronRight, List, CalendarDays, CalendarRange, Kanban, Clock, Settings, Plus, GripVertical, Pencil, Trash2, Save, X, Bell, BellOff, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ─── Типы ────────────────────────────────────────────────────

type InterviewType = "Техническое" | "HR" | "Финальное"
type InterviewFormat = "Онлайн" | "Офис"
type InterviewStatus = "Подтверждено" | "Ожидает" | "Пройдено" | "Не явился" | "Отменено"
type ViewMode = "list" | "calendar" | "week" | "kanban" | "day"
type StageCondition = "manual" | "date_before" | "date_today" | "date_after" | "status_confirmed" | "status_pending" | "status_cancelled"

interface Stage {
  id: string
  name: string
  emoji: string
  color: string
  condition: StageCondition
  isDefault: boolean
}

const DEFAULT_STAGES: Stage[] = [
  { id: "upcoming", name: "Предстоящие", emoji: "📅", color: "#3b82f6", condition: "date_after", isDefault: true },
  { id: "today", name: "Сегодня", emoji: "🌅", color: "#f59e0b", condition: "date_today", isDefault: true },
  { id: "past", name: "Прошедшие", emoji: "✅", color: "#22c55e", condition: "date_before", isDefault: true },
]

const STAGE_STORAGE_KEY = "hireflow-interview-stages"

function loadStages(): Stage[] {
  if (typeof window === "undefined") return DEFAULT_STAGES
  try { const raw = localStorage.getItem(STAGE_STORAGE_KEY); if (raw) return JSON.parse(raw) } catch {}
  return DEFAULT_STAGES
}
function saveStages(stages: Stage[]) {
  if (typeof window !== "undefined") localStorage.setItem(STAGE_STORAGE_KEY, JSON.stringify(stages))
}

const CONDITION_LABELS: Record<StageCondition, string> = {
  manual: "Вручную", date_before: "До сегодня", date_today: "Сегодня", date_after: "После сегодня",
  status_confirmed: "Статус: Подтверждено", status_pending: "Статус: Ожидает", status_cancelled: "Статус: Отменено",
}

const EMOJI_OPTIONS = ["📅", "🌅", "✅", "❌", "⏳", "🔥", "⭐", "📞", "🎯", "🏆", "🔔", "💼", "🎥", "🤝"]

// ─── Данные ──────────────────────────────────────────────────

interface Interview {
  id: number; date: Date; time: string; endTime: string; candidate: string; vacancy: string; interviewer: string; type: InterviewType; format: InterviewFormat; status: InterviewStatus
}

const today2 = new Date()
const d = (offset: number, h: number, m: number) => { const r = new Date(today2); r.setDate(r.getDate() + offset); r.setHours(h, m, 0, 0); return r }

const ALL_INTERVIEWS: Interview[] = [
  { id: 1, date: d(1, 10, 0), time: "10:00", endTime: "10:45", candidate: "Алексей Морозов", vacancy: "Менеджер по продажам", interviewer: "Анна И.", type: "Техническое", format: "Онлайн", status: "Подтверждено" },
  { id: 2, date: d(2, 14, 30), time: "14:30", endTime: "15:15", candidate: "Мария Соколова", vacancy: "Product Manager", interviewer: "Елена С.", type: "HR", format: "Офис", status: "Ожидает" },
  { id: 3, date: d(4, 11, 0), time: "11:00", endTime: "11:45", candidate: "Дмитрий Захаров", vacancy: "Backend Developer", interviewer: "Андрей К.", type: "Техническое", format: "Онлайн", status: "Подтверждено" },
  { id: 4, date: d(7, 15, 0), time: "15:00", endTime: "16:00", candidate: "Ольга Новикова", vacancy: "UX Designer", interviewer: "Наталья В.", type: "Финальное", format: "Офис", status: "Ожидает" },
  { id: 5, date: d(9, 9, 30), time: "09:30", endTime: "10:15", candidate: "Сергей Лебедев", vacancy: "DevOps Engineer", interviewer: "Кирилл Ф.", type: "HR", format: "Онлайн", status: "Подтверждено" },
  { id: 6, date: d(0, 11, 30), time: "11:30", endTime: "12:15", candidate: "Анна Кузнецова", vacancy: "Data Analyst", interviewer: "Максим О.", type: "Техническое", format: "Онлайн", status: "Подтверждено" },
  { id: 7, date: d(0, 16, 0), time: "16:00", endTime: "16:45", candidate: "Павел Воробьёв", vacancy: "QA Engineer", interviewer: "Светлана Б.", type: "HR", format: "Офис", status: "Ожидает" },
  { id: 8, date: d(-3, 10, 0), time: "10:00", endTime: "10:45", candidate: "Татьяна Михайлова", vacancy: "Marketing", interviewer: "Елена С.", type: "Финальное", format: "Офис", status: "Пройдено" },
  { id: 9, date: d(-5, 13, 0), time: "13:00", endTime: "13:45", candidate: "Роман Попов", vacancy: "iOS Developer", interviewer: "Андрей К.", type: "Техническое", format: "Онлайн", status: "Не явился" },
  { id: 10, date: d(-7, 15, 30), time: "15:30", endTime: "16:15", candidate: "Екатерина Семёнова", vacancy: "HR BP", interviewer: "Наталья В.", type: "HR", format: "Офис", status: "Пройдено" },
  { id: 11, date: d(-10, 9, 0), time: "09:00", endTime: "10:00", candidate: "Никита Григорьев", vacancy: "Android Dev", interviewer: "Кирилл Ф.", type: "Финальное", format: "Онлайн", status: "Пройдено" },
  { id: 12, date: d(-2, 14, 0), time: "14:00", endTime: "14:45", candidate: "Виктор Лебедев", vacancy: "Менеджер по продажам", interviewer: "Анна И.", type: "Финальное", format: "Онлайн", status: "Отменено" },
]

// ─── Утилиты ────────────────────────────────────────────────

const STATUS_STYLES: Record<InterviewStatus, string> = {
  "Подтверждено": "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  "Ожидает": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  "Пройдено": "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  "Не явился": "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  "Отменено": "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700",
}
const STATUS_DOT: Record<InterviewStatus, string> = {
  "Подтверждено": "bg-emerald-500", "Ожидает": "bg-amber-500", "Пройдено": "bg-gray-400", "Не явился": "bg-red-500", "Отменено": "bg-gray-300",
}

function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function isToday(dd: Date) { return isSameDay(dd, new Date()) }
function formatDateShort(dd: Date) { return dd.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) }
function formatDayFull(dd: Date) { return dd.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }) }

function filterByCondition(interviews: Interview[], condition: StageCondition): Interview[] {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const eod = new Date(now); eod.setHours(23, 59, 59, 999)
  switch (condition) {
    case "date_after": return interviews.filter(iv => iv.date > eod)
    case "date_today": return interviews.filter(iv => isSameDay(iv.date, new Date()))
    case "date_before": return interviews.filter(iv => iv.date < now)
    case "status_confirmed": return interviews.filter(iv => iv.status === "Подтверждено")
    case "status_pending": return interviews.filter(iv => iv.status === "Ожидает")
    case "status_cancelled": return interviews.filter(iv => iv.status === "Отменено" || iv.status === "Не явился")
    case "manual": return interviews
  }
}

function MiniCard({ iv, compact }: { iv: Interview; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2 transition-all cursor-pointer", STATUS_STYLES[iv.status], compact && "p-1.5")}>
      <div className="flex items-center gap-1.5">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[iv.status])} />
        <span className={cn("font-medium truncate", compact ? "text-[10px]" : "text-xs")}>{iv.time}</span>
        <span className={cn("truncate", compact ? "text-[10px]" : "text-xs")}>{iv.candidate}</span>
      </div>
      {!compact && <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-3">{iv.vacancy}</p>}
    </div>
  )
}

// ─── Компонент ──────────────────────────────────────────────

export default function InterviewsPage() {
  const [view, setView] = useState<ViewMode>("list")
  const [interviews, setInterviews] = useState<Interview[]>(ALL_INTERVIEWS)
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES)
  const [activeStage, setActiveStage] = useState<string>("upcoming")
  const [calMonth, setCalMonth] = useState(today2.getMonth())
  const [calYear, setCalYear] = useState(today2.getFullYear())
  const [dayOffset, setDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // Drag-drop state for interviews
  const [dragIvId, setDragIvId] = useState<number | null>(null)
  const [dropTargetHour, setDropTargetHour] = useState<number | null>(null)
  const [dropTargetDay, setDropTargetDay] = useState<string | null>(null)
  const [dropTargetStatus, setDropTargetStatus] = useState<InterviewStatus | null>(null)

  // Notify dialog
  const [notifyDialog, setNotifyDialog] = useState<{ message: string } | null>(null)

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmoji, setEditEmoji] = useState("")
  const [editColor, setEditColor] = useState("")
  const [editCondition, setEditCondition] = useState<StageCondition>("manual")
  const [addMode, setAddMode] = useState(false)

  useEffect(() => { setStages(loadStages()) }, [])

  // --- Interview drag helpers ---
  const updateInterview = (id: number, patch: Partial<Interview>, msg: string) => {
    setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, ...patch } : iv))
    setNotifyDialog({ message: msg })
  }

  const ivDragStart = (id: number) => setDragIvId(id)
  const ivDragEnd = () => { setDragIvId(null); setDropTargetHour(null); setDropTargetDay(null); setDropTargetStatus(null) }

  // Day view: drop on hour
  const dayDropOnHour = (hour: number) => {
    if (dragIvId === null) return
    const iv = interviews.find(x => x.id === dragIvId)
    if (!iv) return
    const newTime = `${String(hour).padStart(2, "0")}:00`
    const endH = hour + (iv.endTime && iv.time ? (parseInt(iv.endTime) - parseInt(iv.time)) : 1)
    const newEnd = `${String(Math.min(endH, 20)).padStart(2, "0")}:00`
    updateInterview(dragIvId, { time: newTime, endTime: newEnd }, `Встреча перенесена на ${newTime}`)
    ivDragEnd()
  }

  // Calendar view: drop on date
  const calDropOnDay = (targetDate: Date) => {
    if (dragIvId === null) return
    const newDate = new Date(targetDate)
    const iv = interviews.find(x => x.id === dragIvId)
    if (iv) {
      newDate.setHours(iv.date.getHours(), iv.date.getMinutes())
    }
    updateInterview(dragIvId, { date: newDate }, `Встреча перенесена на ${targetDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`)
    ivDragEnd()
  }

  // Kanban view: drop on status
  const kanbanDropOnStatus = (status: InterviewStatus) => {
    if (dragIvId === null) return
    updateInterview(dragIvId, { status }, `Статус изменён на «${status}»`)
    ivDragEnd()
  }

  // Week view: drop on day+hour
  const weekDropOnSlot = (day: Date, hour: number) => {
    if (dragIvId === null) return
    const iv = interviews.find(x => x.id === dragIvId)
    if (!iv) return
    const newDate = new Date(day); newDate.setHours(hour, 0, 0, 0)
    const newTime = `${String(hour).padStart(2, "0")}:00`
    const dur = iv.endTime && iv.time ? (parseInt(iv.endTime) - parseInt(iv.time)) : 1
    const newEnd = `${String(Math.min(hour + dur, 20)).padStart(2, "0")}:00`
    const dayLabel = day.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    updateInterview(dragIvId, { date: newDate, time: newTime, endTime: newEnd }, `Встреча перенесена на ${dayLabel} в ${newTime}`)
    ivDragEnd()
  }

  const currentStage = stages.find(s => s.id === activeStage) || stages[0]
  const filtered = useMemo(() => {
    if (!currentStage) return []
    const result = filterByCondition(interviews, currentStage.condition)
    return result.sort((a, b) => currentStage.condition === "date_before" ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime())
  }, [activeStage, currentStage, interviews])

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {}
    stages.forEach(s => { m[s.id] = filterByCondition(interviews, s.condition).length })
    return m
  }, [stages, interviews])

  // Stage CRUD
  const startEdit = (stage: Stage) => {
    setEditingId(stage.id); setEditName(stage.name); setEditEmoji(stage.emoji); setEditColor(stage.color); setEditCondition(stage.condition); setAddMode(false)
  }
  const startAdd = () => {
    setEditingId(null); setEditName(""); setEditEmoji("⭐"); setEditColor("#6b7280"); setEditCondition("manual"); setAddMode(true)
  }
  const saveEdit = () => {
    if (!editName.trim()) { toast.error("Введите название"); return }
    if (addMode) {
      const newStage: Stage = { id: `stage-${Date.now()}`, name: editName, emoji: editEmoji, color: editColor, condition: editCondition, isDefault: false }
      const next = [...stages, newStage]
      setStages(next); saveStages(next)
      toast.success(`Стадия «${editName}» добавлена`)
    } else if (editingId) {
      const next = stages.map(s => s.id === editingId ? { ...s, name: editName, emoji: editEmoji, color: editColor, condition: editCondition } : s)
      setStages(next); saveStages(next)
      toast.success("Стадия обновлена")
    }
    setEditingId(null); setAddMode(false)
  }
  const deleteStage = (id: string) => {
    const next = stages.filter(s => s.id !== id)
    setStages(next); saveStages(next)
    if (activeStage === id && next.length > 0) setActiveStage(next[0].id)
    toast.error("Стадия удалена")
  }

  // Drag reorder
  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const next = [...stages]; const [moved] = next.splice(dragIdx, 1); next.splice(idx, 0, moved)
    setStages(next); setDragIdx(idx)
  }
  const handleDragEnd = () => { if (dragIdx !== null) { saveStages(stages) }; setDragIdx(null) }

  const views: { mode: ViewMode; icon: typeof List; label: string }[] = [
    { mode: "list", icon: List, label: "Список" },
    { mode: "calendar", icon: CalendarDays, label: "Календарь" },
    { mode: "week", icon: CalendarRange, label: "Неделя" },
    { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
    { mode: "day", icon: Clock, label: "День" },
  ]

  // Calendar
  const calDate = new Date(calYear, calMonth, 1)
  const monthName = calDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
  const firstDay = (calDate.getDay() + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calDays = Array.from({ length: 42 }, (_, i) => { const dn = i - firstDay + 1; return (dn < 1 || dn > daysInMonth) ? null : new Date(calYear, calMonth, dn) })

  const viewDay = new Date(today2); viewDay.setDate(viewDay.getDate() + dayOffset)
  const dayInterviews = interviews.filter(iv => isSameDay(iv.date, viewDay)).sort((a, b) => a.time.localeCompare(b.time))
  const dayHours = Array.from({ length: 12 }, (_, i) => i + 9)

  // Week view
  const weekStart = useMemo(() => {
    const d = new Date(today2); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7); d.setHours(0, 0, 0, 0); return d
  }, [weekOffset])
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const weekLabel = `${weekDays[0].toLocaleDateString("ru-RU", { day: "numeric" })}–${weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`
  const weekDayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

  const TYPE_COLORS: Record<InterviewType, string> = { "Техническое": "#3b82f6", "HR": "#f59e0b", "Финальное": "#22c55e" }

  const kanbanStatuses: InterviewStatus[] = ["Ожидает", "Подтверждено", "Пройдено", "Отменено"]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Собеседования</h1>
                <p className="text-muted-foreground text-sm">Запланированные и прошедшие интервью</p>
              </div>
              <div className="flex items-center gap-2">
                {/* View switcher */}
                <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
                  {views.map(v => (
                    <Button key={v.mode} variant={view === v.mode ? "default" : "ghost"} size="sm"
                      className={cn("h-7 px-2 sm:px-3 text-xs gap-1", view === v.mode ? "shadow-sm" : "text-muted-foreground")}
                      style={view === v.mode ? { backgroundColor: "#C0622F", color: "#fff" } : undefined}
                      onClick={() => setView(v.mode)}>
                      <v.icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{v.label}</span>
                    </Button>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setSettingsOpen(true)}>
                  <Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">Настроить стадии</span>
                </Button>
              </div>
            </div>

            {/* Dynamic stage tabs */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
              <Tabs value={activeStage} onValueChange={setActiveStage}>
                <TabsList className="w-max sm:w-auto">
                  {stages.map(s => (
                    <TabsTrigger key={s.id} value={s.id} className="gap-1.5">
                      <span>{s.emoji}</span> {s.name}
                      <Badge className="ml-1 text-[10px] px-1.5 h-4 bg-primary/10 text-primary">{stageCounts[s.id] || 0}</Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* ═══ LIST ════════════════════════════════════════ */}
            {view === "list" && (
              <div className="space-y-3">
                {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Нет интервью</p>}
                {filtered.map(iv => (
                  <Card key={iv.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center justify-center min-w-[56px] bg-muted rounded-lg py-2 px-3">
                          <span className="text-2xl font-bold leading-none">{iv.date.getDate()}</span>
                          <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{iv.date.toLocaleDateString("ru-RU", { month: "short" }).toUpperCase()}</span>
                          <span className="text-xs font-semibold text-primary mt-1">{iv.time}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="font-semibold text-sm truncate">{iv.candidate}</span>
                            <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[iv.status])}>{iv.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mb-1">{iv.vacancy}</p>
                          <p className="text-xs text-muted-foreground">Интервьюер: <span className="text-foreground font-medium">{iv.interviewer}</span></p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="outline" className={cn("text-[10px]", iv.type === "Техническое" ? "border-blue-200 text-blue-700" : iv.type === "HR" ? "border-purple-200 text-purple-700" : "border-green-200 text-green-700")}>{iv.type}</Badge>
                            <Badge variant="outline" className="text-[10px] gap-1">{iv.format === "Онлайн" ? <Video className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}{iv.format}</Badge>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => toast.info(`Открыть ${iv.candidate}`)}><ExternalLink className="h-3.5 w-3.5" /> Открыть</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ═══ CALENDAR ════════════════════════════════════ */}
            {view === "calendar" && (
              <Card><CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) } else setCalMonth(calMonth - 1) }}><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-sm font-semibold capitalize">{monthName}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) } else setCalMonth(calMonth + 1) }}><ChevronRight className="w-4 h-4" /></Button>
                </div>
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(wd => (
                    <div key={wd} className="bg-muted/50 text-center text-[10px] font-semibold text-muted-foreground py-2">{wd}</div>
                  ))}
                  {calDays.map((day, i) => {
                    if (!day) return <div key={i} className="bg-card min-h-[80px]" />
                    const dayIvs = interviews.filter(iv => isSameDay(iv.date, day))
                    const isT = isToday(day)
                    const dayKey = day.toISOString().slice(0, 10)
                    const isDropTarget = dropTargetDay === dayKey && dragIvId !== null
                    return (
                      <div
                        key={i}
                        className={cn("bg-card min-h-[80px] p-1 border-t transition-all", isT && "bg-primary/5", isDropTarget && "ring-2 ring-primary ring-inset bg-primary/5")}
                        onDragOver={e => { e.preventDefault(); setDropTargetDay(dayKey) }}
                        onDragLeave={() => { if (dropTargetDay === dayKey) setDropTargetDay(null) }}
                        onDrop={e => { e.preventDefault(); calDropOnDay(day) }}
                      >
                        <span className={cn("text-xs font-medium", isT ? "text-primary font-bold" : "text-muted-foreground")}>{day.getDate()}</span>
                        <div className="space-y-0.5 mt-0.5">
                          {dayIvs.slice(0, 3).map(iv => (
                            <div
                              key={iv.id}
                              draggable
                              onDragStart={() => ivDragStart(iv.id)}
                              onDragEnd={ivDragEnd}
                              className={cn(dragIvId === iv.id && "opacity-40 scale-95")}
                            >
                              <MiniCard iv={iv} compact />
                            </div>
                          ))}
                          {dayIvs.length > 3 && <p className="text-[9px] text-muted-foreground text-center">+{dayIvs.length - 3}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent></Card>
            )}

            {/* ═══ DAY ═════════════════════════════════════════ */}
            {view === "day" && (
              <Card><CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDayOffset(dayOffset - 1)}><ChevronLeft className="w-4 h-4" /> Вчера</Button>
                  <div className="text-center"><span className="text-sm font-semibold capitalize">{formatDayFull(viewDay)}</span>{dayOffset !== 0 && <Button variant="ghost" size="sm" className="ml-2 h-6 text-xs" onClick={() => setDayOffset(0)}>Сегодня</Button>}</div>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDayOffset(dayOffset + 1)}>Завтра <ChevronRight className="w-4 h-4" /></Button>
                </div>
                <div className="space-y-0">
                  {dayHours.map(h => {
                    const hourIvs = dayInterviews.filter(iv => parseInt(iv.time) === h)
                    const isDropHere = dropTargetHour === h && dragIvId !== null
                    return (
                      <div
                        key={h}
                        className={cn("flex border-t min-h-[56px] transition-colors", isDropHere && "bg-primary/5")}
                        onDragOver={e => { e.preventDefault(); setDropTargetHour(h) }}
                        onDragLeave={() => { if (dropTargetHour === h) setDropTargetHour(null) }}
                        onDrop={e => { e.preventDefault(); dayDropOnHour(h) }}
                      >
                        <div className="w-16 shrink-0 py-2 pr-3 text-right text-xs text-muted-foreground font-medium">{String(h).padStart(2, "0")}:00</div>
                        <div className="flex-1 py-1 pl-2 space-y-1 relative">
                          {isDropHere && <div className="absolute top-0 left-2 right-0 h-0.5 bg-primary rounded" />}
                          {hourIvs.length === 0 && !isDropHere && <div className="h-10 rounded bg-muted/20" />}
                          {hourIvs.map(iv => (
                            <div
                              key={iv.id}
                              draggable
                              onDragStart={() => ivDragStart(iv.id)}
                              onDragEnd={ivDragEnd}
                              className={cn("rounded-lg border p-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition-opacity", STATUS_STYLES[iv.status], dragIvId === iv.id && "opacity-40 scale-95")}
                            >
                              <div><div className="flex items-center gap-2"><span className="text-sm font-semibold">{iv.candidate}</span><Badge variant="outline" className="text-[10px]">{iv.type}</Badge></div><p className="text-xs text-muted-foreground">{iv.vacancy} · {iv.time}–{iv.endTime} · {iv.format}</p></div>
                              <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => toast.info(`Открыть ${iv.candidate}`)}>Открыть</Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent></Card>
            )}

            {/* ═══ WEEK ═════════════════════════════════════════ */}
            {view === "week" && (
              <Card><CardContent className="p-2 sm:p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline">Прошлая</span></Button>
                  <div className="text-center">
                    <span className="text-sm font-semibold">{weekLabel}</span>
                    {weekOffset !== 0 && <Button variant="ghost" size="sm" className="ml-2 h-6 text-xs" onClick={() => setWeekOffset(0)}>Сегодня</Button>}
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setWeekOffset(weekOffset + 1)}><span className="hidden sm:inline">Следующая</span> <ChevronRight className="w-4 h-4" /></Button>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[700px]">
                    {/* Day headers */}
                    <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b">
                      <div />
                      {weekDays.map((wd, i) => {
                        const isT = isToday(wd)
                        return (
                          <div key={i} className={cn("text-center py-2 text-xs font-semibold border-l", isT && "bg-primary/5")}>
                            <span className={cn(isT ? "text-primary" : "text-muted-foreground")}>{weekDayNames[i]}</span>
                            <span className={cn("ml-1", isT ? "text-primary font-bold" : "text-foreground")}>{wd.getDate()}</span>
                          </div>
                        )
                      })}
                    </div>
                    {/* Time grid */}
                    {dayHours.map(h => (
                      <div key={h} className="grid grid-cols-[56px_repeat(7,1fr)] border-b min-h-[52px]">
                        <div className="text-right pr-2 py-1 text-[10px] text-muted-foreground font-medium">{String(h).padStart(2, "0")}:00</div>
                        {weekDays.map((wd, di) => {
                          const cellIvs = interviews.filter(iv => isSameDay(iv.date, wd) && parseInt(iv.time) === h)
                          const cellKey = `${wd.toISOString().slice(0, 10)}-${h}`
                          const isDropCell = dropTargetDay === cellKey && dragIvId !== null
                          return (
                            <div
                              key={di}
                              className={cn("border-l p-0.5 transition-colors relative", isToday(wd) && "bg-primary/[0.02]", isDropCell && "bg-primary/10 ring-1 ring-inset ring-primary")}
                              onDragOver={e => { e.preventDefault(); setDropTargetDay(cellKey) }}
                              onDragLeave={() => { if (dropTargetDay === cellKey) setDropTargetDay(null) }}
                              onDrop={e => { e.preventDefault(); weekDropOnSlot(wd, h) }}
                            >
                              {isDropCell && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded" />}
                              {cellIvs.map(iv => {
                                const dur = iv.endTime ? Math.max(1, parseInt(iv.endTime) - parseInt(iv.time)) : 1
                                return (
                                  <div
                                    key={iv.id}
                                    draggable
                                    onDragStart={() => ivDragStart(iv.id)}
                                    onDragEnd={ivDragEnd}
                                    className={cn("rounded px-1.5 py-1 text-white text-[10px] leading-tight cursor-grab active:cursor-grabbing mb-0.5 transition-opacity", dragIvId === iv.id && "opacity-40 scale-95")}
                                    style={{ backgroundColor: TYPE_COLORS[iv.type], minHeight: `${dur * 20}px` }}
                                    title={`${iv.candidate} · ${iv.type} · ${iv.format}`}
                                    onClick={() => toast.info(`${iv.candidate} · ${iv.vacancy} · ${iv.time}–${iv.endTime}`)}
                                  >
                                    <span className="font-semibold block truncate">{iv.candidate}</span>
                                    <span className="opacity-80 block truncate">{iv.type} · {iv.format}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 px-2">
                  {(Object.entries(TYPE_COLORS) as [InterviewType, string][]).map(([t, c]) => (
                    <div key={t} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: c }} />
                      <span className="text-[10px] text-muted-foreground">{t}</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            )}

            {/* ═══ KANBAN ══════════════════════════════════════ */}
            {view === "kanban" && (
              <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory md:snap-none">
                <div className="flex gap-4 min-w-min">
                  {kanbanStatuses.map(status => {
                    const colIvs = filtered.filter(iv => iv.status === status)
                    const isDropCol = dropTargetStatus === status && dragIvId !== null
                    return (
                      <div
                        key={status}
                        className="w-[85vw] sm:w-72 shrink-0 snap-start"
                        onDragOver={e => { e.preventDefault(); setDropTargetStatus(status) }}
                        onDragLeave={() => { if (dropTargetStatus === status) setDropTargetStatus(null) }}
                        onDrop={e => { e.preventDefault(); kanbanDropOnStatus(status) }}
                      >
                        <div className={cn("rounded-xl px-3.5 py-2.5 mb-3 flex items-center justify-between transition-all", STATUS_STYLES[status], isDropCol && "ring-2 ring-primary")}><span className="text-sm font-semibold">{status}</span><span className="text-xs font-bold opacity-70">{colIvs.length}</span></div>
                        <div className={cn("space-y-2 min-h-[100px] rounded-lg p-1 transition-colors", isDropCol && "bg-primary/5")}>
                          {colIvs.map(iv => (
                            <Card
                              key={iv.id}
                              draggable
                              onDragStart={() => ivDragStart(iv.id)}
                              onDragEnd={ivDragEnd}
                              className={cn("transition-all cursor-grab active:cursor-grabbing", dragIvId === iv.id && "opacity-40 scale-95")}
                            >
                              <CardContent className="p-3 space-y-1.5">
                                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-foreground">{iv.candidate}</span><span className="text-[10px] text-muted-foreground">{formatDateShort(iv.date)}</span></div>
                                <p className="text-xs text-muted-foreground">{iv.vacancy}</p>
                                <div className="flex items-center gap-1.5"><span className="text-xs font-medium">{iv.time}</span><Badge variant="outline" className="text-[10px]">{iv.type}</Badge><Badge variant="outline" className="text-[10px] gap-0.5">{iv.format === "Онлайн" ? <Video className="w-2.5 h-2.5" /> : <Building2 className="w-2.5 h-2.5" />}{iv.format}</Badge></div>
                              </CardContent>
                            </Card>
                          ))}
                          {colIvs.length === 0 && <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-border/50 text-muted-foreground/40"><span className="text-xs">{isDropCol ? "Отпустите здесь" : "Пусто"}</span></div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* ═══ Настройка стадий — Sheet ═════════════════════════ */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Настроить стадии</SheetTitle></SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Stage list */}
            <div className="space-y-1.5">
              {stages.map((stage, idx) => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn("flex items-center gap-2 p-2.5 rounded-lg border bg-card transition-all cursor-grab active:cursor-grabbing", dragIdx === idx && "opacity-40 scale-95", editingId === stage.id && "ring-2 ring-primary")}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <span className="text-base shrink-0">{stage.emoji}</span>
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{stage.name}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{stageCounts[stage.id] || 0}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(stage)}><Pencil className="w-3 h-3" /></Button>
                  {!stage.isDefault && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => deleteStage(stage.id)}><Trash2 className="w-3 h-3" /></Button>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full gap-1.5 border-dashed" onClick={startAdd}><Plus className="w-4 h-4" /> Добавить стадию</Button>

            {/* Edit/Add form */}
            {(editingId || addMode) && (
              <Card className="border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">{addMode ? "Новая стадия" : "Редактирование"}</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Название</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название стадии" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Иконка</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJI_OPTIONS.map(em => (
                        <button key={em} className={cn("w-8 h-8 rounded-lg border text-base flex items-center justify-center transition-all", editEmoji === em ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/30")} onClick={() => setEditEmoji(em)}>{em}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Цвет бейджа</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer" />
                      <Input value={editColor} onChange={e => setEditColor(e.target.value)} className="h-9 w-24 font-mono text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Условие попадания</Label>
                    <Select value={editCondition} onValueChange={v => setEditCondition(v as StageCondition)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(CONDITION_LABELS) as [StageCondition, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 gap-1" onClick={saveEdit}><Save className="w-3.5 h-3.5" /> Сохранить</Button>
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setEditingId(null); setAddMode(false) }}><X className="w-3.5 h-3.5" /> Отмена</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-xs text-muted-foreground p-2">
              Дефолтные стадии нельзя удалить, только переименовать. Перетаскивайте для изменения порядка.
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══ Notify dialog ════════════════════════════════════ */}
      <Dialog open={!!notifyDialog} onOpenChange={o => { if (!o) setNotifyDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Встреча перенесена</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-foreground">{notifyDialog?.message}</p>
            <p className="text-sm text-muted-foreground">Уведомить кандидата о переносе?</p>
            <div className="flex gap-2">
              <Button className="flex-1 gap-1.5" onClick={() => { toast.success("Уведомление отправлено кандидату"); setNotifyDialog(null) }}>
                <Bell className="w-4 h-4" /> Да, уведомить
              </Button>
              <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { toast("Встреча перенесена без уведомления"); setNotifyDialog(null) }}>
                <BellOff className="w-4 h-4" /> Нет
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
