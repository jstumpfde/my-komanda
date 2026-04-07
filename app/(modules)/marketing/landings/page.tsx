"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, ExternalLink, Pencil, BarChart2 } from "lucide-react"

const landings = [
  {
    id: 1,
    name: "Главная страница продукта",
    url: "/",
    conversion: "4.8%",
    visits: "12 400",
    leads: 595,
    status: "Активен",
  },
  {
    id: 2,
    name: "Лендинг тарифа Business",
    url: "/business",
    conversion: "6.2%",
    visits: "3 200",
    leads: 198,
    status: "Активен",
  },
  {
    id: 3,
    name: "Вебинар апрель 2026",
    url: "/webinar-april",
    conversion: "12.5%",
    visits: "980",
    leads: 123,
    status: "Активен",
  },
  {
    id: 4,
    name: "HR-модуль — промо",
    url: "/hr-promo",
    conversion: "3.1%",
    visits: "5 600",
    leads: 174,
    status: "Черновик",
  },
  {
    id: 5,
    name: "Партнёрская программа",
    url: "/partners",
    conversion: "2.4%",
    visits: "1 800",
    leads: 43,
    status: "Архив",
  },
]

const statusColors: Record<string, string> = {
  "Активен": "bg-green-100 text-green-700",
  "Черновик": "bg-gray-100 text-gray-700",
  "Архив": "bg-yellow-100 text-yellow-700",
}

export default function LandingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Лендинги</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Создать лендинг
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">URL</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Конверсия</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Посещений</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Лидов</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {landings.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4 font-medium">{row.name}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{row.url}</td>
                    <td className="py-3 px-4 text-right font-semibold text-green-600">{row.conversion}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{row.visits}</td>
                    <td className="py-3 px-4 text-right font-medium">{row.leads}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Открыть
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Редактировать
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <BarChart2 className="h-3.5 w-3.5 mr-1" />
                          Статистика
                        </Button>
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
