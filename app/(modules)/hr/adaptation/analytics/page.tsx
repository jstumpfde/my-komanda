"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Users, TrendingUp, Clock, CheckCircle2, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"

interface Summary {
  activeCount: number
  avgCompletionPct: number
  avgDaysToComplete: number | null
  completedLast30Pct: number
  totalAssignments: number
}

interface FunnelStep {
  label: string
  value: number
  pct: number
}

interface ProblemStep {
  stepId: string
  title: string
  dayNumber: number
  type: string
  planTitle: string
  completionPct: number
  skipPct: number
  avgScore: number | null
  total: number
}

interface ActivityDay {
  date: string
  count: number
}

const STAT_CARDS = [
  {
    key: "activeCount" as const,
    label: "На адаптации сейчас",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    format: (v: number | null) => v?.toString() ?? "0",
  },
  {
    key: "avgCompletionPct" as const,
    label: "Средний % прохождения",
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    format: (v: number | null) => v != null ? `${v}%` : "—",
  },
  {
    key: "avgDaysToComplete" as const,
    label: "Среднее время (дни)",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    format: (v: number | null) => v != null ? `${v} д.` : "—",
  },
  {
    key: "completedLast30Pct" as const,
    label: "Завершили за 30 дней",
    icon: CheckCircle2,
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    format: (v: number | null) => v != null ? `${v}%` : "—",
  },
]

const FUNNEL_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"]

const STEP_TYPE_LABELS: Record<string, string> = {
  lesson: "Урок", task: "Задание", quiz: "Тест",
  video: "Видео", checklist: "Чеклист", meeting: "Встреча",
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()}.${(d.getMonth() + 1).toString().padStart(2, "0")}`
}

export default function AdaptationAnalyticsPage() {
  const [summary, setSummary]       = useState<Summary | null>(null)
  const [funnel, setFunnel]         = useState<FunnelStep[]>([])
  const [problems, setProblems]     = useState<ProblemStep[]>([])
  const [activity, setActivity]     = useState<ActivityDay[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/modules/hr/adaptation/analytics/summary").then(r => r.json()),
      fetch("/api/modules/hr/adaptation/analytics/funnel").then(r => r.json()),
      fetch("/api/modules/hr/adaptation/analytics/problem-steps").then(r => r.json()),
      fetch("/api/modules/hr/adaptation/analytics/activity").then(r => r.json()),
    ]).then(([s, f, p, a]) => {
      setSummary(s)
      setFunnel(Array.isArray(f) ? f : [])
      setProblems(Array.isArray(p) ? p : [])
      setActivity(Array.isArray(a) ? a : [])
    }).finally(() => setLoading(false))
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Аналитика адаптации</h1>
                <p className="text-sm text-muted-foreground">Сводка, воронка и проблемные шаги</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6">

                {/* Block 1: Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {STAT_CARDS.map(card => {
                    const Icon = card.icon
                    const value = summary ? (summary[card.key] as number | null) : null
                    return (
                      <Card key={card.key}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", card.bg)}>
                              <Icon className={cn("w-4 h-4", card.color)} />
                            </div>
                            <div>
                              <p className="text-2xl font-bold leading-none">{card.format(value)}</p>
                              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">

                  {/* Block 2: Funnel */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Воронка адаптации</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {funnel.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                      ) : (
                        <div className="space-y-3">
                          {funnel.map((step, i) => (
                            <div key={step.label}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">{step.label}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold">{step.value}</span>
                                  <span className="text-xs text-muted-foreground w-10 text-right">{step.pct}%</span>
                                </div>
                              </div>
                              <div className="h-5 rounded-md bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-md transition-all"
                                  style={{
                                    width: `${step.pct}%`,
                                    backgroundColor: FUNNEL_COLORS[i] ?? FUNNEL_COLORS[4],
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Block 4: Activity chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Активность за 30 дней</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {activity.every(d => d.count === 0) ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={activity} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                            <XAxis
                              dataKey="date"
                              tickFormatter={formatDate}
                              interval={6}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                              allowDecimals={false}
                            />
                            <Tooltip
                              formatter={(v: number) => [v, "шагов"]}
                              labelFormatter={(l: string) => {
                                const d = new Date(l)
                                return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })
                              }}
                              contentStyle={{ fontSize: 12, border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                            />
                            <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="hsl(var(--primary))" maxBarSize={16} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                </div>

                {/* Block 3: Problem steps */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Проблемные шаги</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {problems.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Шаг</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Тип</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">План</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">День</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">% выполн.</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ср. балл</th>
                            </tr>
                          </thead>
                          <tbody>
                            {problems.map(s => (
                              <tr key={s.stepId} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{s.title}</td>
                                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                                  {STEP_TYPE_LABELS[s.type] ?? s.type}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">
                                  {s.planTitle}
                                </td>
                                <td className="px-4 py-2.5 text-center">{s.dayNumber}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={cn(
                                    "font-semibold",
                                    s.completionPct < 40 ? "text-rose-600" :
                                    s.completionPct < 70 ? "text-amber-600" : "text-emerald-600"
                                  )}>
                                    {s.completionPct}%
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center text-muted-foreground">
                                  {s.avgScore != null ? s.avgScore : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
