"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Package, ShoppingCart, Truck, DollarSign,
  AlertTriangle, Plus, ClipboardList, ArrowUpRight, ArrowDownRight,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { toast } from "sonner"

const KPI_CARDS = [
  { label: "Товаров на складе", value: "1 248", icon: Package, change: "+34 за неделю", up: true, color: "text-blue-500" },
  { label: "Заказов сегодня", value: "17", icon: ShoppingCart, change: "+3 к вчера", up: true, color: "text-violet-500" },
  { label: "Отгрузок ожидается", value: "8", icon: Truck, change: "до 18:00", up: null, color: "text-amber-500" },
  { label: "Стоимость остатков", value: "4 820 500 ₽", icon: DollarSign, change: "-2% за месяц", up: false, color: "text-emerald-500" },
]

const LOW_STOCK = [
  { sku: "TRK-0041", name: "Крепёж М8×40 (уп. 100 шт.)", qty: 12, min: 50, unit: "уп.", status: "critical" },
  { sku: "BLT-1120", name: "Болт А2-70 М10×60", qty: 28, min: 100, unit: "шт.", status: "warning" },
  { sku: "SHL-0088", name: "Полка стальная 600×400", qty: 3, min: 10, unit: "шт.", status: "critical" },
  { sku: "PNT-2201", name: "Краска грунтовочная 10 л", qty: 5, min: 20, unit: "ведро", status: "warning" },
  { sku: "CBL-0033", name: "Кабель ВВГ 3×2.5 (100 м)", qty: 7, min: 15, unit: "бухта", status: "warning" },
]

const RECENT_ORDERS = [
  { id: "ЗАК-2301", client: "ООО «Стройторг»", items: 4, total: "128 400 ₽", status: "new", date: "29.03.2026" },
  { id: "ЗАК-2300", client: "ИП Казаков В.В.", items: 1, total: "18 000 ₽", status: "processing", date: "29.03.2026" },
  { id: "ЗАК-2299", client: "АО «ТехноМаш»", items: 7, total: "340 200 ₽", status: "shipped", date: "28.03.2026" },
  { id: "ЗАК-2298", client: "ООО «РемСервис»", items: 2, total: "54 600 ₽", status: "done", date: "28.03.2026" },
  { id: "ЗАК-2297", client: "ИП Иванова М.А.", items: 3, total: "72 000 ₽", status: "done", date: "27.03.2026" },
]

const MOVEMENT_CHART = [
  { day: "23 мар", приход: 120, расход: 85 },
  { day: "24 мар", приход: 60, расход: 110 },
  { day: "25 мар", приход: 200, расход: 95 },
  { day: "26 мар", приход: 80, расход: 130 },
  { day: "27 мар", приход: 150, расход: 70 },
  { day: "28 мар", приход: 45, расход: 160 },
  { day: "29 мар", приход: 190, расход: 80 },
]

const ORDER_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new:        { label: "Новый",       variant: "default" },
  processing: { label: "В обработке", variant: "secondary" },
  shipped:    { label: "Отгружен",    variant: "outline" },
  done:       { label: "Выполнен",    variant: "outline" },
  cancelled:  { label: "Отменён",     variant: "destructive" },
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
}

export default function LogisticsDashboardPage() {
  const [, setRefreshed] = useState(false)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Дашборд склада</h1>
                  <p className="text-sm text-muted-foreground">Сводка на 29 марта 2026</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Инвентаризация запущена")}>
                  <ClipboardList className="w-4 h-4" />
                  Инвентаризация
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => toast.success("Открыть форму нового заказа")}>
                  <Plus className="w-4 h-4" />
                  Новый заказ
                </Button>
              </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {KPI_CARDS.map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{kpi.label}</p>
                        <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {kpi.up === true && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
                          {kpi.up === false && <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
                          <span className={`text-xs ${kpi.up === true ? "text-emerald-600" : kpi.up === false ? "text-red-500" : "text-muted-foreground"}`}>
                            {kpi.change}
                          </span>
                        </div>
                      </div>
                      <div className={`w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center ${kpi.color}`}>
                        <kpi.icon className="w-5 h-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Low stock */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Заканчивается на складе
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Артикул</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Наименование</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Остаток</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Мин.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LOW_STOCK.map(item => (
                        <tr key={item.sku} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{item.sku}</td>
                          <td className="px-3 py-2.5 text-sm">{item.name}</td>
                          <td className="text-right px-4 py-2.5">
                            <Badge variant={item.status === "critical" ? "destructive" : "secondary"} className="text-xs">
                              {item.qty} {item.unit}
                            </Badge>
                          </td>
                          <td className="text-right px-4 py-2.5 text-xs text-muted-foreground">{item.min}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Recent orders */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-violet-500" />
                    Последние заказы
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Номер</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Клиент</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сумма</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RECENT_ORDERS.map(order => {
                        const st = ORDER_STATUS[order.status]
                        return (
                          <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5 text-xs font-mono">{order.id}</td>
                            <td className="px-3 py-2.5 text-sm max-w-[140px] truncate">{order.client}</td>
                            <td className="text-right px-4 py-2.5 text-sm font-medium">{order.total}</td>
                            <td className="text-center px-4 py-2.5">
                              <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            {/* Movement chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Движение товаров — последние 7 дней</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={MOVEMENT_CHART} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="приход" name="Приход" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="расход" name="Расход" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="gap-2" onClick={() => { toast.success("Форма нового заказа"); setRefreshed(v => !v) }}>
                <ShoppingCart className="w-4 h-4" /> Новый заказ
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => toast.success("Принять поставку")}>
                <Package className="w-4 h-4" /> Принять товар
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => toast.info("Инвентаризация запущена")}>
                <ClipboardList className="w-4 h-4" /> Инвентаризация
              </Button>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
