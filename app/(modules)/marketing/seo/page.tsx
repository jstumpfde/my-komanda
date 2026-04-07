"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
    <div className="p-6 space-y-6">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">URL</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Запросы</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Позиция</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Клики</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">CTR</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-blue-600">{row.url}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{row.queries.toLocaleString("ru")}</td>
                    <td className="py-3 px-4 text-right font-semibold">{row.position}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{row.clicks}</td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">{row.ctr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card>
        <CardHeader>
          <CardTitle>Ключевые слова</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ключевое слово</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Частота</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Позиция</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-medium">{kw.word}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{kw.freq.toLocaleString("ru")}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-semibold ${kw.position <= 10 ? "text-green-600" : "text-muted-foreground"}`}>
                        {kw.position}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center">
                        <TrendIcon trend={kw.trend} />
                      </div>
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
