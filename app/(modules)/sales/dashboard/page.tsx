"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  LayoutDashboard, TrendingUp, Briefcase, CheckCircle2, Target,
  Plus, UserPlus, ClipboardList, ArrowUpRight, Clock, Phone,
  Calendar, DollarSign, AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

const KPI_CARDS = [
  { label: "Сделок в работе", value: "34", delta: "+5 за неделю", icon: Briefcase, color: "text-blue-600", bg: "bg-blue-500/10" },
  { label: "Сумма воронки", value: "18 450 000 ₽", delta: "+2.1М за неделю", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  { label: "Закрыто в этом месяце", value: "8", delta: "4 250 000 ₽", icon: CheckCircle2, color: "text-purple-600", bg: "bg-purple-500/10" },
  { label: "Конверсия", value: "23.5%", delta: "+1.2% к прошлому мес.", icon: Target, color: "text-amber-600", bg: "bg-amber-500/10" },
]

const PIPELINE_STAGES = [
  { label: "Новая", count: 12, amount: 5_200_000, color: "bg-slate-400" },
  { label: "Переговоры", count: 9, amount: 4_800_000, color: "bg-blue-500" },
  { label: "КП отправлено", count: 7, amount: 3_900_000, color: "bg-amber-500" },
  { label: "Согласование", count: 4, amount: 2_900_000, color: "bg-purple-500" },
  { label: "Закрыта", count: 8, amount: 4_250_000, color: "bg-emerald-500" },
]

const RECENT_ACTIVITY = [
  { id: 1, type: "deal_created", text: "Новая сделка: ООО Техностар", sub: "Алексей Иванов · 850 000 ₽", time: "10 мин назад", icon: Plus, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { id: 2, type: "meeting_scheduled", text: "Встреча запланирована: Демо для Альфа", sub: "Мария Петрова · завтра 14:00", time: "32 мин назад", icon: Calendar, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30" },
  { id: 3, type: "task_done", text: "Задача выполнена: отправить КП", sub: "Дмитрий Козлов · сделка Бета Групп", time: "1 ч назад", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
  { id: 4, type: "call_logged", text: "Звонок записан: ООО Прогресс", sub: "Алексей Иванов · 18 мин", time: "2 ч назад", icon: Phone, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
  { id: 5, type: "deal_moved", text: "Сделка перешла: КП → Согласование", sub: "Мария Петрова · ЗАО Капитал", time: "3 ч назад", icon: ArrowUpRight, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { id: 6, type: "deal_created", text: "Новая сделка: ИП Соколов А.В.", sub: "Сергей Новиков · 320 000 ₽", time: "5 ч назад", icon: Plus, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { id: 7, type: "task_overdue", text: "Просроченная задача: перезвонить", sub: "Дмитрий Козлов · ООО Горизонт", time: "6 ч назад", icon: AlertCircle, color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
  { id: 8, type: "meeting_done", text: "Встреча завершена: Презентация", sub: "Алексей Иванов · ГК Вектор", time: "вчера", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
]

const TOP_MANAGERS = [
  { name: "Алексей Иванов", initials: "АИ", deals: 14, amount: 6_200_000, conversion: 31 },
  { name: "Мария Петрова", initials: "МП", deals: 11, amount: 5_100_000, conversion: 28 },
  { name: "Дмитрий Козлов", initials: "ДК", deals: 9, amount: 4_300_000, conversion: 22 },
  { name: "Сергей Новиков", initials: "СН", deals: 7, amount: 2_900_000, conversion: 19 },
]

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}К ₽`
  return `${n} ₽`
}

export default function SalesDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">CRM Дашборд</h1>
                  <p className="text-sm text-muted-foreground">Обзор продаж и активности команды</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ClipboardList className="w-4 h-4" />
                  Задача
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <UserPlus className="w-4 h-4" />
                  Клиент
                </Button>
                <Button size="sm" className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  Новая сделка
                </Button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {KPI_CARDS.map((kpi) => (
                <Card key={kpi.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", kpi.bg)}>
                        <kpi.icon className={cn("w-4 h-4", kpi.color)} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" />
                      {kpi.delta}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Pipeline Summary */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Воронка продаж</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {PIPELINE_STAGES.map((stage) => {
                      const maxAmount = Math.max(...PIPELINE_STAGES.map(s => s.amount))
                      const pct = Math.round((stage.amount / maxAmount) * 100)
                      return (
                        <div key={stage.label} className="flex items-center gap-3">
                          <div className="w-28 text-sm text-muted-foreground shrink-0">{stage.label}</div>
                          <div className="flex-1 h-7 bg-muted/30 rounded-md overflow-hidden relative">
                            <div
                              className={cn("h-full rounded-md transition-all flex items-center px-2 justify-end", stage.color)}
                              style={{ width: `${pct}%` }}
                            >
                              <span className="text-xs font-semibold text-white">{stage.count}</span>
                            </div>
                          </div>
                          <div className="text-sm font-medium text-foreground w-24 text-right shrink-0">
                            {formatMoney(stage.amount)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Последние действия</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {RECENT_ACTIVITY.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5 px-4 py-2.5">
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", item.color)}>
                          <item.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground leading-tight">{item.text}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Managers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Топ менеджеры</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">#</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Менеджер</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Сделок</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Сумма</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TOP_MANAGERS.map((mgr, i) => (
                        <tr key={mgr.name} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="w-7 h-7">
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">{mgr.initials}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium text-foreground">{mgr.name}</span>
                            </div>
                          </td>
                          <td className="text-right px-4 py-3 text-sm font-medium text-foreground">{mgr.deals}</td>
                          <td className="text-right px-4 py-3 text-sm font-medium text-foreground">{formatMoney(mgr.amount)}</td>
                          <td className="text-right px-4 py-3">
                            <Badge variant={mgr.conversion >= 28 ? "default" : "secondary"} className="text-xs">
                              {mgr.conversion}%
                            </Badge>
                          </td>
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
