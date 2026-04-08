"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  Plus, ChevronRight, Sparkles, AlertCircle, CheckCircle2, Timer, Star,
  BookOpen, GraduationCap, Users, FileText, Award, BarChart3,
  GripVertical, ClipboardList, Monitor, Phone, TrendingUp,
} from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Area, ComposedChart,
} from "recharts"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  green: "#1D9E75",
  blue: "#378ADD",
  orange: "#D85A30",
  red: "#E24B4A",
  purple: "#7F77DD",
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const AI_HINTS = [
  { icon: Timer, color: C.orange, bg: "bg-amber-50 dark:bg-amber-950/30", title: "5 статей не обновлялись 3+ месяца", desc: "Рекомендую проверить актуальность материалов по Онбордингу и IT.", action: "Посмотреть" },
  { icon: CheckCircle2, color: C.green, bg: "bg-emerald-50 dark:bg-emerald-950/30", title: "Курс Продажи B2B — 12 из 15 завершили", desc: "Средний балл 87%. Отличный результат команды.", action: "Подробнее" },
  { icon: AlertCircle, color: C.red, bg: "bg-red-50 dark:bg-red-950/30", title: "В Онбординг мало материалов для DevOps", desc: "Только 1 статья. Рекомендую добавить инструкции по CI/CD.", action: "Создать" },
  { icon: Star, color: C.purple, bg: "bg-purple-50 dark:bg-purple-950/30", title: "3 статьи ожидают проверки", desc: "Авторы: Петров, Сидорова, Козлов. Ждут модерации 2+ дня.", action: "Проверить" },
]

const COURSES = [
  { id: "1", name: "Продажи B2B", modules: 6, lessons: 24, progress: 12, total: 15, avgScore: 87 },
  { id: "2", name: "Онбординг новичков", modules: 4, lessons: 16, progress: 8, total: 18, avgScore: 74 },
  { id: "3", name: "IT-безопасность", modules: 3, lessons: 12, progress: 5, total: 10, avgScore: 91 },
]

const POSITIONS_PROGRESS = [
  { position: "Менеджер по продажам", done: 8, total: 10, color: "#1D9E75" },
  { position: "Frontend-разработчик", done: 3, total: 5, color: "#378ADD" },
  { position: "HR-менеджер", done: 1, total: 4, color: "#D85A30" },
  { position: "DevOps-инженер", done: 2, total: 3, color: "#7F77DD" },
]

type EmployeeStatus = "excellent" | "progress" | "behind" | "not_started"

interface Employee {
  id: string
  name: string
  position: string
  department: string
  progress: number
  score: number
  coursesCompleted: number
  coursesTotal: number
  status: EmployeeStatus
}

const EMPLOYEES: Employee[] = [
  { id: "e1", name: "Петров Андрей", position: "Менеджер", department: "Продажи", progress: 95, score: 92, coursesCompleted: 4, coursesTotal: 4, status: "excellent" },
  { id: "e2", name: "Сидорова Ксения", position: "HR-менеджер", department: "HR", progress: 78, score: 85, coursesCompleted: 3, coursesTotal: 4, status: "progress" },
  { id: "e3", name: "Козлов Дмитрий", position: "Frontend", department: "IT", progress: 62, score: 78, coursesCompleted: 2, coursesTotal: 4, status: "progress" },
  { id: "e4", name: "Иванова Мария", position: "Бухгалтер", department: "Финансы", progress: 40, score: 65, coursesCompleted: 1, coursesTotal: 3, status: "behind" },
  { id: "e5", name: "Новиков Роман", position: "DevOps", department: "IT", progress: 88, score: 90, coursesCompleted: 3, coursesTotal: 3, status: "excellent" },
  { id: "e6", name: "Волкова Елена", position: "Менеджер", department: "Продажи", progress: 0, score: 0, coursesCompleted: 0, coursesTotal: 4, status: "not_started" },
]

const STATUS_CFG: Record<EmployeeStatus, { label: string; cls: string }> = {
  excellent: { label: "Отличник", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-transparent" },
  progress: { label: "В процессе", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-transparent" },
  behind: { label: "Отстаёт", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent" },
  not_started: { label: "Не начал", cls: "bg-red-500/10 text-red-700 dark:text-red-400 border-transparent" },
}

const AUTHORS = [
  { name: "Петров А.", articles: 12, courses: 2, isTop: true },
  { name: "Сидорова К.", articles: 8, courses: 1, isTop: false },
  { name: "Козлов Д.", articles: 6, courses: 3, isTop: true },
  { name: "Иванова М.", articles: 4, courses: 0, isTop: false },
]

const CATEGORIES = [
  { name: "Онбординг", count: 12, icon: ClipboardList, color: "text-amber-500" },
  { name: "Регламенты", count: 8, icon: BookOpen, color: "text-blue-500" },
  { name: "IT и безопасность", count: 15, icon: Monitor, color: "text-emerald-500" },
  { name: "HR-политики", count: 6, icon: Users, color: "text-violet-500" },
  { name: "Продажи", count: 10, icon: Phone, color: "text-rose-500" },
  { name: "Обучение", count: 4, icon: GraduationCap, color: "text-cyan-500" },
]

const COURSE_LEADERS = [
  { rank: 1, name: "Новиков Роман", position: "DevOps", score: 96, pct: 100 },
  { rank: 2, name: "Петров Андрей", position: "Менеджер", score: 92, pct: 95 },
  { rank: 3, name: "Сидорова Ксения", position: "HR-менеджер", score: 85, pct: 78 },
  { rank: 4, name: "Козлов Дмитрий", position: "Frontend", score: 78, pct: 62 },
  { rank: 5, name: "Иванова Мария", position: "Бухгалтер", score: 65, pct: 40 },
]

const RANK_COLORS: Record<number, string> = { 1: "bg-amber-400 text-white", 2: "bg-gray-300 text-gray-800", 3: "bg-amber-600 text-white" }

const ACTIVITY_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  views: Math.round(40 + Math.random() * 80 + (i > 20 ? 20 : 0)),
  courses: Math.round(5 + Math.random() * 15),
  articles: Math.round(Math.random() * 4),
}))

const tooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }

// ─── Sortable block wrapper ─────────────────────────────────────────────────

function SortableBlock({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  }
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-80 shadow-2xl rounded-xl")}>
      <div className="group relative">
        <button
          {...attributes}
          {...listeners}
          className="absolute top-3 right-3 z-10 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground"
          title="Перетащить"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

// ─── Block components ───────────────────────────────────────────────────────

function AiAssistantBlock() {
  return (
    <div className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: C.purple }} />
        <h2 className="text-sm font-semibold">AI-ассистент</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {AI_HINTS.map((h, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-md p-3 flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", h.bg)}>
                <h.icon className="w-3.5 h-3.5" style={{ color: h.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-foreground/85">{h.title}</p>
                <p className="text-[13px] text-foreground/65 mt-0.5 leading-snug">{h.desc}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs font-medium self-end gap-1 text-foreground/70">
              {h.action}<ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricsBlock() {
  const metrics = [
    { label: "Всего статей", value: "42", trend: "+5 за месяц", icon: FileText, bg: "bg-blue-500" },
    { label: "Активных курсов", value: "6", trend: "+1 за месяц", icon: GraduationCap, bg: "bg-emerald-500" },
    { label: "Проходят обучение", value: "18", trend: "из 32 сотрудников", icon: Users, bg: "bg-purple-500" },
    { label: "Ожидают проверки", value: "3", trend: "2+ дня", icon: ClipboardList, bg: "bg-orange-500" },
    { label: "Ср. балл тестов", value: "84%", trend: "+3% за месяц", icon: Award, bg: "bg-violet-600" },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m, i) => (
        <div key={i} className={cn("rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 text-white", m.bg)}>
          <div className="flex items-center gap-1.5 mb-2">
            <m.icon className="w-4 h-4 text-white" />
            <span className="text-sm font-semibold text-white">{m.label}</span>
          </div>
          <p className="text-3xl font-bold text-white">{m.value}</p>
          <p className="text-sm mt-1 text-white/90">{m.trend}</p>
        </div>
      ))}
    </div>
  )
}

function ProgressCoursesBlock() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Positions progress */}
      <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Прогресс по должностям</h3>
        <div className="space-y-4">
          {POSITIONS_PROGRESS.map((p, i) => {
            const pct = Math.round((p.done / p.total) * 100)
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{p.position}</span>
                  <span className="text-xs text-muted-foreground">{p.done}/{p.total} статей</span>
                </div>
                <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active courses */}
      <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Активные курсы</h3>
        <div className="space-y-3">
          {COURSES.map((c) => (
            <div key={c.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.modules} мод. · {c.lessons} уроков</span>
              </div>
              <div className="flex items-center gap-3">
                <Progress value={(c.progress / c.total) * 100} className="flex-1 h-2" />
                <span className="text-xs font-medium text-muted-foreground">{c.progress}/{c.total}</span>
                <Badge variant="secondary" className="text-[10px]">Балл {c.avgScore}%</Badge>
              </div>
            </div>
          ))}
          <Link href="/knowledge/ai-courses">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs mt-1">
              <Plus className="w-3.5 h-3.5" />Создать курс
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function EmployeesBlock() {
  const [posFilter, setPosFilter] = useState("all")
  const [deptFilter, setDeptFilter] = useState("all")
  const [sortBy, setSortBy] = useState("progress")

  const filtered = EMPLOYEES
    .filter(e => posFilter === "all" || e.position === posFilter)
    .filter(e => deptFilter === "all" || e.department === deptFilter)
    .sort((a, b) => {
      if (sortBy === "progress") return b.progress - a.progress
      if (sortBy === "score") return b.score - a.score
      return 0
    })

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2)

  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Обучение сотрудников</h3>
        <div className="flex items-center gap-2">
          <Select value={posFilter} onValueChange={setPosFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Все должности" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все должности</SelectItem>
              {[...new Set(EMPLOYEES.map(e => e.position))].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Все отделы" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все отделы</SelectItem>
              {[...new Set(EMPLOYEES.map(e => e.department))].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="progress">По прогрессу &darr;</SelectItem>
              <SelectItem value="score">По баллу &darr;</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сотрудник</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Прогресс</th>
            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Балл</th>
            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Курсов</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(e => {
            const st = STATUS_CFG[e.status]
            return (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">{initials(e.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.position}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Progress value={e.progress} className="flex-1 h-2" />
                    <span className="text-xs font-medium text-muted-foreground w-8 text-right">{e.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn("text-sm font-semibold", e.score >= 85 ? "text-emerald-600" : e.score >= 70 ? "text-blue-600" : e.score > 0 ? "text-amber-600" : "text-muted-foreground")}>
                    {e.score || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">{e.coursesCompleted}/{e.coursesTotal}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AuthorsCategoriesBlock() {
  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Authors */}
      <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Авторы</h3>
        <div className="space-y-3">
          {AUTHORS.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
              <Avatar className="w-9 h-9">
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">{initials(a.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{a.name}</span>
                  {a.isTop && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-transparent">Топ автор</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{a.articles} статей · {a.courses} курсов</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Категории</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {CATEGORIES.map((cat, i) => (
            <Link
              key={i}
              href={`/knowledge/category/${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
              className="border rounded-lg p-3 hover:bg-muted/30 transition-colors flex items-center gap-3"
            >
              <cat.icon className={cn("w-5 h-5 shrink-0", cat.color)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{cat.name}</p>
                <p className="text-xs text-muted-foreground">{cat.count} статей</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function LeadersBlock() {
  const [courseFilter, setCourseFilter] = useState("all")
  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2)

  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Рейтинг по курсам</h3>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все курсы</SelectItem>
            {COURSES.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {COURSE_LEADERS.map((l) => (
          <div key={l.rank} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0", RANK_COLORS[l.rank] || "bg-muted text-muted-foreground")}>
              {l.rank}
            </div>
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">{initials(l.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.position}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{l.score} баллов</p>
              <p className="text-xs text-muted-foreground">{l.pct}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityChartBlock() {
  const [period, setPeriod] = useState<"7" | "30" | "90">("30")
  const data = period === "7" ? ACTIVITY_DATA.slice(-7) : period === "90" ? ACTIVITY_DATA : ACTIVITY_DATA

  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Активность</h3>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {(["7", "30", "90"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1 text-xs rounded-md transition-colors",
                period === p ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}дн
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.blue} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCourses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.green} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.green} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gArticles" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.purple} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.purple} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--border)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--border)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="views" fill="url(#gViews)" stroke="none" />
            <Area type="monotone" dataKey="courses" fill="url(#gCourses)" stroke="none" />
            <Area type="monotone" dataKey="articles" fill="url(#gArticles)" stroke="none" />
            <Line type="monotone" dataKey="views" stroke={C.blue} strokeWidth={2} dot={false} name="Просмотры" />
            <Line type="monotone" dataKey="courses" stroke={C.green} strokeWidth={2} dot={false} name="Прохождения" />
            <Line type="monotone" dataKey="articles" stroke={C.purple} strokeWidth={2} dot={false} name="Новые статьи" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Block registry ─────────────────────────────────────────────────────────

const BLOCK_MAP: Record<string, () => React.ReactNode> = {
  ai: () => <AiAssistantBlock />,
  metrics: () => <MetricsBlock />,
  progress: () => <ProgressCoursesBlock />,
  employees: () => <EmployeesBlock />,
  authors: () => <AuthorsCategoriesBlock />,
  leaders: () => <LeadersBlock />,
  chart: () => <ActivityChartBlock />,
}

const DEFAULT_ORDER = ["ai", "metrics", "progress", "employees", "authors", "leaders", "chart"]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [blockOrder, setBlockOrder] = useState(DEFAULT_ORDER)
  const [catFilter, setCatFilter] = useState("all")
  const [deptFilter, setDeptFilter] = useState("all")

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlockOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as string)
        const newIdx = prev.indexOf(over.id as string)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h1 className="text-xl font-semibold">База знаний</h1>
                <p className="text-sm text-muted-foreground mt-0.5">42 статьи · 6 курсов · 18 сотрудников проходят обучение</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Все категории" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все категории</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Все отделы" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все отделы</SelectItem>
                    <SelectItem value="Продажи">Продажи</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Финансы">Финансы</SelectItem>
                  </SelectContent>
                </Select>
                <Link href="/knowledge/new">
                  <Button size="sm" className="gap-1.5 h-8 text-xs">
                    <Plus className="w-3.5 h-3.5" />Новая статья
                  </Button>
                </Link>
              </div>
            </div>

            {/* DnD blocks */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blockOrder} strategy={verticalListSortingStrategy}>
                <div className="space-y-5">
                  {blockOrder.map((id) => (
                    <SortableBlock key={id} id={id}>
                      {BLOCK_MAP[id]()}
                    </SortableBlock>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
