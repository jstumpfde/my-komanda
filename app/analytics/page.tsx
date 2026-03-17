"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Users, UserCheck, Eye, Briefcase,
  TrendingUp, TrendingDown,
  Target, BarChart3, Lightbulb, AlertTriangle,
  ArrowDown, Star, Clock, Zap,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts"

// ─── Данные: Воронка ────────────────────────────────────────

const funnelStages = [
  { stage: "Отклик", count: 847, color: "#22d3ee" },
  { stage: "Квалификация", count: 523, color: "#f59e0b" },
  { stage: "Демонстрация", count: 213, color: "#3b82f6" },
  { stage: "Звонок", count: 126, color: "#8b5cf6" },
  { stage: "Интервью", count: 47, color: "#6366f1" },
  { stage: "Оффер", count: 14, color: "#22c55e" },
  { stage: "Нанят", count: 8, color: "#10b981" },
]

// Находим самый слабый переход
const transitions = funnelStages.slice(1).map((s, i) => ({
  from: funnelStages[i].stage,
  to: s.stage,
  conversionPct: Math.round((s.count / funnelStages[i].count) * 100),
  idx: i,
}))
const weakestTransition = transitions.reduce((min, t) => t.conversionPct < min.conversionPct ? t : min, transitions[0])

const kpiCards = [
  { title: "Всего откликов", value: "847", change: "+12%", trend: "up" as const, sub: "за неделю", icon: Users, color: "text-blue-600 bg-blue-500/10" },
  { title: "Прошли демонстрацию", value: "213", change: "25%", trend: "up" as const, sub: "от откликов", icon: Eye, color: "text-purple-600 bg-purple-500/10" },
  { title: "Дошли до интервью", value: "47", change: "5.5%", trend: "up" as const, sub: "от откликов", icon: Briefcase, color: "text-indigo-600 bg-indigo-500/10" },
  { title: "Нанято", value: "8", change: "0.9%", trend: "up" as const, sub: "от откликов", icon: UserCheck, color: "text-emerald-600 bg-emerald-500/10" },
]

// ─── Данные: Источники ──────────────────────────────────────

const sourceTableData = [
  { source: "hh.ru", candidates: 612, passedDemo: 213, hired: 8, conversion: 1.3, avgScore: 78, costPerHire: 18700, color: "#3b82f6" },
  { source: "Авито", candidates: 287, passedDemo: 89, hired: 5, conversion: 1.7, avgScore: 64, costPerHire: 9200, color: "#06b6d4" },
  { source: "Telegram", candidates: 134, passedDemo: 47, hired: 4, conversion: 3.0, avgScore: 76, costPerHire: 8300, color: "#6366f1" },
  { source: "Рефералы", candidates: 28, passedDemo: 18, hired: 4, conversion: 14.3, avgScore: 84, costPerHire: 3100, color: "#10b981", highlight: true },
]

// ─── Данные: Сценарии ───────────────────────────────────────

const scenarioTableData = [
  { scenario: "Демо → Звонок", vacancies: 5, conversion: 2.1, avgDays: 14, avgScore: 82, icon: "🎥", color: "text-purple-600 bg-purple-500/10" },
  { scenario: "Звонок → Демо", vacancies: 2, conversion: 1.4, avgDays: 18, avgScore: 79, icon: "📞", color: "text-blue-600 bg-blue-500/10" },
  { scenario: "Только звонок", vacancies: 2, conversion: 1.8, avgDays: 18, avgScore: 79, icon: "☎️", color: "text-emerald-600 bg-emerald-500/10" },
  { scenario: "Быстрый найм", vacancies: 3, conversion: 4.2, avgDays: 3, avgScore: 71, icon: "⚡", color: "text-amber-600 bg-amber-500/10" },
  { scenario: "AI-скоринг", vacancies: 1, conversion: 3.5, avgDays: 10, avgScore: 86, icon: "🤖", color: "text-cyan-600 bg-cyan-500/10" },
]

// ─── Tooltip ─────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
}

// ─── Компонент ──────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d")
  const [vacancy, setVacancy] = useState("all")
  const [manager, setManager] = useState("all")

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            {/* Header + Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Аналитика</h1>
                <p className="text-muted-foreground text-sm">Полная статистика по найму</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-[140px] h-9">
                    <Clock className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 дней</SelectItem>
                    <SelectItem value="30d">30 дней</SelectItem>
                    <SelectItem value="90d">90 дней</SelectItem>
                    <SelectItem value="year">Год</SelectItem>
                    <SelectItem value="all">Всё время</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={vacancy} onValueChange={setVacancy}>
                  <SelectTrigger className="w-[170px] h-9">
                    <Briefcase className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все вакансии</SelectItem>
                    <SelectItem value="sales">Менеджер по продажам</SelectItem>
                    <SelectItem value="dev">Frontend-разработчик</SelectItem>
                    <SelectItem value="ops">Оператор склада</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={manager} onValueChange={setManager}>
                  <SelectTrigger className="w-[160px] h-9">
                    <Users className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все HR</SelectItem>
                    <SelectItem value="anna">Анна Иванова</SelectItem>
                    <SelectItem value="dmitry">Дмитрий Козлов</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="funnel">
              <TabsList className="mb-5">
                <TabsTrigger value="funnel" className="gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  Воронка
                </TabsTrigger>
                <TabsTrigger value="sources" className="gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Источники
                </TabsTrigger>
                <TabsTrigger value="scenarios" className="gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Эффективность сценариев
                </TabsTrigger>
              </TabsList>

              {/* ═══ ТАБ 1: Воронка ══════════════════════════════ */}
              <TabsContent value="funnel" className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {kpiCards.map((stat) => (
                    <Card key={stat.title}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className={cn("p-2 rounded-lg", stat.color)}>
                            <stat.icon className="w-4 h-4" />
                          </div>
                          <Badge
                            variant="outline"
                            className="text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800"
                          >
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {stat.change}
                          </Badge>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{stat.title}</p>
                        <p className="text-[10px] text-muted-foreground/70">{stat.sub}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Funnel Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      Воронка найма
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={funnelStages} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={110} stroke="var(--muted-foreground)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" name="Кандидатов" radius={[0, 6, 6, 0]}>
                          {funnelStages.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Конверсия между шагами */}
                    <div className="mt-4 space-y-1.5">
                      {transitions.map((t) => {
                        const isWeakest = t === weakestTransition
                        return (
                          <div
                            key={t.from + t.to}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                              isWeakest ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-muted/30"
                            )}
                          >
                            <span className="text-muted-foreground w-[200px] shrink-0 text-xs">
                              {t.from} → {t.to}
                            </span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", isWeakest ? "bg-red-500" : "bg-primary")}
                                style={{ width: `${t.conversionPct}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-semibold w-12 text-right", isWeakest ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                              {t.conversionPct}%
                            </span>
                            {isWeakest && (
                              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">Здесь теряем больше всего</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-between mt-4 px-3">
                      <span className="text-xs text-muted-foreground">Общая конверсия воронки</span>
                      <Badge variant="secondary" className="text-xs font-semibold">
                        {((funnelStages[funnelStages.length - 1].count / funnelStages[0].count) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ═══ ТАБ 2: Источники ════════════════════════════ */}
              <TabsContent value="sources" className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      Сравнение источников
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Источник</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Кандидатов</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Прошли демо</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Нанято</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Конверсия</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Ср. оценка</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Стоимость найма</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceTableData.map((row) => (
                            <tr key={row.source} className={cn("border-b last:border-0 transition-colors hover:bg-muted/20", row.highlight && "bg-emerald-50/50 dark:bg-emerald-950/20")}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                                  <span className="text-sm font-medium text-foreground">{row.source}</span>
                                </div>
                              </td>
                              <td className="text-right px-4 py-3 text-sm text-foreground font-medium">{row.candidates.toLocaleString("ru-RU")}</td>
                              <td className="text-right px-4 py-3 text-sm text-foreground">{row.passedDemo}</td>
                              <td className="text-right px-4 py-3 text-sm text-foreground font-medium">{row.hired}</td>
                              <td className="text-right px-4 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  <span className={cn("text-sm font-semibold", row.highlight ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                    {row.conversion}%
                                  </span>
                                  {row.highlight && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                                </div>
                              </td>
                              <td className="text-right px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs",
                                    row.avgScore >= 80 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
                                    row.avgScore >= 70 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
                                    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                                  )}
                                >
                                  {row.avgScore}
                                </Badge>
                              </td>
                              <td className="text-right px-4 py-3 text-sm text-foreground">
                                {row.costPerHire.toLocaleString("ru-RU")} ₽
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Визуализация — бар-чарт конверсий */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Конверсия по источникам</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={sourceTableData} margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="source" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}%`, "Конверсия"]} />
                        <Bar dataKey="conversion" name="Конверсия" radius={[6, 6, 0, 0]}>
                          {sourceTableData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Инсайт */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Инсайт</p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                      Рефералы дают конверсию в <span className="font-bold">11x выше</span> hh.ru при стоимости найма <span className="font-bold">в 6 раз ниже</span>.
                      Рекомендуем увеличить реферальный бонус и запустить программу рекомендаций среди сотрудников.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* ═══ ТАБ 3: Эффективность сценариев ══════════════ */}
              <TabsContent value="scenarios" className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                      Сравнение сценариев найма
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Сценарий</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Использован</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Конверсия</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Ср. время найма</th>
                            <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Ср. оценка нанятых</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarioTableData.map((row) => {
                            const isBestConversion = row.conversion === Math.max(...scenarioTableData.map(s => s.conversion))
                            const isBestScore = row.avgScore === Math.max(...scenarioTableData.map(s => s.avgScore))
                            const isFastest = row.avgDays === Math.min(...scenarioTableData.map(s => s.avgDays))
                            return (
                              <tr key={row.scenario} className="border-b last:border-0 transition-colors hover:bg-muted/20">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0", row.color)}>
                                      {row.icon}
                                    </div>
                                    <span className="text-sm font-medium text-foreground">{row.scenario}</span>
                                  </div>
                                </td>
                                <td className="text-right px-4 py-3 text-sm text-muted-foreground">
                                  {row.vacancies} {row.vacancies === 1 ? "вакансия" : row.vacancies < 5 ? "вакансии" : "вакансий"}
                                </td>
                                <td className="text-right px-4 py-3">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className={cn("text-sm font-semibold", isBestConversion ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                      {row.conversion}%
                                    </span>
                                    {isBestConversion && (
                                      <Badge variant="outline" className="text-[10px] py-0 h-5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                                        лучший
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right px-4 py-3">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className={cn("text-sm", isFastest ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                      {row.avgDays} дн.
                                    </span>
                                    {isFastest && (
                                      <Badge variant="outline" className="text-[10px] py-0 h-5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                                        быстрый
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right px-4 py-3">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-xs",
                                      isBestScore
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                        : row.avgScore >= 75
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                          : "bg-muted text-muted-foreground border-border"
                                    )}
                                  >
                                    {row.avgScore}
                                    {isBestScore && " ⭐"}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Визуализация — конверсия сценариев */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Конверсия по сценариям</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={scenarioTableData} margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="scenario" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}%`, "Конверсия"]} />
                        <Bar dataKey="conversion" name="Конверсия" radius={[6, 6, 0, 0]} fill="#8b5cf6">
                          {scenarioTableData.map((entry, index) => {
                            const colors = ["#8b5cf6", "#3b82f6", "#06b6d4", "#f59e0b", "#22c55e"]
                            return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Сравнительные карточки */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className="text-2xl font-bold text-foreground">4.2%</p>
                      <p className="text-xs text-muted-foreground mt-1">Лучшая конверсия</p>
                      <p className="text-xs text-emerald-600 font-medium">Быстрый найм</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <p className="text-2xl font-bold text-foreground">3 дн.</p>
                      <p className="text-xs text-muted-foreground mt-1">Самый быстрый найм</p>
                      <p className="text-xs text-blue-600 font-medium">Быстрый найм</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mx-auto mb-2">
                        <Star className="w-5 h-5 text-purple-600" />
                      </div>
                      <p className="text-2xl font-bold text-foreground">86</p>
                      <p className="text-xs text-muted-foreground mt-1">Лучшая оценка нанятых</p>
                      <p className="text-xs text-purple-600 font-medium">AI-скоринг</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
