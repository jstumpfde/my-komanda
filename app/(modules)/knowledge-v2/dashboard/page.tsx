"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  BookOpen, CheckCircle2, Clock, AlertTriangle, FileWarning,
  Sparkles, Users, TrendingUp, Plus, Trophy,
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecentItem {
  id?: string
  name: string
  type: string
  author: string
  updatedAt: string | null
}

interface NensiHint {
  emoji: string
  title: string
  desc: string
}

interface DayActivity {
  day: string
  views: number
}

interface DashboardStats {
  metrics: {
    totalMaterials: number
    completed: number
    inProgress: number
    overdue: number
    needsUpdate: number
  }
  totals: { assignments: number }
  employeeProgress: {
    userId: string
    name: string
    position: string
    assigned: number
    done: number
    overdue: number
    status: "on_track" | "behind" | "not_started"
  }[]
  topAuthors: {
    name: string
    role: string
    created: number
    updated: number
    lastActivity: string | null
  }[]
  nensiHints: NensiHint[]
  weeklyActivity: DayActivity[]
  weeklyTotal: number
  recentUpdates: RecentItem[]
  leaderboard: {
    userId: string
    name: string
    position: string | null
    totalPoints: number
    lessons: number
    courses: number
    tests: number
    trainings: number
  }[]
}

type ProgressStatus = "on_track" | "behind" | "not_started"

const STATUS_META: Record<ProgressStatus, { label: string; badgeClass: string }> = {
  on_track:    { label: "На графике", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  behind:      { label: "Отстаёт",    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" },
  not_started: { label: "Не начал",   badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (days < 1) return "сегодня"
  if (days < 2) return "вчера"
  if (days < 7) return `${days} дн назад`
  if (days < 30) return `${Math.floor(days / 7)} нед назад`
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KnowledgeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/modules/knowledge/dashboard-stats")
        if (res.ok) {
          const data = (await res.json()) as DashboardStats
          setStats(data)
        }
      } catch {
        // Silent fall-through — dashboard still renders with zeros/empty tables
      }
    }
    load()
  }, [])

  const totalCount = stats?.metrics.totalMaterials ?? null
  const completed = stats?.metrics.completed ?? 0
  const inProgress = stats?.metrics.inProgress ?? 0
  const overdue = stats?.metrics.overdue ?? 0
  const needsUpdate = stats?.metrics.needsUpdate ?? 0
  const totalAssigned = stats?.totals.assignments ?? 0
  const employeeProgress = stats?.employeeProgress ?? []
  const topAuthors = stats?.topAuthors ?? []
  const nensiHints = stats?.nensiHints ?? []
  const weeklyActivity = stats?.weeklyActivity ?? []
  const weeklyTotal = stats?.weeklyTotal ?? 0
  const recent = stats?.recentUpdates ?? []
  const leaderboard = stats?.leaderboard ?? []

  const metricCards = [
    {
      label: "Изучено сотрудниками",
      value: String(completed),
      sub: `из ${totalAssigned} назначенных`,
      icon: CheckCircle2,
      bg: "bg-emerald-500",
    },
    {
      label: "В процессе изучения",
      value: String(inProgress),
      sub: "активных сейчас",
      icon: Clock,
      bg: "bg-purple-500",
    },
    {
      label: "Отстают",
      value: String(overdue),
      sub: "не завершили вовремя",
      icon: AlertTriangle,
      bg: "bg-orange-500",
    },
    {
      label: "Требуют обновления",
      value: String(needsUpdate),
      sub: "устаревшие материалы",
      icon: FileWarning,
      bg: "bg-red-500",
    },
  ]

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

              {metricCards.map((m) => (
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
              {nensiHints.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                  Пока нечего рекомендовать — Ненси не видит неотвеченных вопросов за последние 7 дней.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {nensiHints.map((h, i) => (
                    <div key={`${h.title}-${i}`} className="rounded-lg bg-white/70 dark:bg-card/60 backdrop-blur p-3 border border-white/50 dark:border-border/50">
                      <div className="text-lg mb-1">{h.emoji}</div>
                      <div className="text-sm font-semibold mb-0.5 line-clamp-1">{h.title}</div>
                      <div className="text-xs text-muted-foreground leading-snug line-clamp-2">{h.desc}</div>
                    </div>
                  ))}
                </div>
              )}
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
                      {employeeProgress.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                            Пока нет назначений.{" "}
                            <Link href="/knowledge-v2/plans" className="text-primary hover:underline">
                              Создайте план обучения
                            </Link>
                          </td>
                        </tr>
                      )}
                      {employeeProgress.map((e) => {
                        const pct = e.assigned > 0 ? Math.round((e.done / e.assigned) * 100) : 0
                        const meta = STATUS_META[e.status]
                        return (
                          <tr key={e.userId} className="border-b border-border/50">
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
                  <span className="text-xs text-muted-foreground">вопросы к Ненси</span>
                </div>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyActivity} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7F77DD" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#7F77DD" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
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
                  <span>Итого: <b className="text-foreground">{weeklyTotal}</b> {weeklyTotal === 1 ? "запрос" : "запросов"}</span>
                </div>
              </div>
            </div>

            {/* ═══ Leaderboard (геймификация) ═══ */}
            <div className="rounded-xl border border-border p-5 bg-card">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold">Рейтинг обучения</h3>
                <span className="text-xs text-muted-foreground ml-1">топ-5 сотрудников</span>
              </div>
              {leaderboard.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Пока нет начислений. Баллы появятся после первой завершённой тренировки или урока.
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((l, i) => {
                    const medal = ["🥇", "🥈", "🥉"][i] ?? null
                    return (
                      <div
                        key={l.userId}
                        className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
                      >
                        <div className="w-7 h-7 rounded-full bg-background border flex items-center justify-center text-xs font-semibold shrink-0">
                          {medal ?? i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{l.name}</div>
                          {l.position && (
                            <div className="text-xs text-muted-foreground truncate">{l.position}</div>
                          )}
                        </div>
                        <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
                          {l.trainings > 0 && <span>🎯 {l.trainings}</span>}
                          {l.courses > 0 && <span>📚 {l.courses}</span>}
                          {l.lessons > 0 && <span>✅ {l.lessons}</span>}
                          {l.tests > 0 && <span>💯 {l.tests}</span>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                            {l.totalPoints}
                          </div>
                          <div className="text-[10px] text-muted-foreground -mt-0.5">баллов</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
                  {topAuthors.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                        Пока нет авторов
                      </td>
                    </tr>
                  )}
                  {topAuthors.map((a, i) => (
                    <tr key={`${a.name}-${i}`} className="border-b border-border/50">
                      <td className="py-2.5">
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.role}</div>
                      </td>
                      <td className="py-2.5 text-center text-sm text-muted-foreground">{a.created}</td>
                      <td className="py-2.5 text-center text-sm text-muted-foreground">{a.updated}</td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelative(a.lastActivity)}
                      </td>
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
                      <tr key={r.id ?? `${r.name}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 text-sm font-medium">{r.name}</td>
                        <td className="py-2.5 text-xs text-muted-foreground">{r.type}</td>
                        <td className="py-2.5 text-xs text-muted-foreground">{r.author}</td>
                        <td className="py-2.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                          {formatRelative(r.updatedAt)}
                        </td>
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
