"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Mail, Eye, MousePointerClick, UserMinus } from "lucide-react"

const kpiCards = [
  { title: "Подписчиков", value: "4 821", icon: Mail, color: "text-blue-500", bg: "bg-blue-50" },
  { title: "Открываемость", value: "24.3%", icon: Eye, color: "text-green-500", bg: "bg-green-50" },
  { title: "Отписок", value: "0.8%", icon: UserMinus, color: "text-red-400", bg: "bg-red-50" },
]

const campaigns = [
  {
    id: 1,
    subject: "Апрельский дайджест: что нового в my-komanda",
    sent: 4821,
    opened: 1171,
    clicks: 328,
    date: "3 апр 2026",
    status: "Запланировано",
  },
  {
    id: 2,
    subject: "Обновление тарифов и новые возможности",
    sent: 4712,
    opened: 1346,
    clicks: 489,
    date: "1 мар 2026",
    status: "Отправлено",
  },
  {
    id: 3,
    subject: "Приглашение на вебинар: HR в 2026 году",
    sent: 4598,
    opened: 1058,
    clicks: 412,
    date: "10 фев 2026",
    status: "Отправлено",
  },
  {
    id: 4,
    subject: "Новогодний дайджест + итоги 2025",
    sent: 4340,
    opened: 1258,
    clicks: 367,
    date: "30 дек 2025",
    status: "Отправлено",
  },
]

const statusColors: Record<string, string> = {
  "Отправлено": "bg-green-100 text-green-700",
  "Запланировано": "bg-blue-100 text-blue-700",
  "Черновик": "bg-gray-100 text-gray-700",
}

export default function EmailPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email-рассылки</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Новая рассылка
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`p-3 rounded-xl ${card.bg}`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-xl font-bold">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Кампании</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Тема</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Отправлено</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Открыто</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">OR %</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кликов</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => {
                  const or = row.sent > 0 ? ((row.opened / row.sent) * 100).toFixed(1) : "—"
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium max-w-xs">
                        <p className="truncate">{row.subject}</p>
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{row.sent.toLocaleString("ru")}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{row.opened.toLocaleString("ru")}</td>
                      <td className="py-3 px-4 text-right font-semibold text-green-600">{or}%</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{row.clicks}</td>
                      <td className="py-3 px-4 text-muted-foreground">{row.date}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[row.status]}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
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
