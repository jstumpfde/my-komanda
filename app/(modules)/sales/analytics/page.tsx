"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BarChart3, TrendingUp, Target, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const DATE_RANGES = ["Эта неделя", "Этот месяц", "Квартал", "Год"]

const REVENUE_DATA: Record<string, { month: string; amount: number }[]> = {
  "Год": [
    { month: "Апр", amount: 3_200_000 },
    { month: "Май", amount: 4_100_000 },
    { month: "Июн", amount: 3_800_000 },
    { month: "Июл", amount: 2_900_000 },
    { month: "Авг", amount: 4_500_000 },
    { month: "Сен", amount: 5_200_000 },
    { month: "Окт", amount: 4_800_000 },
    { month: "Ноя", amount: 6_100_000 },
    { month: "Дек", amount: 5_700_000 },
    { month: "Янв", amount: 4_300_000 },
    { month: "Фев", amount: 5_900_000 },
    { month: "Мар", amount: 6_800_000 },
  ],
  "Квартал": [
    { month: "Янв", amount: 4_300_000 },
    { month: "Фев", amount: 5_900_000 },
    { month: "Мар", amount: 6_800_000 },
  ],
  "Этот месяц": [
    { month: "Нед 1", amount: 1_200_000 },
    { month: "Нед 2", amount: 1_800_000 },
    { month: "Нед 3", amount: 2_100_000 },
    { month: "Нед 4", amount: 1_700_000 },
  ],
  "Эта неделя": [
    { month: "Пн", amount: 450_000 },
    { month: "Вт", amount: 320_000 },
    { month: "Ср", amount: 780_000 },
    { month: "Чт", amount: 290_000 },
    { month: "Пт", amount: 560_000 },
  ],
}

const WIN_LOSS = [
  { label: "Выиграно", pct: 62, color: "bg-emerald-500", textColor: "text-emerald-600" },
  { label: "Проиграно", pct: 28, color: "bg-red-400", textColor: "text-red-600" },
  { label: "В работе", pct: 10, color: "bg-blue-400", textColor: "text-blue-600" },
]

const MANAGER_PERFORMANCE = [
  { name: "Алексей Иванов", initials: "АИ", deals: 14, amount: 6_200_000, conversion: 31, avgCycle: 28 },
  { name: "Мария Петрова", initials: "МП", deals: 11, amount: 5_100_000, conversion: 28, avgCycle: 32 },
  { name: "Дмитрий Козлов", initials: "ДК", deals: 9, amount: 4_300_000, conversion: 22, avgCycle: 38 },
  { name: "Сергей Новиков", initials: "СН", deals: 7, amount: 2_900_000, conversion: 19, avgCycle: 41 },
]

const SOURCES_ANALYSIS = [
  { source: "Сайт",    leads: 89,  conversion: 20.2, cpl: 2_800,  roi: 340 },
  { source: "Звонок", leads: 54,  conversion: 25.9, cpl: 1_200,  roi: 580 },
  { source: "Реклама",leads: 67,  conversion: 13.4, cpl: 4_500,  roi: 180 },
  { source: "Реферал",leads: 21,  conversion: 28.6, cpl: 0,      roi: 9999 },
  { source: "Партнёр",leads: 17,  conversion: 11.8, cpl: 6_000,  roi: 120 },
]

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${n} ₽`
}

export default function SalesAnalyticsPage() {
  const [activeRange, setActiveRange] = useState("Год")

  const revenueData = REVENUE_DATA[activeRange] || []
  const maxAmount = Math.max(...revenueData.map(d => d.amount), 1)
  const totalRevenue = revenueData.reduce((s, d) => s + d.amount, 0)
  const totalManagerRevenue = MANAGER_PERFORMANCE.reduce((s, m) => s + m.amount, 0)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Аналитика продаж</h1>
                <p className="text-sm text-muted-foreground">Выручка, конверсия и эффективность команды</p>
              </div>
            </div>

            {/* Date Range Tabs */}
            <div className="flex border rounded-lg overflow-hidden w-fit mb-6">
              {DATE_RANGES.map(range => (
                <button
                  key={range}
                  className={cn(
                    "px-4 py-2 text-sm transition-colors",
                    activeRange === range
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/50 text-muted-foreground"
                  )}
                  onClick={() => setActiveRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Revenue Chart */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Выручка · {formatMoney(totalRevenue)}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-40">
                  {revenueData.map((d) => {
                    const h = Math.round((d.amount / maxAmount) * 128)
                    const isMax = d.amount === maxAmount
                    return (
                      <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-muted-foreground font-medium">
                          {d.amount >= 1_000_000 ? `${(d.amount / 1_000_000).toFixed(1)}М` : `${Math.round(d.amount / 1_000)}К`}
                        </span>
                        <div className="w-full flex flex-col items-stretch" style={{ height: 128 }}>
                          <div className="flex-1" />
                          <div
                            className={cn("w-full rounded-t-sm transition-all", isMax ? "bg-primary" : "bg-primary/40")}
                            style={{ height: h }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">{d.month}</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Win/Loss */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Win/Loss
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {WIN_LOSS.map((item) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className={cn("text-sm font-bold", item.textColor)}>{item.pct}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", item.color)}
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Donut-like visual */}
                  <div className="mt-4 flex justify-center">
                    <div className="flex gap-1 h-8 w-full rounded-lg overflow-hidden">
                      {WIN_LOSS.map(item => (
                        <div
                          key={item.label}
                          className={cn("h-full flex items-center justify-center", item.color)}
                          style={{ width: `${item.pct}%` }}
                        >
                          {item.pct > 15 && <span className="text-[10px] font-bold text-white">{item.pct}%</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Manager Performance */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Менеджеры
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Менеджер</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сделок</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сумма</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Конверсия</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ср. цикл</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MANAGER_PERFORMANCE.map((mgr) => {
                          const sharePct = Math.round((mgr.amount / totalManagerRevenue) * 100)
                          return (
                            <tr key={mgr.name} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="w-7 h-7">
                                    <AvatarFallback className="text-xs bg-primary/10 text-primary">{mgr.initials}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{mgr.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{sharePct}% от общей выручки</p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right px-4 py-3 text-sm text-foreground">{mgr.deals}</td>
                              <td className="text-right px-4 py-3 text-sm font-medium text-foreground">{formatMoney(mgr.amount)}</td>
                              <td className="text-right px-4 py-3">
                                <Badge
                                  variant={mgr.conversion >= 28 ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {mgr.conversion}%
                                </Badge>
                              </td>
                              <td className="text-right px-4 py-3 text-sm text-muted-foreground">{mgr.avgCycle} дн</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sources Analysis */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Анализ источников лидов</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Лидов</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Конверсия</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">CPL</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SOURCES_ANALYSIS.map((row) => (
                        <tr key={row.source} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{row.source}</td>
                          <td className="text-right px-4 py-3 text-sm text-foreground">{row.leads}</td>
                          <td className="text-right px-4 py-3">
                            <Badge
                              variant={row.conversion >= 20 ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {row.conversion}%
                            </Badge>
                          </td>
                          <td className="text-right px-4 py-3 text-sm text-foreground">
                            {row.cpl === 0 ? "—" : `${row.cpl.toLocaleString("ru-RU")} ₽`}
                          </td>
                          <td className="text-right px-4 py-3">
                            <span className={cn(
                              "text-sm font-semibold",
                              row.roi >= 300 ? "text-emerald-600" : row.roi >= 150 ? "text-amber-600" : "text-foreground"
                            )}>
                              {row.roi === 9999 ? "∞" : `${row.roi}%`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
