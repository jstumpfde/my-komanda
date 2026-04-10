"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  BookOpen, CheckCircle2, Clock, AlertTriangle, FileWarning,
  Sparkles, Users, TrendingUp, Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AiAssistantWidget } from "@/components/knowledge/ai-assistant-widget"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"

// ─── Mock data ──────────────────────────────────────────────────────────────

// First metric (total materials) is fetched; the other four remain mocked
// until the learning-progress backend lands.
const MOCK_METRICS = [
  { label: "Изучено сотрудниками",   value: "128", sub: "из 184 назначенных",   icon: CheckCircle2, bg: "bg-green-500" },
  { label: "В процессе изучения",    value: "42",  sub: "активных сейчас",      icon: Clock,        bg: "bg-purple-500" },
  { label: "Отстают",                value: "14",  sub: "не завершили вовремя", icon: AlertTriangle, bg: "bg-orange-500" },
  { label: "Требуют обновления",     value: "7",   sub: "устаревшие материалы", icon: FileWarning,  bg: "bg-red-400" },
]

interface RecentItem {
  name: string
  type: string
  author: string
  date: string
}

const NENSI_HINTS = [
  {
    emoji: "⏰",
    title: "3 материала устарели",
    desc: "Регламент по безопасности не обновлялся 6 мес.",
  },
  {
    emoji: "💤",
    title: "Новый сотрудник не начал обучение",
    desc: "Иванов А. — 5 дней без активности",
  },
  {
    emoji: "❓",
    title: "Популярная тема без материала",
    desc: "Сотрудники часто спрашивают про CRM",
  },
  {
    emoji: "📝",
    title: "Шаблон без контента",
    desc: "IT-специалист: 4 урока пустые",
  },
]

type ProgressStatus = "on_track" | "behind" | "not_started"

const EMPLOYEE_PROGRESS: {
  name: string; position: string; assigned: number; done: number; status: ProgressStatus
}[] = [
  { name: "Петров А.",     position: "Менеджер B2B",     assigned: 12, done: 10, status: "on_track" },
  { name: "Иванова М.",    position: "Frontend",          assigned: 8,  done: 8,  status: "on_track" },
  { name: "Сидоров К.",    position: "Sales",             assigned: 10, done: 3,  status: "behind" },
  { name: "Козлов Д.",     position: "Менеджер B2B",     assigned: 12, done: 6,  status: "on_track" },
  { name: "Новиков П.",    position: "HR-менеджер",       assigned: 15, done: 0,  status: "not_started" },
  { name: "Орлова Е.",     position: "Клиент-сервис",     assigned: 9,  done: 7,  status: "on_track" },
  { name: "Белов Р.",      position: "IT-поддержка",      assigned: 6,  done: 1,  status: "behind" },
]

const STATUS_META: Record<ProgressStatus, { label: string; badgeClass: string }> = {
  on_track:    { label: "На графике", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  behind:      { label: "Отстаёт",    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" },
  not_started: { label: "Не начал",   badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
}

const WEEKLY_ACTIVITY = [
  { day: "Пн", views: 18 },
  { day: "Вт", views: 24 },
  { day: "Ср", views: 32 },
  { day: "Чт", views: 28 },
  { day: "Пт", views: 41 },
  { day: "Сб", views: 9 },
  { day: "Вс", views: 6 },
]

const TOP_AUTHORS = [
  { name: "Петрова Е.",  role: "HR Lead",        created: 12, updated: 34, lastActivity: "сегодня" },
  { name: "Иванов С.",   role: "Директор",       created: 8,  updated: 19, lastActivity: "вчера" },
  { name: "Козлова М.",  role: "HR-менеджер",    created: 6,  updated: 22, lastActivity: "2 дн назад" },
  { name: "Сидоров А.",  role: "Тимлид IT",      created: 4,  updated: 11, lastActivity: "3 дн назад" },
  { name: "Орлов Д.",    role: "Sales Lead",     created: 3,  updated: 8,  lastActivity: "неделю назад" },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KnowledgeDashboardPage() {
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [recent, setRecent] = useState<RecentItem[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const [demosRes, articlesRes] = await Promise.all([
          fetch("/api/demo-templates").then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/modules/knowledge/articles").then((r) => r.json()).catch(() => ({ data: [] })),
        ])
        const demos = (demosRes.data ?? demosRes ?? []) as Array<{
          id: string; name: string; updatedAt: string
        }>
        const articles = (articlesRes.data?.articles ?? articlesRes.articles ?? []) as Array<{
          id: string; title: string; updatedAt: string
        }>

        setTotalCount(demos.length + articles.length)

        const merged: (RecentItem & { ts: number })[] = [
          ...demos.map((d) => ({
            name: d.name,
            type: "Презентация",
            author: "—",
            date: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "",
            ts: d.updatedAt ? new Date(d.updatedAt).getTime() : 0,
          })),
          ...articles.map((a) => ({
            name: a.title,
            type: "Статья",
            author: "—",
            date: a.updatedAt ? new Date(a.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "",
            ts: a.updatedAt ? new Date(a.updatedAt).getTime() : 0,
          })),
        ]
        merged.sort((a, b) => b.ts - a.ts)
        setRecent(merged.slice(0, 10).map(({ ts: _ts, ...rest }) => rest))
      } catch {
        // Silent fall-through — dashboard still renders with zeros/empty table
      }
    }
    load()
  }, [])

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Дашборд базы знаний</h1>
              <p className="text-sm text-muted-foreground mt-1">Обучение, материалы и активность сотрудников</p>
            </div>
            <Button asChild>
              <Link href="/knowledge-v2/create">
                <Plus className="h-4 w-4 mr-1" />Создать материал
              </Link>
            </Button>
          </div>

          <div className="space-y-5">
            {/* ═══ Colored metric cards ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Total materials — real fetch */}
              <div className="rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 text-white bg-blue-500">
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">Всего материалов</span>
                </div>
                <p className="text-3xl font-bold text-white">{totalCount === null ? "…" : totalCount}</p>
                <p className="text-sm mt-1 text-white/90">в библиотеке</p>
              </div>

              {/* Remaining four — mocked for now */}
              {MOCK_METRICS.map((m) => (
                <div key={m.label} className={cn("rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 text-white", m.bg)}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <m.icon className="w-4 h-4 text-white" />
                    <span className="text-sm font-semibold text-white">{m.label}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{m.value}</p>
                  <p className="text-sm mt-1 text-white/90">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* ═══ Ненси рекомендует ═══ */}
            <div className="rounded-xl border bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-white/70 dark:bg-white/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">🤖 Ненси рекомендует</h3>
                  <p className="text-xs text-muted-foreground">Материалы и события, на которые стоит обратить внимание</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {NENSI_HINTS.map((h) => (
                  <div key={h.title} className="rounded-lg bg-white/70 dark:bg-card/60 backdrop-blur p-3 border border-white/50 dark:border-border/50">
                    <div className="text-lg mb-1">{h.emoji}</div>
                    <div className="text-sm font-semibold mb-0.5">{h.title}</div>
                    <div className="text-xs text-muted-foreground leading-snug">{h.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ Employee progress + Weekly activity ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Employee progress */}
              <div className="rounded-xl border border-border p-5 bg-card">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-base font-semibold">Прогресс по сотрудникам</h3>
                </div>
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Сотрудник</th>
                        <th className="text-center text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Прогресс</th>
                        <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EMPLOYEE_PROGRESS.map((e) => {
                        const pct = e.assigned > 0 ? Math.round((e.done / e.assigned) * 100) : 0
                        const meta = STATUS_META[e.status]
                        return (
                          <tr key={e.name} className="border-b border-border/50">
                            <td className="py-2.5">
                              <div className="text-sm font-medium">{e.name}</div>
                              <div className="text-xs text-muted-foreground">{e.position}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      e.status === "on_track" && "bg-emerald-500",
                                      e.status === "behind" && "bg-orange-500",
                                      e.status === "not_started" && "bg-red-400",
                                    )}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-14 text-right whitespace-nowrap">{e.done}/{e.assigned}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right">
                              <Badge variant="secondary" className={cn("text-[10px] font-medium border-0", meta.badgeClass)}>
                                {meta.label}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Weekly activity */}
              <div className="rounded-xl border border-border p-5 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-base font-semibold">Активность за неделю</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">просмотры материалов</span>
                </div>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={WEEKLY_ACTIVITY} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7F77DD" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#7F77DD" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          backgroundColor: "hsl(var(--popover))",
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Area type="monotone" dataKey="views" stroke="#7F77DD" strokeWidth={2} fill="url(#activityGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 px-1">
                  <span>Итого: <b className="text-foreground">158 просмотров</b></span>
                  <span className="text-emerald-600 dark:text-emerald-400">+18% к прошлой неделе</span>
                </div>
              </div>
            </div>

            {/* ═══ Top authors ═══ */}
            <div className="rounded-xl border border-border p-5 bg-card">
              <h3 className="text-base font-semibold mb-4">Топ авторов</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Автор</th>
                    <th className="text-center text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Создано</th>
                    <th className="text-center text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Обновлено</th>
                    <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Последняя активность</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_AUTHORS.map((a) => (
                    <tr key={a.name} className="border-b border-border/50">
                      <td className="py-2.5">
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.role}</div>
                      </td>
                      <td className="py-2.5 text-center text-sm text-muted-foreground">{a.created}</td>
                      <td className="py-2.5 text-center text-sm text-muted-foreground">{a.updated}</td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">{a.lastActivity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ═══ Recent updates ═══ */}
            <div className="rounded-xl border border-border p-5 bg-card">
              <h3 className="text-base font-semibold mb-4">Последние обновления</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Название</th>
                    <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Тип</th>
                    <th className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Автор</th>
                    <th className="text-right text-[10px] uppercase font-medium text-muted-foreground tracking-wider py-2">Обновлено</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                        Пока нет материалов.{" "}
                        <Link href="/knowledge-v2/create" className="text-primary hover:underline">Создайте первый</Link>
                      </td>
                    </tr>
                  ) : (
                    recent.map((r, i) => (
                      <tr key={`${r.name}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 text-sm font-medium">{r.name}</td>
                        <td className="py-2.5 text-xs text-muted-foreground">{r.type}</td>
                        <td className="py-2.5 text-xs text-muted-foreground">{r.author}</td>
                        <td className="py-2.5 text-xs text-muted-foreground text-right whitespace-nowrap">{r.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SidebarInset>
      <AiAssistantWidget />
    </SidebarProvider>
  )
}
