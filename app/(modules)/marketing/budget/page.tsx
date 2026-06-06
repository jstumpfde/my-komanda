"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {Settings2} from "lucide-react"

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
          <DataTable>
            <DataHead>
              <DataHeadCell>Канал</DataHeadCell>
              <DataHeadCell align="right">План ₽</DataHeadCell>
              <DataHeadCell align="right">Факт ₽</DataHeadCell>
              <DataHeadCell align="right">%</DataHeadCell>
              <DataHeadCell width="11rem">Прогресс</DataHeadCell>
            </DataHead>
            <tbody>
              {channelBudgets.map((row) => {
                const pct = row.plan > 0 ? Math.round((row.fact / row.plan) * 100) : 0
                return (
                  <DataRow key={row.channel}>
                    <DataCell className="font-medium">{row.channel}</DataCell>
                    <DataCell align="right" className="text-muted-foreground">
                      {row.plan.toLocaleString("ru")}
                    </DataCell>
                    <DataCell align="right" className="font-semibold">
                      {row.fact.toLocaleString("ru")}
                    </DataCell>
                    <DataCell align="right">
                      <span className={`font-medium ${pct >= 90 ? "text-orange-600" : "text-foreground"}`}>
                        {pct}%
                      </span>
                    </DataCell>
                    <DataCell>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-orange-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </DataCell>
                  </DataRow>
                )
              })}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Monthly History */}
      <Card>
        <CardHeader>
          <CardTitle>История по месяцам</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable>
            <DataHead>
              <DataHeadCell>Месяц</DataHeadCell>
              <DataHeadCell align="right">Бюджет ₽</DataHeadCell>
              <DataHeadCell align="right">Потрачено ₽</DataHeadCell>
              <DataHeadCell align="right">Лиды</DataHeadCell>
              <DataHeadCell align="right">CPL ₽</DataHeadCell>
            </DataHead>
            <tbody>
              {monthlyHistory.map((row, i) => (
                <DataRow
                  key={row.month}
                  className={i === monthlyHistory.length - 1 ? "bg-blue-50/40 font-semibold" : ""}
                >
                  <DataCell>{row.month}</DataCell>
                  <DataCell align="right" className="text-muted-foreground">{row.budget.toLocaleString("ru")}</DataCell>
                  <DataCell align="right">{row.spent.toLocaleString("ru")}</DataCell>
                  <DataCell align="right">{row.leads}</DataCell>
                  <DataCell align="right" className="text-green-600">₽{row.cpl}</DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
