"use client"

import { useState, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Users, UserCheck, Eye, Briefcase,
  TrendingUp, Target, BarChart3,
  AlertTriangle, Star, Clock, Zap,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts"

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
}

// ─── Данные по вакансиям ──────────────────────────────────
interface VacancyStats {
  id: string
  name: string
  daysActive: number
  candidates: number
  hired: number
  status: string
  funnel: { stage: string; count: number; avgScore: number; color: string }[]
  sources: { source: string; count: number; avgScore: number; color: string }[]
  scores: { range: string; count: number; color: string }[]
}

const allVacancies: VacancyStats[] = [
  {
    id: "sales", name: "Менеджер по продажам", daysActive: 18, candidates: 312, hired: 4, status: "Активна",
    funnel: [
      { stage: "Всего откликов", count: 312, avgScore: 68, color: "#94a3b8" },
      { stage: "Прошли демонстрацию", count: 87, avgScore: 76, color: "#3b82f6" },
      { stage: "Прошли интервью", count: 18, avgScore: 82, color: "#f59e0b" },
      { stage: "Нанято", count: 4, avgScore: 89, color: "#22c55e" },
    ],
    sources: [
      { source: "hh.ru", count: 189, avgScore: 72, color: "#3b82f6" },
      { source: "Avito", count: 67, avgScore: 61, color: "#06b6d4" },
      { source: "Реферал", count: 28, avgScore: 84, color: "#10b981" },
      { source: "Прямая ссылка", count: 18, avgScore: 76, color: "#8b5cf6" },
      { source: "Другое", count: 10, avgScore: 65, color: "#94a3b8" },
    ],
    scores: [
      { range: "0-40", count: 42, color: "#ef4444" },
      { range: "41-70", count: 158, color: "#f59e0b" },
      { range: "71-100", count: 112, color: "#22c55e" },
    ],
  },
  {
    id: "dev", name: "Frontend-разработчик", daysActive: 32, candidates: 245, hired: 2, status: "Активна",
    funnel: [
      { stage: "Всего откликов", count: 245, avgScore: 71, color: "#94a3b8" },
      { stage: "Прошли демонстрацию", count: 62, avgScore: 78, color: "#3b82f6" },
      { stage: "Прошли интервью", count: 14, avgScore: 85, color: "#f59e0b" },
      { stage: "Нанято", count: 2, avgScore: 91, color: "#22c55e" },
    ],
    sources: [
      { source: "hh.ru", count: 134, avgScore: 74, color: "#3b82f6" },
      { source: "Avito", count: 12, avgScore: 58, color: "#06b6d4" },
      { source: "Реферал", count: 45, avgScore: 82, color: "#10b981" },
      { source: "Прямая ссылка", count: 38, avgScore: 76, color: "#8b5cf6" },
      { source: "Другое", count: 16, avgScore: 63, color: "#94a3b8" },
    ],
    scores: [
      { range: "0-40", count: 28, color: "#ef4444" },
      { range: "41-70", count: 112, color: "#f59e0b" },
      { range: "71-100", count: 105, color: "#22c55e" },
    ],
  },
  {
    id: "ops", name: "Оператор склада", daysActive: 45, candidates: 290, hired: 6, status: "Активна",
    funnel: [
      { stage: "Всего откликов", count: 290, avgScore: 58, color: "#94a3b8" },
      { stage: "Прошли демонстрацию", count: 64, avgScore: 68, color: "#3b82f6" },
      { stage: "Прошли интервью", count: 15, avgScore: 74, color: "#f59e0b" },
      { stage: "Нанято", count: 6, avgScore: 78, color: "#22c55e" },
    ],
    sources: [
      { source: "hh.ru", count: 145, avgScore: 56, color: "#3b82f6" },
      { source: "Avito", count: 98, avgScore: 54, color: "#06b6d4" },
      { source: "Реферал", count: 12, avgScore: 72, color: "#10b981" },
      { source: "Прямая ссылка", count: 25, avgScore: 62, color: "#8b5cf6" },
      { source: "Другое", count: 10, avgScore: 58, color: "#94a3b8" },
    ],
    scores: [
      { range: "0-40", count: 78, color: "#ef4444" },
      { range: "41-70", count: 142, color: "#f59e0b" },
      { range: "71-100", count: 70, color: "#22c55e" },
    ],
  },
]

function aggregate(vacancies: VacancyStats[]) {
  const funnel = ["Всего откликов", "Прошли демонстрацию", "Прошли интервью", "Нанято"].map((stage, i) => {
    const colors = ["#94a3b8", "#3b82f6", "#f59e0b", "#22c55e"]
    const totalCount = vacancies.reduce((a, v) => a + (v.funnel[i]?.count || 0), 0)
    const totalScore = vacancies.reduce((a, v) => a + (v.funnel[i]?.avgScore || 0) * (v.funnel[i]?.count || 0), 0)
    return { stage, count: totalCount, avgScore: totalCount > 0 ? Math.round(totalScore / totalCount) : 0, color: colors[i] }
  })

  const sourceMap = new Map<string, { count: number; scoreSum: number; color: string }>()
  vacancies.forEach((v) => v.sources.forEach((s) => {
    const existing = sourceMap.get(s.source) || { count: 0, scoreSum: 0, color: s.color }
    existing.count += s.count
    existing.scoreSum += s.avgScore * s.count
    sourceMap.set(s.source, existing)
  }))
  const sources = Array.from(sourceMap.entries()).map(([source, d]) => ({
    source, count: d.count, avgScore: Math.round(d.scoreSum / d.count), color: d.color, pct: 0,
  }))
  const totalSrc = sources.reduce((a, s) => a + s.count, 0)
  sources.forEach((s) => (s.pct = totalSrc > 0 ? Math.round((s.count / totalSrc) * 100) : 0))

  const scores = [
    { range: "0-40 (низкий)", count: vacancies.reduce((a, v) => a + v.scores[0].count, 0), color: "#ef4444" },
    { range: "41-70 (средний)", count: vacancies.reduce((a, v) => a + v.scores[1].count, 0), color: "#f59e0b" },
    { range: "71-100 (высокий)", count: vacancies.reduce((a, v) => a + v.scores[2].count, 0), color: "#22c55e" },
  ]

  return { funnel, sources, scores }
}

export default function AnalyticsPage() {
  const [vacancyFilter, setVacancyFilter] = useState("all")

  const filtered = useMemo(() => {
    const vacs = vacancyFilter === "all" ? allVacancies : allVacancies.filter((v) => v.id === vacancyFilter)
    return aggregate(vacs)
  }, [vacancyFilter])

  const { funnel, sources, scores } = filtered

  // Конверсии между этапами
  const transitions = funnel.slice(1).map((s, i) => ({
    from: funnel[i].stage,
    to: s.stage,
    pct: funnel[i].count > 0 ? Math.round((s.count / funnel[i].count) * 100) : 0,
  }))
  const minPct = Math.min(...transitions.map((t) => t.pct))
  const totalConversion = funnel[0].count > 0 ? ((funnel[funnel.length - 1].count / funnel[0].count) * 100).toFixed(1) : "0"

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 space-y-6">
            {/* Header + Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Аналитика</h1>
                <p className="text-muted-foreground text-sm">Статистика по найму</p>
              </div>
              <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
                <SelectTrigger className="w-[220px] h-9">
                  <Briefcase className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все вакансии</SelectItem>
                  {allVacancies.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* ═══ БЛОК 1: Воронка ═══ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />Воронка найма
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Плашки */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {funnel.map((s, i) => {
                    const convPct = i > 0 && funnel[0].count > 0 ? Math.round((s.count / funnel[0].count) * 100) : null
                    return (
                      <div key={s.stage} className="p-3 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-xs text-muted-foreground">{s.stage}</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{s.count}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {convPct !== null && <span className="text-[11px] text-muted-foreground">→ {convPct}%</span>}
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5"><Zap className="w-3 h-3" />{s.avgScore}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Бар-чарт */}
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={funnel} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={160} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Кандидатов" radius={[0, 6, 6, 0]}>
                      {funnel.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ═══ БЛОК: Конверсия между этапами ═══ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />Конверсия между этапами
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {transitions.map((t) => {
                  const isWorst = t.pct === minPct && t.pct < 100
                  return (
                    <div key={t.from + t.to} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm", isWorst ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-muted/30")}>
                      <span className="text-muted-foreground w-[220px] shrink-0 text-xs">{t.from} → {t.to}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", isWorst ? "bg-red-500" : "bg-primary")} style={{ width: `${t.pct}%` }} />
                      </div>
                      <span className={cn("text-xs font-semibold w-12 text-right", isWorst ? "text-red-600 dark:text-red-400" : "text-foreground")}>{t.pct}%</span>
                      {isWorst && (
                        <div className="flex items-center gap-1 text-red-600 dark:text-red-400 shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Здесь теряем больше всего</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex items-center justify-between mt-3 px-3 pt-2 border-t border-border">
                  <span className="text-xs font-medium text-foreground">Общая конверсия воронки</span>
                  <Badge variant="secondary" className="text-xs font-bold">{totalConversion}%</Badge>
                </div>
              </CardContent>
            </Card>

            {/* ═══ БЛОК 2: Источники ═══ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />Источники кандидатов
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Pie */}
                  <div className="w-full lg:w-1/3">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={sources} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="count" strokeWidth={2} stroke="var(--background)">
                          {sources.map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Table */}
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кандидатов</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">% от общего</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ср. AI-скор</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sources.map((s) => (
                          <tr key={s.source} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /><span className="text-sm font-medium">{s.source}</span></div>
                            </td>
                            <td className="text-right px-3 py-2 text-sm font-medium">{s.count}</td>
                            <td className="text-right px-3 py-2 text-sm text-muted-foreground">{s.pct}%</td>
                            <td className="text-right px-3 py-2">
                              <Badge variant="outline" className={cn("text-xs", s.avgScore >= 75 ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : s.avgScore >= 60 ? "bg-amber-500/10 text-amber-700 border-amber-200" : "bg-red-500/10 text-red-700 border-red-200")}>{s.avgScore}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ═══ БЛОК 3: AI-скор ═══ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />Распределение AI-скора
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={scores} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Кандидатов" radius={[6, 6, 0, 0]}>
                      {scores.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-3">
                  {scores.map((s) => (
                    <div key={s.range} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-muted-foreground">{s.range}: <span className="font-semibold text-foreground">{s.count}</span></span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ═══ БЛОК 4: Время закрытия ═══ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />Время закрытия вакансий
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Вакансия</th>
                      <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дней активна</th>
                      <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кандидатов</th>
                      <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Нанято</th>
                      <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(vacancyFilter === "all" ? allVacancies : allVacancies.filter((v) => v.id === vacancyFilter)).map((v) => (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{v.name}</td>
                        <td className="text-right px-4 py-3 text-sm">{v.daysActive} дн.</td>
                        <td className="text-right px-4 py-3 text-sm">{v.candidates}</td>
                        <td className="text-right px-4 py-3 text-sm font-semibold">{v.hired}</td>
                        <td className="text-right px-4 py-3">
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">{v.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
