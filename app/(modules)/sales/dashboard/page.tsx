"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  LayoutDashboard, Briefcase, CheckCircle2, Target,
  Plus, DollarSign, Loader2, PackageOpen,
} from "lucide-react"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import { getDefaultStages, type CrmStage } from "@/lib/crm/deal-stages"
import type { DealItem } from "@/app/(modules)/sales/deals/page"

function formatMoney(kopecks: number) {
  const n = kopecks / 100
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}К ₽`
  return `${Math.round(n)} ₽`
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "только что"
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d === 1) return "вчера"
  return `${d} дн назад`
}

export default function SalesDashboardPage() {
  const router = useRouter()
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
      .then((j) => {
        const d = j?.data ?? j
        if (Array.isArray(d?.stages) && d.stages.length) setStages(d.stages as CrmStage[])
      })
      .catch(() => {})
  }, [])

  const wonIds = useMemo(() => new Set(stages.filter((s) => s.probability >= 100).map((s) => s.id)), [stages])
  const lostIds = useMemo(() => new Set(stages.filter((s) => s.probability <= 0).map((s) => s.id)), [stages])

  // ── KPI ──
  const kpi = useMemo(() => {
    const inWork = deals.filter((d) => !wonIds.has(d.stage) && !lostIds.has(d.stage))
    const pipelineAmount = inWork.reduce((s, d) => s + (d.amount || 0), 0)
    const won = deals.filter((d) => wonIds.has(d.stage))
    const lost = deals.filter((d) => lostIds.has(d.stage))
    const now = new Date()
    const wonThisMonth = won.filter((d) => {
      if (!d.closedAt) return false
      const dt = new Date(d.closedAt)
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
    })
    const closedAmount = wonThisMonth.reduce((s, d) => s + (d.amount || 0), 0)
    const closedTotal = won.length + lost.length
    const conversion = closedTotal > 0 ? Math.round((won.length / closedTotal) * 1000) / 10 : 0
    return {
      inWorkCount: inWork.length,
      pipelineAmount,
      wonThisMonthCount: wonThisMonth.length,
      closedAmount,
      conversion,
    }
  }, [deals, wonIds, lostIds])

  const kpiCards = [
    { label: "Сделок в работе", value: String(kpi.inWorkCount), icon: Briefcase, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "Сумма воронки", value: formatMoney(kpi.pipelineAmount), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Закрыто в этом месяце", value: String(kpi.wonThisMonthCount), sub: formatMoney(kpi.closedAmount), icon: CheckCircle2, color: "text-purple-600", bg: "bg-purple-500/10" },
    { label: "Конверсия", value: `${kpi.conversion}%`, icon: Target, color: "text-amber-600", bg: "bg-amber-500/10" },
  ]

  // ── Воронка ──
  const pipeline = useMemo(() => {
    const ordered = stages.filter((s) => !lostIds.has(s.id))
    const byStage = new Map<string, { count: number; amount: number }>()
    for (const s of ordered) byStage.set(s.id, { count: 0, amount: 0 })
    for (const d of deals) {
      const cell = byStage.get(d.stage)
      if (cell) { cell.count++; cell.amount += d.amount || 0 }
    }
    return ordered.map((s) => ({ id: s.id, label: s.label, color: s.color, ...(byStage.get(s.id) ?? { count: 0, amount: 0 }) }))
  }, [deals, stages, lostIds])
  const pipelineMaxAmount = Math.max(1, ...pipeline.map((s) => s.amount))

  // ── Последние сделки ──
  const recent = useMemo(() => {
    return [...deals]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
  }, [deals])

  // ── Топ-менеджеры ──
  const managers = useMemo(() => {
    const map = new Map<string, { name: string; total: number; won: number; amount: number }>()
    for (const d of deals) {
      const name = d.assignedToName || "Без ответственного"
      const cell = map.get(name) ?? { name, total: 0, won: 0, amount: 0 }
      cell.total++
      if (wonIds.has(d.stage)) { cell.won++; cell.amount += d.amount || 0 }
      map.set(name, cell)
    }
    return [...map.values()]
      .map((m) => ({ ...m, conversion: m.total > 0 ? Math.round((m.won / m.total) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount || b.total - a.total)
      .slice(0, 6)
  }, [deals, wonIds])

  const hasDeals = deals.length > 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">CRM Дашборд</h1>
                  <p className="text-sm text-muted-foreground">Обзор продаж и активности команды</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => router.push("/sales/deals")}>
                <Plus className="w-4 h-4" />
                Сделки
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
              </div>
            ) : (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {kpiCards.map((kpiCard) => (
                    <Card key={kpiCard.label}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", kpiCard.bg)}>
                            <kpiCard.icon className={cn("w-4 h-4", kpiCard.color)} />
                          </div>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{kpiCard.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{kpiCard.label}</p>
                        {kpiCard.sub && <p className="text-xs text-emerald-600 mt-1">{kpiCard.sub}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {!hasDeals ? (
                  <Card>
                    <CardContent className="py-16 text-center space-y-3">
                      <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">Пока нет сделок</p>
                      <p className="text-sm text-muted-foreground">Создайте первую сделку — и здесь появится сводка.</p>
                      <Button variant="outline" size="sm" onClick={() => router.push("/sales/deals")}>К сделкам</Button>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                      {/* Pipeline Summary */}
                      <Card className="lg:col-span-2">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Воронка продаж</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {pipeline.map((stage) => {
                              const pct = Math.round((stage.amount / pipelineMaxAmount) * 100)
                              return (
                                <div key={stage.id} className="flex items-center gap-3">
                                  <div className="w-28 text-sm text-muted-foreground shrink-0 truncate">{stage.label}</div>
                                  <div className="flex-1 h-7 bg-muted/30 rounded-md overflow-hidden relative">
                                    <div
                                      className="h-full rounded-md transition-all flex items-center px-2 justify-end min-w-[1.5rem]"
                                      style={{ width: `${Math.max(pct, 6)}%`, backgroundColor: stage.color }}
                                    >
                                      <span className="text-xs font-semibold text-white">{stage.count}</span>
                                    </div>
                                  </div>
                                  <div className="text-sm font-medium text-foreground w-24 text-right shrink-0">
                                    {stage.amount > 0 ? formatMoney(stage.amount) : "—"}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Recent deals */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Последние сделки</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="divide-y">
                            {recent.map((d) => (
                              <button
                                key={d.id}
                                onClick={() => router.push(`/sales/deals/${d.id}`)}
                                className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                              >
                                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-blue-600 bg-blue-100 dark:bg-blue-900/30">
                                  <Plus className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground leading-tight truncate">{d.title}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {(d.companyName || "Без компании")}{d.amount ? ` · ${formatMoney(d.amount)}` : ""}
                                  </p>
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{relativeTime(d.createdAt)}</span>
                              </button>
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
                        <DataTable>
                          <DataHead>
                            <DataHeadCell>#</DataHeadCell>
                            <DataHeadCell>Менеджер</DataHeadCell>
                            <DataHeadCell align="right">Сделок</DataHeadCell>
                            <DataHeadCell align="right">Выручка</DataHeadCell>
                            <DataHeadCell align="right">Конверсия</DataHeadCell>
                          </DataHead>
                          <tbody>
                            {managers.map((mgr, i) => (
                              <DataRow key={mgr.name}>
                                <DataCell className="text-muted-foreground">{i + 1}</DataCell>
                                <DataCell>
                                  <div className="flex items-center gap-2.5">
                                    <Avatar className="w-7 h-7">
                                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(mgr.name)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium text-foreground">{mgr.name}</span>
                                  </div>
                                </DataCell>
                                <DataCell align="right" className="font-medium text-foreground">{mgr.total}</DataCell>
                                <DataCell align="right" className="font-medium text-foreground">{mgr.amount > 0 ? formatMoney(mgr.amount) : "—"}</DataCell>
                                <DataCell align="right">
                                  <Badge variant={mgr.conversion >= 28 ? "default" : "secondary"} className="text-xs">
                                    {mgr.conversion}%
                                  </Badge>
                                </DataCell>
                              </DataRow>
                            ))}
                          </tbody>
                        </DataTable>
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
