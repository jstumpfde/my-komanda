"use client"

import { useState, useEffect, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BarChart3, TrendingUp, Target, Users, Loader2, PackageOpen } from "lucide-react"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import { getDefaultStages, type CrmStage } from "@/lib/crm/deal-stages"
import type { DealItem } from "@/app/(modules)/sales/deals/page"

const DATE_RANGES = ["Эта неделя", "Этот месяц", "Квартал", "Год"] as const
type DateRange = (typeof DATE_RANGES)[number]

const MONTH_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

function formatMoney(kopecks: number) {
  const n = kopecks / 100
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${Math.round(n)} ₽`
}

function barLabel(kopecks: number): string {
  const n = kopecks / 100
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К`
  return n > 0 ? `${Math.round(n)}` : ""
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
}

export default function SalesAnalyticsPage() {
  const [activeRange, setActiveRange] = useState<DateRange>("Год")
  const [deals, setDeals] = useState<DealItem[]>([])
  const [stages, setStages] = useState<CrmStage[]>(() => getDefaultStages("b2b"))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch("/api/modules/sales/deals")
      .then((r) => r.json())
      .then((d) => setDeals(d.deals ?? []))
      .catch(() => setDeals([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch("/api/modules/sales/settings")
      .then((r) => r.json())
      .then((j) => { const d = j?.data ?? j; if (Array.isArray(d?.stages) && d.stages.length) setStages(d.stages as CrmStage[]) })
      .catch(() => {})
  }, [])

  const wonIds = useMemo(() => new Set(stages.filter((s) => s.probability >= 100).map((s) => s.id)), [stages])
  const lostIds = useMemo(() => new Set(stages.filter((s) => s.probability <= 0).map((s) => s.id)), [stages])

  const won = useMemo(() => deals.filter((d) => wonIds.has(d.stage)), [deals, wonIds])

  // ── Выручка по выбранному периоду (по выигранным сделкам, дата = closedAt) ──
  const revenueData = useMemo(() => {
    const now = new Date()
    const sumWon = (pred: (dt: Date) => boolean) =>
      won.reduce((s, d) => (d.closedAt && pred(new Date(d.closedAt)) ? s + (d.amount || 0) : s), 0)

    if (activeRange === "Эта неделя") {
      const ws = new Date(now); const day = (ws.getDay() + 6) % 7
      ws.setDate(ws.getDate() - day); ws.setHours(0, 0, 0, 0)
      return WEEKDAYS.map((label, i) => {
        const d0 = new Date(ws); d0.setDate(ws.getDate() + i)
        const d1 = new Date(d0); d1.setDate(d0.getDate() + 1)
        return { month: label, amount: sumWon((dt) => dt >= d0 && dt < d1) }
      })
    }
    if (activeRange === "Этот месяц") {
      const y = now.getFullYear(), m = now.getMonth()
      const weeks = Math.ceil(new Date(y, m + 1, 0).getDate() / 7)
      return Array.from({ length: weeks }, (_, w) => ({
        month: `Нед ${w + 1}`,
        amount: sumWon((dt) => dt.getFullYear() === y && dt.getMonth() === m && Math.floor((dt.getDate() - 1) / 7) === w),
      }))
    }
    const monthsBack = activeRange === "Квартал" ? 3 : 12
    return Array.from({ length: monthsBack }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1)
      return {
        month: MONTH_SHORT[d.getMonth()],
        amount: sumWon((dt) => dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth()),
      }
    })
  }, [won, activeRange])

  const maxAmount = Math.max(...revenueData.map((d) => d.amount), 1)
  const totalRevenue = revenueData.reduce((s, d) => s + d.amount, 0)

  // ── Win/Loss ──
  const winLoss = useMemo(() => {
    const total = deals.length || 1
    const w = deals.filter((d) => wonIds.has(d.stage)).length
    const l = deals.filter((d) => lostIds.has(d.stage)).length
    const inWork = deals.length - w - l
    return [
      { label: "Выиграно", pct: Math.round((w / total) * 100), color: "bg-emerald-500", textColor: "text-emerald-600" },
      { label: "Проиграно", pct: Math.round((l / total) * 100), color: "bg-red-400", textColor: "text-red-600" },
      { label: "В работе", pct: Math.round((inWork / total) * 100), color: "bg-blue-400", textColor: "text-blue-600" },
    ]
  }, [deals, wonIds, lostIds])

  // ── Менеджеры ──
  const managers = useMemo(() => {
    const map = new Map<string, { name: string; total: number; won: number; amount: number; cycleDays: number[] }>()
    for (const d of deals) {
      const name = d.assignedToName || "Без ответственного"
      const cell = map.get(name) ?? { name, total: 0, won: 0, amount: 0, cycleDays: [] }
      cell.total++
      if (wonIds.has(d.stage)) {
        cell.won++; cell.amount += d.amount || 0
        if (d.closedAt && d.createdAt) {
          const days = (new Date(d.closedAt).getTime() - new Date(d.createdAt).getTime()) / 86_400_000
          if (days >= 0) cell.cycleDays.push(days)
        }
      }
      map.set(name, cell)
    }
    return [...map.values()]
      .map((m) => ({
        name: m.name,
        deals: m.total,
        amount: m.amount,
        conversion: m.total > 0 ? Math.round((m.won / m.total) * 100) : 0,
        avgCycle: m.cycleDays.length ? Math.round(m.cycleDays.reduce((a, b) => a + b, 0) / m.cycleDays.length) : null,
      }))
      .sort((a, b) => b.amount - a.amount || b.deals - a.deals)
  }, [deals, wonIds])
  const totalManagerRevenue = Math.max(1, managers.reduce((s, m) => s + m.amount, 0))

  // ── Источники ──
  const sources = useMemo(() => {
    const map = new Map<string, { leads: number; won: number; amount: number }>()
    for (const d of deals) {
      const key = d.source || "Без источника"
      const cell = map.get(key) ?? { leads: 0, won: 0, amount: 0 }
      cell.leads++
      if (wonIds.has(d.stage)) { cell.won++; cell.amount += d.amount || 0 }
      map.set(key, cell)
    }
    return [...map.entries()]
      .map(([source, v]) => ({ source, leads: v.leads, won: v.won, amount: v.amount, conversion: v.leads > 0 ? Math.round((v.won / v.leads) * 1000) / 10 : 0 }))
      .sort((a, b) => b.leads - a.leads)
  }, [deals, wonIds])

  const hasDeals = deals.length > 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Аналитика продаж</h1>
                <p className="text-sm text-muted-foreground">Выручка, конверсия и эффективность команды</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
              </div>
            ) : !hasDeals ? (
              <Card>
                <CardContent className="py-16 text-center space-y-3">
                  <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">Пока нет сделок</p>
                  <p className="text-sm text-muted-foreground">Аналитика появится с первыми сделками.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Date Range Tabs */}
                <div className="flex border rounded-lg overflow-hidden w-fit mb-6">
                  {DATE_RANGES.map((range) => (
                    <button
                      key={range}
                      className={cn("px-4 py-2 text-sm transition-colors", activeRange === range ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground")}
                      onClick={() => setActiveRange(range)}
                    >
                      {range}
                    </button>
                  ))}
                </div>

                {/* Revenue Chart */}
                <Card className="mb-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Выручка · {formatMoney(totalRevenue)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-2 h-40">
                      {revenueData.map((d, i) => {
                        const h = Math.round((d.amount / maxAmount) * 128)
                        const isMax = d.amount === maxAmount && d.amount > 0
                        return (
                          <div key={`${d.month}-${i}`} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] text-muted-foreground font-medium">{barLabel(d.amount)}</span>
                            <div className="w-full flex flex-col items-stretch" style={{ height: 128 }}>
                              <div className="flex-1" />
                              <div className={cn("w-full rounded-t-sm transition-all", isMax ? "bg-primary" : "bg-primary/40")} style={{ height: h }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground">{d.month}</p>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                  {/* Win/Loss */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Win/Loss
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {winLoss.map((item) => (
                          <div key={item.label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-muted-foreground">{item.label}</span>
                              <span className={cn("text-sm font-bold", item.textColor)}>{item.pct}%</span>
                            </div>
                            <div className="w-full h-2.5 bg-muted/30 rounded-full overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", item.color)} style={{ width: `${item.pct}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-center">
                        <div className="flex gap-1 h-8 w-full rounded-lg overflow-hidden">
                          {winLoss.filter((i) => i.pct > 0).map((item) => (
                            <div key={item.label} className={cn("h-full flex items-center justify-center", item.color)} style={{ width: `${item.pct}%` }}>
                              {item.pct > 15 && <span className="text-[10px] font-bold text-white">{item.pct}%</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Manager Performance */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Менеджеры
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <DataTable>
                        <DataHead>
                          <DataHeadCell>Менеджер</DataHeadCell>
                          <DataHeadCell align="right">Сделок</DataHeadCell>
                          <DataHeadCell align="right">Выручка</DataHeadCell>
                          <DataHeadCell align="right">Конверсия</DataHeadCell>
                          <DataHeadCell align="right">Ср. цикл</DataHeadCell>
                        </DataHead>
                        <tbody>
                          {managers.map((mgr) => {
                            const sharePct = Math.round((mgr.amount / totalManagerRevenue) * 100)
                            return (
                              <DataRow key={mgr.name}>
                                <DataCell>
                                  <div className="flex items-center gap-2.5">
                                    <Avatar className="w-7 h-7">
                                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(mgr.name)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{mgr.name}</p>
                                      <p className="text-[10px] text-muted-foreground">{sharePct}% от общей выручки</p>
                                    </div>
                                  </div>
                                </DataCell>
                                <DataCell align="right" className="text-foreground">{mgr.deals}</DataCell>
                                <DataCell align="right" className="font-medium text-foreground">{mgr.amount > 0 ? formatMoney(mgr.amount) : "—"}</DataCell>
                                <DataCell align="right">
                                  <Badge variant={mgr.conversion >= 28 ? "default" : "secondary"} className="text-xs">{mgr.conversion}%</Badge>
                                </DataCell>
                                <DataCell align="right" className="text-muted-foreground">{mgr.avgCycle !== null ? `${mgr.avgCycle} дн` : "—"}</DataCell>
                              </DataRow>
                            )
                          })}
                        </tbody>
                      </DataTable>
                    </CardContent>
                  </Card>
                </div>

                {/* Sources Analysis */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Анализ источников лидов</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {sources.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-4 py-6 text-center">Нет данных по источникам</p>
                    ) : (
                      <DataTable>
                        <DataHead>
                          <DataHeadCell>Источник</DataHeadCell>
                          <DataHeadCell align="right">Сделок</DataHeadCell>
                          <DataHeadCell align="right">Выиграно</DataHeadCell>
                          <DataHeadCell align="right">Конверсия</DataHeadCell>
                          <DataHeadCell align="right">Выручка</DataHeadCell>
                        </DataHead>
                        <tbody>
                          {sources.map((row) => (
                            <DataRow key={row.source}>
                              <DataCell className="font-medium text-foreground">{row.source}</DataCell>
                              <DataCell align="right" className="text-foreground">{row.leads}</DataCell>
                              <DataCell align="right" className="text-foreground">{row.won}</DataCell>
                              <DataCell align="right">
                                <Badge variant={row.conversion >= 20 ? "default" : "secondary"} className="text-xs">{row.conversion}%</Badge>
                              </DataCell>
                              <DataCell align="right" className="text-foreground">{row.amount > 0 ? formatMoney(row.amount) : "—"}</DataCell>
                            </DataRow>
                          ))}
                        </tbody>
                      </DataTable>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
