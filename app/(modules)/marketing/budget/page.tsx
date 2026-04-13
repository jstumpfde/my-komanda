"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Settings2, TrendingDown } from "lucide-react"

const channelBudgets = [
  { channel: "Яндекс Директ", plan: 65000, fact: 52400 },
  { channel: "Google Ads", plan: 60000, fact: 41500 },
  { channel: "ВКонтакте", plan: 55000, fact: 48200 },
  { channel: "SEO / Контент", plan: 40000, fact: 24000 },
  { channel: "Email-маркетинг", plan: 15000, fact: 8600 },
  { channel: "Прочее", plan: 15000, fact: 5300 },
]

const totalPlan = channelBudgets.reduce((s, r) => s + r.plan, 0)
const totalFact = channelBudgets.reduce((s, r) => s + r.fact, 0)

const monthlyHistory = [
  { month: "Октябрь 2025", budget: 210000, spent: 198000, leads: 241, cpl: 821 },
  { month: "Ноябрь 2025", budget: 220000, spent: 215000, leads: 268, cpl: 802 },
  { month: "Декабрь 2025", budget: 180000, spent: 168000, leads: 198, cpl: 848 },
  { month: "Январь 2026", budget: 230000, spent: 224000, leads: 257, cpl: 871 },
  { month: "Февраль 2026", budget: 240000, spent: 238000, leads: 289, cpl: 823 },
  { month: "Март 2026", budget: 250000, spent: 180000, leads: 284, cpl: 634 },
]

export default function BudgetPage() {
  const remainPct = Math.round((totalFact / totalPlan) * 100)
  const remain = totalPlan - totalFact

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Бюджет маркетинга</h1>
        <Button>
          <Settings2 className="h-4 w-4 mr-2" />
          Установить бюджет
        </Button>
      </div>

      {/* Monthly Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Текущий месяц — март 2026</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">План</p>
              <p className="text-2xl font-bold">₽{totalPlan.toLocaleString("ru")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Потрачено</p>
              <p className="text-2xl font-bold text-orange-600">₽{totalFact.toLocaleString("ru")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Остаток</p>
              <p className="text-2xl font-bold text-green-600">₽{remain.toLocaleString("ru")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Освоение бюджета</span>
              <span className="font-semibold text-foreground">{remainPct}%</span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${remainPct > 90 ? "bg-red-500" : remainPct > 70 ? "bg-orange-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min(remainPct, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Allocation */}
      <Card>
        <CardHeader>
          <CardTitle>Распределение по каналам</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Канал</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">План ₽</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Факт ₽</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">%</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 w-44">Прогресс</th>
                </tr>
              </thead>
              <tbody>
                {channelBudgets.map((row) => {
                  const pct = row.plan > 0 ? Math.round((row.fact / row.plan) * 100) : 0
                  return (
                    <tr key={row.channel} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium">{row.channel}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {row.plan.toLocaleString("ru")}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {row.fact.toLocaleString("ru")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-medium ${pct >= 90 ? "text-orange-600" : "text-foreground"}`}>
                          {pct}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 90 ? "bg-orange-500" : "bg-blue-500"}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly History */}
      <Card>
        <CardHeader>
          <CardTitle>История по месяцам</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Месяц</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Бюджет ₽</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Потрачено ₽</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Лиды</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">CPL ₽</th>
                </tr>
              </thead>
              <tbody>
                {monthlyHistory.map((row, i) => (
                  <tr
                    key={row.month}
                    className={`border-b last:border-0 hover:bg-muted/30 ${i === monthlyHistory.length - 1 ? "bg-blue-50/40 font-semibold" : ""}`}
                  >
                    <td className="py-3 px-4">{row.month}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{row.budget.toLocaleString("ru")}</td>
                    <td className="py-3 px-4 text-right">{row.spent.toLocaleString("ru")}</td>
                    <td className="py-3 px-4 text-right">{row.leads}</td>
                    <td className="py-3 px-4 text-right text-green-600">₽{row.cpl}</td>
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
