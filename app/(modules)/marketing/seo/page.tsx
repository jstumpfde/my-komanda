"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { TrendingUp, TrendingDown, Minus, Search, Link, Globe, Hash } from "lucide-react"

const kpiCards = [
  { title: "В топ-10", value: "47", icon: TrendingUp, color: "text-green-500", bg: "bg-green-50" },
  { title: "Органика", value: "8.4K/мес", icon: Globe, color: "text-blue-500", bg: "bg-blue-50" },
  { title: "Ключевых слов", value: "312", icon: Hash, color: "text-purple-500", bg: "bg-purple-50" },
  { title: "Обратных ссылок", value: "156", icon: Link, color: "text-orange-500", bg: "bg-orange-50" },
]

const topPages = [
  { url: "/", queries: 1240, position: 3.2, clicks: 890, ctr: "71.8%" },
  { url: "/hr-promo", queries: 640, position: 5.8, clicks: 312, ctr: "48.8%" },
  { url: "/blog/onboarding", queries: 420, position: 4.1, clicks: 245, ctr: "58.3%" },
  { url: "/tariffs", queries: 310, position: 7.4, clicks: 134, ctr: "43.2%" },
  { url: "/partners", queries: 180, position: 9.2, clicks: 67, ctr: "37.2%" },
]

const keywords = [
  { word: "HR платформа для бизнеса", freq: 3200, position: 4, trend: "up" },
  { word: "система найма сотрудников", freq: 2800, position: 6, trend: "up" },
  { word: "автоматизация HR", freq: 2100, position: 3, trend: "stable" },
  { word: "онбординг сотрудников", freq: 1800, position: 8, trend: "up" },
  { word: "ATS система", freq: 1500, position: 5, trend: "down" },
  { word: "управление персоналом CRM", freq: 1200, position: 11, trend: "stable" },
  { word: "рекрутинг платформа", freq: 980, position: 7, trend: "up" },
  { word: "воронка найма", freq: 760, position: 9, trend: "down" },
]

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-500" />
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-gray-400" />
}

export default function SeoPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SEO-мониторинг</h1>
        <Button>
          <Search className="h-4 w-4 mr-2" />
          Провести аудит
        </Button>
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

      {/* Top Pages */}
      <Card>
        <CardHeader>
          <CardTitle>Топ страниц</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable>
            <DataHead>
              <DataHeadCell>URL</DataHeadCell>
              <DataHeadCell align="right">Запросы</DataHeadCell>
              <DataHeadCell align="right">Позиция</DataHeadCell>
              <DataHeadCell align="right">Клики</DataHeadCell>
              <DataHeadCell align="right">CTR</DataHeadCell>
            </DataHead>
            <tbody>
              {topPages.map((row, i) => (
                <DataRow key={i}>
                  <DataCell className="font-mono text-xs text-blue-600">{row.url}</DataCell>
                  <DataCell align="right" className="text-muted-foreground">{row.queries.toLocaleString("ru")}</DataCell>
                  <DataCell align="right" className="font-semibold">{row.position}</DataCell>
                  <DataCell align="right" className="text-muted-foreground">{row.clicks}</DataCell>
                  <DataCell align="right" className="font-medium text-green-600">{row.ctr}</DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card>
        <CardHeader>
          <CardTitle>Ключевые слова</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable>
            <DataHead>
              <DataHeadCell>Ключевое слово</DataHeadCell>
              <DataHeadCell align="right">Частота</DataHeadCell>
              <DataHeadCell align="right">Позиция</DataHeadCell>
              <DataHeadCell align="center">Тренд</DataHeadCell>
            </DataHead>
            <tbody>
              {keywords.map((kw, i) => (
                <DataRow key={i}>
                  <DataCell className="font-medium">{kw.word}</DataCell>
                  <DataCell align="right" className="text-muted-foreground">{kw.freq.toLocaleString("ru")}</DataCell>
                  <DataCell align="right">
                    <span className={`font-semibold ${kw.position <= 10 ? "text-green-600" : "text-muted-foreground"}`}>
                      {kw.position}
                    </span>
                  </DataCell>
                  <DataCell>
                    <div className="flex justify-center">
                      <TrendIcon trend={kw.trend} />
                    </div>
                  </DataCell>
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
