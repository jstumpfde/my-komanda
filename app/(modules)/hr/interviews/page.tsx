"use client"

import { useState, useMemo, useEffect, useCallback, Suspense } from "react"
import { useRouter } from "next/navigation"
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
import { Video, Building2, ExternalLink, ChevronLeft, ChevronRight, List, CalendarDays, CalendarRange, Clock, Settings, Plus, GripVertical, Pencil, Trash2, Save, X, Bell, BellOff, LayoutGrid, Phone, Check, Minus, FileText, ClipboardCheck, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CalendarView } from "@/components/calendar/calendar-view"

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
  id: string; date: Date; time: string; endTime: string; candidate: string; vacancy: string; interviewer: string; type: InterviewType; format: InterviewFormat; status: InterviewStatus
  candidateId: string | null
  // Контекст кандидата (из JOIN в /calendar) — для наполнения карточки.
  aiScore: number | null; resumeScore: number | null; phone: string | null; stage: string | null
  anketaFilled: boolean; tested: boolean; testScore: number | null
}

const today2 = new Date()

// Событие календаря type='interview' → форма Interview для этой страницы.
// candidate берём из title (HR его и заполняет), vacancy — по vacancyId через
// мапу названий. Статус: cancelled→Отменено, прошедшее→Пройдено, tentative→Ожидает,
// иначе Подтверждено. Тип/формат — из структурных полей, дефолты для старых событий.
interface CalEvent {
  id: string; title: string; startAt: string; endAt: string; status: string | null
  vacancyId: string | null; candidateId: string | null; interviewer: string | null; interviewType: string | null; interviewFormat: string | null
  interviewStatus: string | null
  candAiScore?: number | null; candResumeScore?: number | null; candScore?: number | null; candPhone?: string | null; candStage?: string | null
  candAnketaFilled?: boolean; candTested?: boolean; candTestScore?: number | null
}
function timeStr(dt: Date): string {
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
}
function mapEventToInterview(ev: CalEvent, vacMap: Map<string, string>): Interview {
  const start = new Date(ev.startAt)
  const end = new Date(ev.endAt)
  const now = new Date()
  const ALL_ST = ["Подтверждено", "Ожидает", "Пройдено", "Не явился", "Отменено"] as const
  let status: InterviewStatus
  if (ev.interviewStatus && (ALL_ST as readonly string[]).includes(ev.interviewStatus)) {
    status = ev.interviewStatus as InterviewStatus
  } else if (ev.status === "cancelled") status = "Отменено"
  else if (end < now) status = "Пройдено"
  else if (ev.status === "tentative") status = "Ожидает"
  else status = "Подтверждено"
  const type: InterviewType = (["Техническое", "HR", "Финальное"] as const).includes(ev.interviewType as InterviewType)
    ? (ev.interviewType as InterviewType) : "HR"
  const format: InterviewFormat = ev.interviewFormat === "Офис" ? "Офис" : "Онлайн"
  return {
    id: ev.id,
    date: start,
    time: timeStr(start),
    endTime: timeStr(end),
    candidate: ev.title || "Интервью",
    vacancy: (ev.vacancyId && vacMap.get(ev.vacancyId)) || "—",
    interviewer: ev.interviewer || "—",
    type, format, status,
    candidateId: ev.candidateId ?? null,
    aiScore: ev.candAiScore ?? ev.candResumeScore ?? null,
    resumeScore: ev.candResumeScore ?? null,
    phone: ev.candPhone ?? null,
    stage: ev.candStage ?? null,
    anketaFilled: ev.candAnketaFilled ?? false,
    tested: ev.candTested ?? false,
    testScore: ev.candTestScore ?? null,
  }
}

// ─── Утилиты ────────────────────────────────────────────────

// Цвет числового скоринга (0..100): зелёный/янтарный/красный.
function scoreColor(n: number | null | undefined): string {
  if (n == null) return "text-muted-foreground"
  if (n >= 70) return "text-emerald-600 dark:text-emerald-400"
  if (n >= 40) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

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

// ─── Внутренний компонент (читает searchParams) ──────────────

export function InterviewsView({ vacancyId, embedded }: { vacancyId?: string; embedded?: boolean } = {}) {
  const router = useRouter()

  // Список интервью можно свернуть/развернуть под основным CalendarView
  // Верхний переключатель раздела: богатый вид интервью (стадии/канбан/список)
  // vs полный календарь компании. По умолчанию — «Интервью» (как было до мерджа).
  const [topTab, setTopTab] = useState<"interviews" | "calendar">("interviews")

  const [view, setView] = useState<ViewMode>("list")
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [vacOptions, setVacOptions] = useState<{ id: string; title: string }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cName, setCName] = useState("")
  const [cVacancyId, setCVacancyId] = useState("")
  const [cDate, setCDate] = useState("")
  const [cTime, setCTime] = useState("10:00")
  const [cDuration, setCDuration] = useState("45")
  const [cInterviewer, setCInterviewer] = useState("")
  const [cType, setCType] = useState("HR")
  const [cFormat, setCFormat] = useState("Онлайн")
  // Доп. интервьюеры (участники-пользователи): руководитель/директор и т.п.
  const [cInterviewerIds, setCInterviewerIds] = useState<string[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES)
  const [activeStage, setActiveStage] = useState<string>("all")
  const [calMonth, setCalMonth] = useState(today2.getMonth())
  const [calYear, setCalYear] = useState(today2.getFullYear())
  const [dayOffset, setDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const [dragIvId, setDragIvId] = useState<string | null>(null)
  const [dropTargetHour, setDropTargetHour] = useState<number | null>(null)
  const [dropTargetDay, setDropTargetDay] = useState<string | null>(null)
  const [dropTargetStatus, setDropTargetStatus] = useState<InterviewStatus | null>(null)

  const [notifyDialog, setNotifyDialog] = useState<{ message: string } | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmoji, setEditEmoji] = useState("")
  const [editColor, setEditColor] = useState("")
  const [editCondition, setEditCondition] = useState<StageCondition>("manual")
  const [addMode, setAddMode] = useState(false)

  useEffect(() => { setStages(loadStages()) }, [])

  const loadInterviews = useCallback(async () => {
    try {
      const [evRes, vacRes] = await Promise.all([
        // В embedded-режиме (таб вакансии) — только интервью этой вакансии.
        fetch(`/api/modules/hr/calendar?type=interview${vacancyId ? `&vacancyId=${vacancyId}` : ""}`),
        fetch("/api/modules/hr/vacancies?limit=200"),
      ])
      const evJson = evRes.ok ? await evRes.json() : null
      const events = (evJson?.data ?? evJson ?? []) as CalEvent[]
      const vacJson = vacRes.ok ? await vacRes.json() : null
      const vacs = (vacJson?.vacancies ?? vacJson?.data ?? []) as { id: string; title: string }[]
      setVacOptions(vacs.map(v => ({ id: v.id, title: v.title })))
      const vacMap = new Map(vacs.map(v => [v.id, v.title]))
      setInterviews(events.map(ev => mapEventToInterview(ev, vacMap)))
    } catch { setInterviews([]) }
  }, [vacancyId])
  useEffect(() => { void loadInterviews() }, [loadInterviews])

  // Текущий пользователь (для авто-интервьюера) + команда (для доп. интервьюеров).
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then((j) => {
      const u = j?.user ?? j?.data ?? j
      if (u?.id) setCurrentUser({ id: u.id, name: u.name ?? u.email ?? "Я" })
    }).catch(() => {})
    fetch("/api/team").then(r => r.ok ? r.json() : null).then((j) => {
      const list = Array.isArray(j) ? j : (j?.data ?? j?.members ?? [])
      if (Array.isArray(list)) setTeamMembers(list.map((m: { id: string; name?: string; email?: string }) => ({ id: m.id, name: m.name ?? m.email ?? "—" })))
    }).catch(() => {})
  }, [])

  const openCreate = () => {
    const now = new Date()
    // #2: интервьюер по умолчанию — текущий пользователь (кто назначает).
    setCName(""); setCVacancyId(vacancyId ?? ""); setCInterviewer(currentUser?.name ?? ""); setCType("HR"); setCFormat("Онлайн")
    setCInterviewerIds([]); setCTime("10:00"); setCDuration("45")
    setCDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`)
    setCreateOpen(true)
  }
  const createInterview = async () => {
    if (!cName.trim() || !cDate || !cTime) { toast.error("Заполните имя кандидата, дату и время"); return }
    setCreating(true)
    try {
      const [h, m] = cTime.split(":").map(Number)
      const start = new Date(cDate); start.setHours(h, m, 0, 0)
      const end = new Date(start.getTime() + (parseInt(cDuration) || 45) * 60000)
      const res = await fetch("/api/modules/hr/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cName.trim(), type: "interview",
          startAt: start.toISOString(), endAt: end.toISOString(),
          vacancyId: cVacancyId || null, interviewer: cInterviewer || null,
          interviewType: cType, interviewFormat: cFormat,
          // #3: доп. интервьюеры — участники события (руководитель/директор и т.п.)
          participants: cInterviewerIds.length > 0 ? cInterviewerIds : undefined,
        }),
      })
      if (!res.ok) throw new Error()
      setCreateOpen(false)
      await loadInterviews()
      toast.success("Интервью запланировано")
    } catch { toast.error("Не удалось создать интервью") } finally { setCreating(false) }
  }

  // Меняет интервью локально + персистит в календарь (PATCH): перенос времени/даты
  // пишет startAt/endAt, смена статуса маппится на статус события календаря
  // (confirmed/tentative/cancelled). Тонкие статусы (Пройдено/Не явился) — в
  // interview_status, статус события — ближайший (для конфликтов/напоминаний C6).
  const updateInterview = (id: string, patch: Partial<Interview>, msg: string) => {
    const current = interviews.find(iv => iv.id === id)
    setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, ...patch } : iv))
    setNotifyDialog({ message: msg })
    if (!current) return
    const merged = { ...current, ...patch }
    const body: Record<string, unknown> = {}
    if (patch.time !== undefined || patch.endTime !== undefined || patch.date !== undefined) {
      const [sh, sm] = merged.time.split(":").map(Number)
      const [eh, em] = merged.endTime.split(":").map(Number)
      const start = new Date(merged.date); start.setHours(sh, sm, 0, 0)
      const end = new Date(merged.date); end.setHours(eh, em, 0, 0)
      body.startAt = start.toISOString(); body.endAt = end.toISOString()
    }
    if (patch.status !== undefined) {
      body.interviewStatus = patch.status
      body.status = patch.status === "Отменено" || patch.status === "Не явился" ? "cancelled"
        : patch.status === "Ожидает" ? "tentative" : "confirmed"
    }
    if (Object.keys(body).length > 0) {
      fetch(`/api/modules/hr/calendar/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).catch(() => {})
    }
  }

  const ivDragStart = (id: string) => setDragIvId(id)
  const ivDragEnd = () => { setDragIvId(null); setDropTargetHour(null); setDropTargetDay(null); setDropTargetStatus(null) }

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

  const kanbanDropOnStatus = (status: InterviewStatus) => {
    if (dragIvId === null) return
    updateInterview(dragIvId, { status }, `Статус изменён на «${status}»`)
    ivDragEnd()
  }

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
    if (activeStage === "all") return [...interviews].sort((a, b) => a.date.getTime() - b.date.getTime())
    if (!currentStage) return []
    const result = filterByCondition(interviews, currentStage.condition)
    return result.sort((a, b) => currentStage.condition === "date_before" ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime())
  }, [activeStage, currentStage, interviews])

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {}
    stages.forEach(s => { m[s.id] = filterByCondition(interviews, s.condition).length })
    return m
  }, [stages, interviews])

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
    { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
    // «Месяц», не «Календарь» — чтобы не путать с верхним табом «Календарь» (полный календарь компании)
    { mode: "calendar", icon: CalendarDays, label: "Месяц" },
    { mode: "week", icon: CalendarRange, label: "Неделя" },
    { mode: "day", icon: Clock, label: "День" },
  ]

  const calDate = new Date(calYear, calMonth, 1)
  const monthName = calDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
  const firstDay = (calDate.getDay() + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calDays = Array.from({ length: 42 }, (_, i) => { const dn = i - firstDay + 1; return (dn < 1 || dn > daysInMonth) ? null : new Date(calYear, calMonth, dn) })

  const viewDay = new Date(today2); viewDay.setDate(viewDay.getDate() + dayOffset)
  const dayInterviews = interviews.filter(iv => isSameDay(iv.date, viewDay)).sort((a, b) => a.time.localeCompare(b.time))
  const dayHours = Array.from({ length: 12 }, (_, i) => i + 9)

  const weekStart = useMemo(() => {
    const d = new Date(today2); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7); d.setHours(0, 0, 0, 0); return d
  }, [weekOffset])
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const weekLabel = `${weekDays[0].toLocaleDateString("ru-RU", { day: "numeric" })}–${weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`
  const weekDayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

  const TYPE_COLORS: Record<InterviewType, string> = { "Техническое": "#3b82f6", "HR": "#f59e0b", "Финальное": "#22c55e" }

  const kanbanStatuses: InterviewStatus[] = ["Ожидает", "Подтверждено", "Пройдено", "Отменено"]

  // Контент интервью-вида (одинаков для standalone и embedded). Хром
  // (сайдбар/хедер) добавляется ниже только в standalone-режиме. ВАЖНО: не
  // оборачивать во вложенный компонент — иначе ремоунт поддерева на каждый рендер.
  const inner = (
      <>
        <main className={embedded ? "bg-background" : "flex-1 overflow-auto bg-background"}>

          {/* ═══ Заголовок + переключатель Интервью/Календарь ═══
              В embedded (таб вакансии) переключатель скрыт: показываем только
              интервью-вид (общий календарь компании живёт отдельно на /hr/interviews). */}
          {!embedded && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-14 pt-5 pb-3 border-b">
            <div className="flex items-center">
              <CalendarDays className="h-5 w-5 text-violet-600 mr-2" />
              <h1 className="text-lg font-semibold">Интервью</h1>
            </div>
            <Tabs value={topTab} onValueChange={(v) => setTopTab(v as "interviews" | "calendar")}>
              <TabsList>
                <TabsTrigger value="interviews" className="gap-1.5 text-xs"><List className="w-3.5 h-3.5" />Интервью</TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1.5 text-xs"><CalendarDays className="w-3.5 h-3.5" />Календарь</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          )}

          {/* ═══ Таб «Календарь» — основной календарь компании (только standalone) ═══ */}
          {!embedded && topTab === "calendar" && (
          <Suspense fallback={
            <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
              Загрузка календаря…
            </div>
          }>
            <CalendarView vacancyId={vacancyId} />
          </Suspense>
          )}

          {/* ═══ Таб «Интервью» — стадии/канбан/список ═══ */}
          {topTab === "interviews" && (
          <div className="bg-background">
            {/* Компактная шапка: переключатель видов слева + кнопки справа (одна строка) */}
            <div className={cn("flex items-center justify-between gap-2 flex-wrap py-3", embedded ? "" : "px-4 sm:px-14")}>
              <div className="flex items-center gap-2">
                <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                  <TabsList>
                    {views.map(v => (
                      <TabsTrigger key={v.mode} value={v.mode} className="gap-1 text-xs">
                        <v.icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{v.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Badge variant="outline" className="text-[10px] px-1.5 h-4">{interviews.length}</Badge>
                {/* В Канбане фильтр времени — компактным дропдауном прямо в шапке */}
                {view === "kanban" && (
                  <Select value={activeStage} onValueChange={setActiveStage}>
                    <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs gap-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        <span className="mr-1.5">🗂</span>Все · {interviews.length}
                      </SelectItem>
                      {stages.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          <span className="mr-1.5">{s.emoji}</span>{s.name} · {stageCounts[s.id] || 0}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setSettingsOpen(true)}>
                  <Settings className="w-3 h-3" /><span className="hidden sm:inline">Настроить стадии</span>
                </Button>
                <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openCreate()}>
                  <Plus className="w-3 h-3" /><span className="hidden sm:inline">Запланировать интервью</span>
                </Button>
              </div>
            </div>

            <div className={cn("pb-6", embedded ? "" : "px-4 sm:px-14")}>
              {/* Фильтр по времени (стадии) — только в Списке (полный ряд табов).
                  В Канбане — компактный дропдаун в шапке. В Месяце/Неделе/Дне фильтр
                  не нужен: эти виды показывают события по датам сами (листаешь период),
                  табы там ни на что не влияли — поэтому скрыты. */}
              {view === "list" && (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
                  <Tabs value={activeStage} onValueChange={setActiveStage}>
                    <TabsList className="w-max sm:w-auto">
                      <TabsTrigger value="all" className="gap-1.5">
                        <span>🗂</span> Все
                        <Badge className="ml-1 text-[10px] px-1.5 h-4 bg-primary/10 text-primary">{interviews.length}</Badge>
                      </TabsTrigger>
                      {stages.map(s => (
                        <TabsTrigger key={s.id} value={s.id} className="gap-1.5">
                          <span>{s.emoji}</span> {s.name}
                          <Badge className="ml-1 text-[10px] px-1.5 h-4 bg-primary/10 text-primary">{stageCounts[s.id] || 0}</Badge>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {/* ═══ LIST ════════════════════════════════════════ */}
              {view === "list" && (
                <div className="space-y-3">
                  {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Нет интервью</p>}
                  {filtered.map(iv => (
                    <Card key={iv.id} className="overflow-hidden transition-colors hover:border-primary/40 cursor-pointer" onClick={() => iv.candidateId ? router.push(`/hr/candidates/${iv.candidateId}`) : toast.info("Кандидат не привязан к записи")}>
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          {/* Дата/время */}
                          <div className="flex flex-col items-center justify-center min-w-[68px] bg-muted/60 py-3 px-3 border-r">
                            <span className="text-2xl font-bold leading-none">{iv.date.getDate()}</span>
                            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{iv.date.toLocaleDateString("ru-RU", { month: "short" }).toUpperCase()}</span>
                            <span className="text-xs font-semibold text-primary mt-1">{iv.time}</span>
                          </div>
                          {/* Кандидат + контекст */}
                          <div className="flex-1 min-w-0 py-3 px-4 flex flex-col justify-center gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-sm truncate">{iv.candidate}</span>
                              <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[iv.status])}>{iv.status}</Badge>
                              {iv.stage && <Badge variant="secondary" className="text-[10px] font-normal">{iv.stage}</Badge>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <Badge variant="outline" className={cn("text-[10px]", iv.type === "Техническое" ? "border-blue-200 text-blue-700 dark:text-blue-400" : iv.type === "HR" ? "border-purple-200 text-purple-700 dark:text-purple-400" : "border-green-200 text-green-700 dark:text-green-400")}>{iv.type}</Badge>
                              <span className="inline-flex items-center gap-1">{iv.format === "Онлайн" ? <Video className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}{iv.format}</span>
                              <span className="truncate">Интервьюер: <span className="text-foreground font-medium">{iv.interviewer}</span></span>
                              {iv.phone && <a href={`tel:${iv.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="w-3 h-3" />{iv.phone}</a>}
                              <span className="truncate text-muted-foreground/70">· {iv.vacancy}</span>
                            </div>
                          </div>
                          {/* Метрики кандидата */}
                          <div className="hidden md:flex items-center gap-5 px-5 border-l">
                            <div className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />Резюме</span>
                              <span className={cn("text-base font-bold leading-tight", scoreColor(iv.aiScore))}>{iv.aiScore != null ? iv.aiScore : "—"}</span>
                            </div>
                            <div className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><FileText className="w-2.5 h-2.5" />Анкета</span>
                              {iv.anketaFilled ? <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : <Minus className="w-5 h-5 text-muted-foreground/40" />}
                            </div>
                            <div className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><ClipboardCheck className="w-2.5 h-2.5" />Тест</span>
                              {iv.tested
                                ? (iv.testScore != null
                                    ? <span className={cn("text-base font-bold leading-tight", scoreColor(iv.testScore))}>{iv.testScore}</span>
                                    : <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />)
                                : <Minus className="w-5 h-5 text-muted-foreground/40" />}
                            </div>
                          </div>
                          {/* Действие */}
                          <div className="flex items-center px-4 border-l shrink-0">
                            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" tabIndex={-1}><ExternalLink className="h-3.5 w-3.5" /> Открыть</Button>
                          </div>
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
                      if (!day) return <div key={i} className="bg-card min-h-[120px]" />
                      const dayIvs = interviews.filter(iv => isSameDay(iv.date, day))
                      const isT = isToday(day)
                      const dayKey = day.toISOString().slice(0, 10)
                      const isDropTarget = dropTargetDay === dayKey && dragIvId !== null
                      return (
                        <div
                          key={i}
                          className={cn("bg-card min-h-[120px] p-1 border-t transition-all", isT && "bg-primary/5", isDropTarget && "ring-2 ring-primary ring-inset bg-primary/5")}
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
                                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => iv.candidateId ? router.push(`/hr/candidates/${iv.candidateId}`) : toast.info("Кандидат не привязан к записи")}>Открыть</Button>
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
                      {dayHours.map(h => (
                        <div key={h} className="grid grid-cols-[56px_repeat(7,1fr)] border-b min-h-[64px]">
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
                                      className={cn("rounded-md px-2 py-1.5 text-white text-[10px] leading-tight cursor-pointer active:cursor-grabbing mb-0.5 transition-opacity flex flex-col justify-center gap-0.5", dragIvId === iv.id && "opacity-40 scale-95")}
                                      style={{ backgroundColor: TYPE_COLORS[iv.type], minHeight: `${dur * 56}px` }}
                                      title={`${iv.candidate} · ${iv.type} · ${iv.format} · ${iv.time}–${iv.endTime}`}
                                      onClick={() => iv.candidateId ? router.push(`/hr/candidates/${iv.candidateId}`) : toast.info("Кандидат не привязан к записи")}
                                    >
                                      <span className="font-semibold block truncate">{iv.time} {iv.candidate}</span>
                                      <span className="opacity-85 block truncate">{iv.type} · {iv.format}</span>
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
                                onClick={() => iv.candidateId ? router.push(`/hr/candidates/${iv.candidateId}`) : toast.info("Кандидат не привязан к записи")}
                                className={cn("transition-all cursor-pointer hover:border-primary/40 active:cursor-grabbing", dragIvId === iv.id && "opacity-40 scale-95")}
                              >
                                <CardContent className="p-3 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-foreground truncate">{iv.candidate}</span><span className="text-[10px] text-muted-foreground shrink-0">{formatDateShort(iv.date)}</span></div>
                                  {iv.stage && <Badge variant="secondary" className="text-[9px] font-normal h-4 px-1.5">{iv.stage}</Badge>}
                                  <div className="flex items-center gap-1.5 flex-wrap"><span className="text-xs font-medium">{iv.time}</span><Badge variant="outline" className="text-[10px]">{iv.type}</Badge><Badge variant="outline" className="text-[10px] gap-0.5">{iv.format === "Онлайн" ? <Video className="w-2.5 h-2.5" /> : <Building2 className="w-2.5 h-2.5" />}{iv.format}</Badge></div>
                                  {iv.phone && <a href={`tel:${iv.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"><Phone className="w-2.5 h-2.5" />{iv.phone}</a>}
                                  <div className="flex items-center gap-2.5 pt-1.5 border-t text-[10px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-0.5" title="AI-скоринг резюме"><Sparkles className="w-2.5 h-2.5" /><span className={cn("font-bold", scoreColor(iv.aiScore))}>{iv.aiScore != null ? iv.aiScore : "—"}</span></span>
                                    <span className="inline-flex items-center gap-0.5" title="Анкета"><FileText className="w-2.5 h-2.5" />{iv.anketaFilled ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> : <Minus className="w-2.5 h-2.5 opacity-50" />}</span>
                                    <span className="inline-flex items-center gap-0.5" title="Тест"><ClipboardCheck className="w-2.5 h-2.5" />{iv.tested ? (iv.testScore != null ? <span className={cn("font-bold", scoreColor(iv.testScore))}>{iv.testScore}</span> : <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />) : <Minus className="w-2.5 h-2.5 opacity-50" />}</span>
                                  </div>
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
          </div>
          )} {/* topTab === interviews */}

        </main>

      {/* ═══ Настройка стадий — Sheet ═════════════════════════ */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Настроить стадии</SheetTitle></SheetHeader>

          {/* Паддинг как у шапки (px-4) — чтобы контент выравнивался, а не «выбивался» */}
          <div className="px-4 pb-6 space-y-4">
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

      {/* ═══ Создание интервью ════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={o => { if (!creating) setCreateOpen(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Запланировать интервью</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="c-name">Кандидат *</Label>
              <Input id="c-name" value={cName} onChange={e => setCName(e.target.value)} placeholder="Имя кандидата" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-vacancy">Вакансия</Label>
              <Select value={cVacancyId || "none"} onValueChange={v => setCVacancyId(v === "none" ? "" : v)}>
                <SelectTrigger id="c-vacancy"><SelectValue placeholder="Не указана" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указана</SelectItem>
                  {vacOptions.map(v => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1 col-span-1">
                <Label htmlFor="c-date">Дата *</Label>
                <Input id="c-date" type="date" value={cDate} onChange={e => setCDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-time">Время *</Label>
                <Input id="c-time" type="time" value={cTime} onChange={e => setCTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-dur">Длит., мин</Label>
                <Input id="c-dur" type="number" min={15} step={15} value={cDuration} onChange={e => setCDuration(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-interviewer">Интервьюер</Label>
              <Input id="c-interviewer" value={cInterviewer} onChange={e => setCInterviewer(e.target.value)} placeholder="Кто проводит" />
              {currentUser && <p className="text-[11px] text-muted-foreground">По умолчанию — вы. Можно изменить.</p>}
            </div>
            {/* #3: доп. интервьюеры из команды (руководитель/директор и т.п.) */}
            {teamMembers.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Доп. интервьюеры</Label>
                <div className="flex flex-wrap gap-1.5">
                  {teamMembers.map(m => {
                    const sel = cInterviewerIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCInterviewerIds(prev => sel ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs border transition-colors",
                          sel ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/60",
                        )}
                      >{m.name}</button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="c-type">Тип</Label>
                <Select value={cType} onValueChange={setCType}>
                  <SelectTrigger id="c-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Техническое", "HR", "Финальное"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-format">Формат</Label>
                <Select value={cFormat} onValueChange={setCFormat}>
                  <SelectTrigger id="c-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Онлайн", "Офис"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={createInterview} disabled={creating || !cName.trim()}>
                {creating ? "Создаю…" : "Запланировать"}
              </Button>
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Отмена</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
      </>
  )

  if (embedded) return <div className="bg-background">{inner}</div>
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        {inner}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function InterviewsPage() {
  return (
    <Suspense fallback={null}>
      <InterviewsView />
    </Suspense>
  )
}
