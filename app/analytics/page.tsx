"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts"

const funnelData = [
  { stage: "Новые", count: 156, color: "#22d3ee" },
  { stage: "Квалификация", count: 89, color: "#f59e0b" },
  { stage: "Тестирование", count: 52, color: "#3b82f6" },
  { stage: "Интервью", count: 28, color: "#8b5cf6" },
  { stage: "Предложение", count: 12, color: "#22c55e" },
  { stage: "Наняты", count: 8, color: "#10b981" },
]

const sourceData = [
  { name: "hh.ru", value: 45, color: "#3b82f6" },
  { name: "Avito", value: 22, color: "#06b6d4" },
  { name: "LinkedIn", value: 18, color: "#8b5cf6" },
  { name: "Telegram", value: 12, color: "#6366f1" },
  { name: "Рефералы", value: 3, color: "#10b981" },
]

const weeklyData = [
  { week: "Нед 1", new: 18, qualified: 8, hired: 1 },
  { week: "Нед 2", new: 24, qualified: 12, hired: 2 },
  { week: "Нед 3", new: 31, qualified: 15, hired: 1 },
  { week: "Нед 4", new: 22, qualified: 10, hired: 3 },
  { week: "Нед 5", new: 28, qualified: 18, hired: 2 },
  { week: "Нед 6", new: 35, qualified: 22, hired: 4 },
  { week: "Нед 7", new: 29, qualified: 16, hired: 3 },
  { week: "Нед 8", new: 33, qualified: 20, hired: 2 },
]

const timeToHireData = [
  { month: "Окт", days: 32 },
  { month: "Ноя", days: 28 },
  { month: "Дек", days: 35 },
  { month: "Янв", days: 26 },
  { month: "Фев", days: 22 },
  { month: "Мар", days: 24 },
]

const scoreDistribution = [
  { range: "90-100", count: 12 },
  { range: "80-89", count: 28 },
  { range: "70-79", count: 35 },
  { range: "60-69", count: 22 },
  { range: "50-59", count: 8 },
  { range: "<50", count: 3 },
]

const stats = [
  {
    title: "Всего кандидатов",
    value: "156",
    change: "+12%",
    trend: "up" as const,
    icon: Users,
    color: "text-blue-600 bg-blue-500/10",
  },
  {
    title: "Наняты (месяц)",
    value: "8",
    change: "+33%",
    trend: "up" as const,
    icon: UserCheck,
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    title: "Отказы",
    value: "24",
    change: "-8%",
    trend: "down" as const,
    icon: UserX,
    color: "text-red-600 bg-red-500/10",
  },
  {
    title: "Среднее время найма",
    value: "24 дн.",
    change: "-15%",
    trend: "down" as const,
    icon: Clock,
    color: "text-amber-600 bg-amber-500/10",
  },
]

export default function AnalyticsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-6">
            {/* Page Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Аналитика</h1>
              <p className="text-muted-foreground text-sm">
                Статистика найма за последние 30 дней
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {stats.map((stat) => (
                <Card key={stat.title}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-lg ${stat.color}`}>
                        <stat.icon className="w-4 h-4" />
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          stat.trend === "up" && stat.title !== "Отказы"
                            ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800"
                            : stat.trend === "down" && stat.title === "Отказы"
                              ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800"
                              : stat.trend === "down" && stat.title !== "Отказы"
                                ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800"
                                : "text-red-600 border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800"
                        }
                      >
                        {stat.trend === "up" ? (
                          <TrendingUp className="w-3 h-3 mr-1" />
                        ) : (
                          <TrendingDown className="w-3 h-3 mr-1" />
                        )}
                        {stat.change}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.title}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Funnel Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    Воронка найма
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis
                        type="category"
                        dataKey="stage"
                        tick={{ fontSize: 11 }}
                        width={100}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {funnelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between mt-2 px-2">
                    <span className="text-xs text-muted-foreground">Конверсия воронки</span>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round((funnelData[funnelData.length - 1].count / funnelData[0].count) * 100)}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Sources Pie */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    Источники кандидатов
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={280}>
                      <PieChart>
                        <Pie
                          data={sourceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          dataKey="value"
                          strokeWidth={2}
                          stroke="var(--background)"
                        >
                          {sourceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-3">
                      {sourceData.map((source) => (
                        <div key={source.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: source.color }}
                            />
                            <span className="text-sm text-foreground">{source.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{source.value}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Weekly Trends */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    Динамика по неделям
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={weeklyData}>
                      <defs>
                        <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorQualified" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorHired" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Area type="monotone" dataKey="new" name="Новые" stroke="#3b82f6" fill="url(#colorNew)" strokeWidth={2} />
                      <Area type="monotone" dataKey="qualified" name="Квалифицированы" stroke="#f59e0b" fill="url(#colorQualified)" strokeWidth={2} />
                      <Area type="monotone" dataKey="hired" name="Наняты" stroke="#22c55e" fill="url(#colorHired)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-[11px] text-muted-foreground">Новые</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-[11px] text-muted-foreground">Квалифицированы</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-[11px] text-muted-foreground">Наняты</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Time to Hire + Score Distribution */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      Время до найма (дни)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={timeToHireData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" domain={[15, 40]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="days"
                          name="Дни"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          dot={{ fill: "#8b5cf6", r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      Распределение AI-скоров
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar dataKey="count" name="Кандидатов" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
