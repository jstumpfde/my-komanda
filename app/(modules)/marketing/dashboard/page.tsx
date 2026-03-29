"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, Users, MousePointerClick, Wallet, Plus, Rocket } from "lucide-react"

const kpiCards = [
  { title: "Охват", value: "156K", icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-50" },
  { title: "Лиды за месяц", value: "284", icon: Users, color: "text-green-500", bg: "bg-green-50" },
  { title: "Конверсия сайта", value: "3.2%", icon: MousePointerClick, color: "text-purple-500", bg: "bg-purple-50" },
  { title: "Бюджет", value: "₽180K / ₽250K", icon: Wallet, color: "text-orange-500", bg: "bg-orange-50" },
]

const leadSources = [
  { name: "SEO", value: 89, color: "bg-blue-500" },
  { name: "Соцсети", value: 67, color: "bg-pink-500" },
  { name: "Контекст", value: 54, color: "bg-yellow-500" },
  { name: "Email", value: 43, color: "bg-green-500" },
  { name: "Реферал", value: 31, color: "bg-purple-500" },
]

const maxLeads = 89

const contentPlan = [
  { channel: "ВКонтакте", topic: "Кейс: как мы помогли клиенту вырасти в 2 раза", date: "30 мар", status: "Запланировано" },
  { channel: "Telegram", topic: "5 ошибок при найме сотрудников", date: "31 мар", status: "Черновик" },
  { channel: "Сайт", topic: "Обновление тарифов 2026", date: "1 апр", status: "Запланировано" },
  { channel: "Instagram", topic: "Команда за кулисами — апрель", date: "2 апр", status: "Черновик" },
  { channel: "Email", topic: "Апрельский дайджест: новости платформы", date: "3 апр", status: "Запланировано" },
]

const statusColors: Record<string, string> = {
  "Запланировано": "bg-blue-100 text-blue-700",
  "Черновик": "bg-gray-100 text-gray-700",
  "Опубликовано": "bg-green-100 text-green-700",
}

export default function MarketingDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Маркетинг — Дашборд</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Создать контент
          </Button>
          <Button>
            <Rocket className="h-4 w-4 mr-2" />
            Запустить кампанию
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Lead Sources Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Лиды по источникам</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {leadSources.map((source) => (
            <div key={source.name} className="flex items-center gap-3">
              <span className="w-20 text-sm text-muted-foreground shrink-0">{source.name}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                <div
                  className={`h-full ${source.color} rounded-full flex items-center justify-end pr-2`}
                  style={{ width: `${(source.value / maxLeads) * 100}%` }}
                >
                  <span className="text-xs font-medium text-white">{source.value}</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Content Plan Table */}
      <Card>
        <CardHeader>
          <CardTitle>Контент-план — ближайшие публикации</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Канал</th>
                  <th className="text-left py-2 pr-4 font-medium">Тема</th>
                  <th className="text-left py-2 pr-4 font-medium">Дата</th>
                  <th className="text-left py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {contentPlan.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-3 pr-4 font-medium">{row.channel}</td>
                    <td className="py-3 pr-4 text-muted-foreground max-w-xs truncate">{row.topic}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.date}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[row.status]}`}>
                        {row.status}
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
  )
}
