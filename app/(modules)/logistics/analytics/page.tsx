"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, Target, AlertTriangle } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"

const KPI_CARDS = [
  { label: "Оборот склада", value: "4.2 раз/мес", icon: TrendingUp, sub: "Товар обновляется в среднем 4.2 раза в месяц", color: "text-blue-500" },
  { label: "ABC-анализ", value: "A: 30% · B: 50% · C: 20%", icon: Target, sub: "Товары класса A дают 80% выручки", color: "text-violet-500" },
  { label: "Точность комплектации", value: "98.4%", icon: BarChart3, sub: "2 ошибки на 124 комплектации", color: "text-emerald-500" },
]

const ABC_DATA: { class: "A" | "B" | "C"; color: string; items: { name: string; turnover: string; share: string }[] }[] = [
  {
    class: "A", color: "bg-emerald-500",
    items: [
      { name: "Крепёж М8×40 (уп.)",      turnover: "8.2 раз/мес", share: "18%" },
      { name: "Болт А2-70 М10×60",         turnover: "7.5 раз/мес", share: "14%" },
      { name: "Кабель ВВГ 3×2.5",          turnover: "6.8 раз/мес", share: "12%" },
    ],
  },
  {
    class: "B", color: "bg-amber-400",
    items: [
      { name: "Труба PP 32 мм",            turnover: "3.4 раз/мес", share: "9%"  },
      { name: "Коробка картонная 60×40",    turnover: "2.9 раз/мес", share: "7%"  },
      { name: "Перчатки нитриловые уп.",    turnover: "2.6 раз/мес", share: "6%"  },
    ],
  },
  {
    class: "C", color: "bg-rose-400",
    items: [
      { name: "Полка стальная 600×400",     turnover: "0.8 раз/мес", share: "3%"  },
      { name: "Тарпаулин 5×8 м",            turnover: "0.7 раз/мес", share: "2%"  },
      { name: "Фильтр воздушный универс.",  turnover: "0.5 раз/мес", share: "1%"  },
    ],
  },
]

const MOVEMENT_DATA = [
  { week: "03–09 мар", приход: 340, расход: 290 },
  { week: "10–16 мар", приход: 280, расход: 320 },
  { week: "17–23 мар", приход: 420, расход: 360 },
  { week: "24–30 мар", приход: 390, расход: 410 },
]

const DEAD_STOCK = [
  { sku: "SHL-0088", name: "Полка стальная 600×400",         qty: 3,   days: 62, value: "9 600 ₽"   },
  { sku: "LMP-5501", name: "Светодиодная лампа E27 20W",     qty: 0,   days: 45, value: "0 ₽"       },
  { sku: "FLT-0033", name: "Фильтр воздушный универс.",      qty: 14,  days: 38, value: "29 400 ₽"  },
  { sku: "PNT-2201", name: "Краска грунтовочная 10 л",       qty: 5,   days: 35, value: "9 000 ₽"   },
  { sku: "TRP-0008", name: "Тарпаулин 5×8 м",               qty: 18,  days: 32, value: "43 200 ₽"  },
]

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
}

const ABC_CLASS_COLORS: Record<"A" | "B" | "C", string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-rose-100 text-rose-700",
}

export default function LogisticsAnalyticsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Аналитика склада</h1>
                <p className="text-sm text-muted-foreground">Оборачиваемость, ABC-анализ, движение товаров</p>
              </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {KPI_CARDS.map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 ${kpi.color}`}>
                        <kpi.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        <p className="text-lg font-bold mt-0.5">{kpi.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ABC Analysis */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ABC-анализ товаров</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ABC_DATA.map(group => (
                  <div key={group.class}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ABC_CLASS_COLORS[group.class]}`}>
                        Класс {group.class}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.class === "A" ? "Высокий оборот — 80% выручки" : group.class === "B" ? "Средний оборот — 15% выручки" : "Низкий оборот — 5% выручки"}
                      </span>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {group.items.map((item, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 text-sm">{item.name}</td>
                            <td className="py-2 text-sm text-right text-muted-foreground">{item.turnover}</td>
                            <td className="py-2 text-sm text-right font-semibold w-16">{item.share}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Movement chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Движение товаров — последние 4 недели</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={MOVEMENT_DATA} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="приход" name="Приход" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="расход" name="Расход" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Dead stock */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Неликвидные товары (без движения &gt; 30 дней)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2">Артикул</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2">Наименование</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2">Остаток</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2">Дней без движения</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2">Стоимость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEAD_STOCK.map(item => (
                      <tr key={item.sku} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{item.sku}</td>
                        <td className="px-3 py-2.5 text-sm">{item.name}</td>
                        <td className="text-right px-3 py-2.5 text-sm">{item.qty}</td>
                        <td className="text-right px-3 py-2.5">
                          <Badge variant={item.days > 50 ? "destructive" : "secondary"} className="text-xs">{item.days} дн.</Badge>
                        </td>
                        <td className="text-right px-4 py-2.5 text-sm font-medium">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
