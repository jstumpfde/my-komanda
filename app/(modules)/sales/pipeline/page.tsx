"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingDown, ArrowDown, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

const FUNNEL_STAGES = [
  { label: "Лиды", count: 248, amount: 0, color: "bg-slate-500", width: 100 },
  { label: "Квалифицированные", count: 169, amount: 0, color: "bg-blue-500", width: 82, conversion: 68 },
  { label: "КП отправлено", count: 76, amount: 34_200_000, color: "bg-amber-500", width: 62, conversion: 45 },
  { label: "Переговоры", count: 55, amount: 24_800_000, color: "bg-purple-500", width: 44, conversion: 72 },
  { label: "Сделки", count: 49, amount: 18_450_000, color: "bg-emerald-500", width: 28, conversion: 89 },
]

const SOURCE_BREAKDOWN = [
  { source: "Сайт",    leads: 89,  qualified: 62, deals: 18, conversion: 20.2, avgAmount: 340_000 },
  { source: "Звонок", leads: 54,  qualified: 41, deals: 14, conversion: 25.9, avgAmount: 520_000 },
  { source: "Реклама",leads: 67,  qualified: 38, deals: 9,  conversion: 13.4, avgAmount: 290_000 },
  { source: "Реферал",leads: 21,  qualified: 19, deals: 6,  conversion: 28.6, avgAmount: 780_000 },
  { source: "Партнёр",leads: 17,  qualified: 9,  deals: 2,  conversion: 11.8, avgAmount: 1_200_000 },
]

const MONTHLY_TRENDS = [
  { month: "Окт", won: 5, lost: 3 },
  { month: "Ноя", won: 7, lost: 4 },
  { month: "Дек", won: 4, lost: 5 },
  { month: "Янв", won: 9, lost: 3 },
  { month: "Фев", won: 11, lost: 4 },
  { month: "Мар", won: 8, lost: 2 },
]

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${n} ₽`
}

export default function SalesPipelinePage() {
  const maxBar = Math.max(...MONTHLY_TRENDS.map(m => m.won + m.lost))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Воронка продаж</h1>
                <p className="text-sm text-muted-foreground">Конверсия по этапам и анализ источников</p>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl border bg-card">
                <p className="text-xs text-muted-foreground mb-1">Средний цикл сделки</p>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-2xl font-bold">34 дня</p>
                </div>
              </div>
              <div className="p-4 rounded-xl border bg-card">
                <p className="text-xs text-muted-foreground mb-1">Общая конверсия</p>
                <p className="text-2xl font-bold text-emerald-600">19.8%</p>
              </div>
              <div className="p-4 rounded-xl border bg-card">
                <p className="text-xs text-muted-foreground mb-1">Ср. сумма сделки</p>
                <p className="text-2xl font-bold">420К ₽</p>
              </div>
            </div>

            {/* Visual Funnel */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  Воронка конверсии
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {FUNNEL_STAGES.map((stage, i) => (
                    <div key={stage.label}>
                      <div className="flex items-center gap-3">
                        <div className="w-36 text-right">
                          <p className="text-sm font-medium text-foreground">{stage.label}</p>
                          <p className="text-xs text-muted-foreground">{stage.count} сделок</p>
                        </div>
                        <div className="flex-1 flex justify-center">
                          <div
                            className={cn("h-12 rounded-lg flex items-center justify-center transition-all", stage.color)}
                            style={{ width: `${stage.width}%` }}
                          >
                            <span className="text-sm font-bold text-white drop-shadow-sm">
                              {stage.amount > 0 ? formatMoney(stage.amount) : stage.count}
                            </span>
                          </div>
                        </div>
                        <div className="w-16 text-left">
                          {stage.amount > 0 && <p className="text-xs text-muted-foreground">{formatMoney(stage.amount)}</p>}
                        </div>
                      </div>
                      {i < FUNNEL_STAGES.length - 1 && stage.conversion !== undefined && (
                        <div className="flex items-center justify-center gap-1 py-0.5">
                          <ArrowDown className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">{FUNNEL_STAGES[i + 1].conversion}%</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Source Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Анализ источников</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Лидов</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сделок</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Конверсия</th>
                          <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ср. сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SOURCE_BREAKDOWN.map((row) => (
                          <tr key={row.source} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{row.source}</td>
                            <td className="text-right px-4 py-3 text-sm text-foreground">{row.leads}</td>
                            <td className="text-right px-4 py-3 text-sm text-foreground">{row.deals}</td>
                            <td className="text-right px-4 py-3">
                              <Badge
                                variant={row.conversion >= 20 ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {row.conversion}%
                              </Badge>
                            </td>
                            <td className="text-right px-4 py-3 text-sm text-foreground">{formatMoney(row.avgAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Trend */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Тренд по месяцам</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-40">
                    {MONTHLY_TRENDS.map((m) => {
                      const total = m.won + m.lost
                      const wonH = Math.round((m.won / maxBar) * 128)
                      const lostH = Math.round((m.lost / maxBar) * 128)
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="w-full flex flex-col items-stretch gap-0.5" style={{ height: 128 }}>
                            <div className="flex-1" />
                            <div
                              className="w-full rounded-t bg-emerald-500"
                              style={{ height: wonH }}
                              title={`Выиграно: ${m.won}`}
                            />
                            <div
                              className="w-full rounded-b bg-red-400"
                              style={{ height: lostH }}
                              title={`Проиграно: ${m.lost}`}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{m.month}</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                      <span className="text-xs text-muted-foreground">Выиграно</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-red-400" />
                      <span className="text-xs text-muted-foreground">Проиграно</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
