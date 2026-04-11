"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  CheckCircle2, Clock, AlertTriangle, Trophy, Users, TrendingUp, GraduationCap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

// ─── Types (subset of dashboard-stats API) ──────────────────────────────────

interface DashboardStats {
  metrics: {
    completed: number
    inProgress: number
    overdue: number
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

// ─── CountUp animation ────────────────────────────────────────────────────

function useCountUp(target: number | null, durationMs: number = 1500): number {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (target === null || target === undefined) return
    const start = display
    const delta = target - start
    if (delta === 0) return
    const startTime = performance.now()
    let rafId = 0
    const tick = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(start + delta * eased))
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])
  return display
}

function CountUp({ value }: { value: number | null }) {
  const display = useCountUp(value)
  if (value === null) return <>…</>
  return <>{display}</>
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function LearningDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [progressAnimated, setProgressAnimated] = useState(false)

  useEffect(() => {
    fetch("/api/modules/knowledge/dashboard-stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setStats(d as DashboardStats) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (stats && !progressAnimated) {
      const t = setTimeout(() => setProgressAnimated(true), 400)
      return () => clearTimeout(t)
    }
  }, [stats, progressAnimated])

  const completed = stats?.metrics.completed ?? 0
  const inProgress = stats?.metrics.inProgress ?? 0
  const overdue = stats?.metrics.overdue ?? 0
  const totalAssigned = stats?.totals.assignments ?? 0
  const employeeProgress = stats?.employeeProgress ?? []
  const leaderboard = stats?.leaderboard ?? []

  const metricCards: {
    label: string
    numericValue: number | null
    sub: string
    icon: typeof CheckCircle2
    bg: string
  }[] = [
    {
      label: "Завершили",
      numericValue: stats ? completed : null,
      sub: `из ${totalAssigned} назначений`,
      icon: CheckCircle2,
      bg: "bg-emerald-500",
    },
    {
      label: "В процессе",
      numericValue: stats ? inProgress : null,
      sub: "активных сейчас",
      icon: Clock,
      bg: "bg-purple-500",
    },
    {
      label: "Отстают",
      numericValue: stats ? overdue : null,
      sub: "не завершили вовремя",
      icon: AlertTriangle,
      bg: "bg-orange-500",
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
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-violet-500" />
                <h1 className="text-2xl font-bold tracking-tight">Обучение</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Прогресс сотрудников, курсы, тренировки и рейтинг</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* ═══ Metric cards ═══ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {metricCards.map((m) => (
                <div
                  key={m.label}
                  className={cn("rounded-xl shadow-sm p-4 text-white hover:scale-[1.02] hover:shadow-lg transition-all duration-200", m.bg)}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <m.icon className="w-4 h-4 text-white" />
                    <span className="text-sm font-semibold text-white">{m.label}</span>
                  </div>
                  <p className="text-3xl font-bold text-white tabular-nums">
                    <CountUp value={m.numericValue} />
                  </p>
                  <p className="text-sm mt-1 text-white/90">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* ═══ Employee progress ═══ */}
            <div className="rounded-xl border border-border p-5 bg-card hover:shadow-lg transition-shadow duration-200">
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
                          <Link href="/learning/plans" className="text-primary hover:underline">
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
                                    "h-full rounded-full transition-all duration-1000 ease-out",
                                    e.status === "on_track" && "bg-emerald-500",
                                    e.status === "behind" && "bg-orange-500",
                                    e.status === "not_started" && "bg-red-400",
                                  )}
                                  style={{ width: progressAnimated ? `${pct}%` : "0%" }}
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

            {/* ═══ Top-5 Leaderboard ═══ */}
            <div className="rounded-xl border border-border p-5 bg-card hover:shadow-lg transition-shadow duration-200">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold">Рейтинг обучения</h3>
                <Link href="/learning/achievements" className="text-xs text-primary hover:underline ml-auto">
                  Все →
                </Link>
              </div>
              {leaderboard.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Пока нет начислений. Баллы появятся после первой завершённой тренировки или урока.
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.slice(0, 5).map((l, i) => {
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

            {/* Quick links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link href="/learning/courses" className="rounded-xl border p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <TrendingUp className="w-5 h-5 text-violet-500 mb-2" />
                <div className="text-sm font-semibold">AI-курсы</div>
                <div className="text-xs text-muted-foreground mt-0.5">Создавайте курсы из ваших материалов</div>
              </Link>
              <Link href="/learning/training" className="rounded-xl border p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <Users className="w-5 h-5 text-violet-500 mb-2" />
                <div className="text-sm font-semibold">Тренировки</div>
                <div className="text-xs text-muted-foreground mt-0.5">Ролевые сценарии с AI</div>
              </Link>
              <Link href="/learning/plans" className="rounded-xl border p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <GraduationCap className="w-5 h-5 text-violet-500 mb-2" />
                <div className="text-sm font-semibold">Планы обучения</div>
                <div className="text-xs text-muted-foreground mt-0.5">Назначение материалов сотрудникам</div>
              </Link>
              <Link href="/learning/achievements" className="rounded-xl border p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <Trophy className="w-5 h-5 text-amber-500 mb-2" />
                <div className="text-sm font-semibold">Рейтинг</div>
                <div className="text-xs text-muted-foreground mt-0.5">Баллы за курсы, тесты, тренировки</div>
              </Link>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
