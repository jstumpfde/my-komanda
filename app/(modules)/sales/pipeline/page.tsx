"use client"

import { useState, useEffect, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingDown, ArrowDown, Clock, Loader2, PackageOpen } from "lucide-react"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { cn } from "@/lib/utils"
import { getDefaultStages, type CrmStage } from "@/lib/crm/deal-stages"
import type { DealItem } from "@/app/(modules)/sales/deals/page"

// Копейки → рубли (суммы сделок хранятся в копейках).
function formatMoney(kopecks: number) {
  const n = kopecks / 100
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${Math.round(n)} ₽`
}

const MONTH_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

export default function SalesPipelinePage() {
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

  // ── Воронка по стадиям ──
  const funnel = useMemo(() => {
    const byStage = new Map<string, { count: number; amount: number }>()
    for (const s of stages) byStage.set(s.id, { count: 0, amount: 0 })
    for (const d of deals) {
      const cell = byStage.get(d.stage)
      if (cell) { cell.count++; cell.amount += d.amount || 0 }
    }
    // Воронка прогрессии — без терминальных проигрышных стадий (они не «ниже по воронке»).
    const ordered = stages.filter((s) => !lostIds.has(s.id))
    const maxCount = Math.max(1, ...ordered.map((s) => byStage.get(s.id)?.count ?? 0))
    return ordered.map((s, i) => {
      const cur = byStage.get(s.id) ?? { count: 0, amount: 0 }
      const prev = i > 0 ? (byStage.get(ordered[i - 1].id)?.count ?? 0) : null
      const conversion = prev && prev > 0 ? Math.round((cur.count / prev) * 100) : null
      return { id: s.id, label: s.label, color: s.color, count: cur.count, amount: cur.amount, width: Math.round((cur.count / maxCount) * 100), conversion }
    })
  }, [deals, stages, lostIds])

  // ── Сводка ──
  const summary = useMemo(() => {
    const won = deals.filter((d) => wonIds.has(d.stage))
    const lost = deals.filter((d) => lostIds.has(d.stage))
    const closedCount = won.length + lost.length
    const conversion = closedCount > 0 ? Math.round((won.length / closedCount) * 1000) / 10 : 0
    const wonAmounts = won.map((d) => d.amount || 0).filter((a) => a > 0)
    const avgAmount = wonAmounts.length ? wonAmounts.reduce((a, b) => a + b, 0) / wonAmounts.length : 0
    // Средний цикл — по закрытым сделкам с датой закрытия.
    const cycles = won.concat(lost)
      .filter((d) => d.closedAt && d.createdAt)
      .map((d) => (new Date(d.closedAt as string).getTime() - new Date(d.createdAt).getTime()) / 86_400_000)
      .filter((n) => n >= 0)
    const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null
    return { conversion, avgAmount, avgCycle }
  }, [deals, wonIds, lostIds])

  // ── Анализ источников ──
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
      .map(([source, v]) => ({
        source,
        leads: v.leads,
        deals: v.won,
        conversion: v.leads > 0 ? Math.round((v.won / v.leads) * 1000) / 10 : 0,
        avgAmount: v.won > 0 ? v.amount / v.won : 0,
      }))
      .sort((a, b) => b.leads - a.leads)
  }, [deals, wonIds])

  // ── Тренд по месяцам (последние 6, по дате закрытия) ──
  const monthly = useMemo(() => {
    const now = new Date()
    const buckets: { key: string; month: string; won: number; lost: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_SHORT[d.getMonth()], won: 0, lost: 0 })
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]))
    for (const d of deals) {
      if (!d.closedAt) continue
      const dt = new Date(d.closedAt)
      const k = `${dt.getFullYear()}-${dt.getMonth()}`
      const i = idx.get(k)
      if (i === undefined) continue
      if (wonIds.has(d.stage)) buckets[i].won++
      else if (lostIds.has(d.stage)) buckets[i].lost++
    }
    return buckets
  }, [deals, wonIds, lostIds])

  const maxBar = Math.max(1, ...monthly.map((m) => m.won + m.lost))
  const hasDeals = deals.length > 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Воронка продаж</h1>
                <p className="text-sm text-muted-foreground">Конверсия по этапам и анализ источников</p>
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
                  <p className="text-sm text-muted-foreground">Аналитика воронки появится, как только появятся сделки.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-xl border bg-card">
                    <p className="text-xs text-muted-foreground mb-1">Средний цикл сделки</p>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <p className="text-2xl font-bold">{summary.avgCycle !== null ? `${summary.avgCycle} дн.` : "—"}</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border bg-card">
                    <p className="text-xs text-muted-foreground mb-1">Общая конверсия</p>
                    <p className="text-2xl font-bold text-emerald-600">{summary.conversion}%</p>
                  </div>
                  <div className="p-4 rounded-xl border bg-card">
                    <p className="text-xs text-muted-foreground mb-1">Ср. сумма сделки</p>
                    <p className="text-2xl font-bold">{summary.avgAmount > 0 ? formatMoney(summary.avgAmount) : "—"}</p>
                  </div>
                </div>

                {/* Visual Funnel */}
                <Card className="mb-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingDown className="w-4 h-4" />
                      Воронка конверсии
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {funnel.map((stage, i) => (
                        <div key={stage.id}>
                          <div className="flex items-center gap-3">
                            <div className="w-36 text-right">
                              <p className="text-sm font-medium text-foreground">{stage.label}</p>
                              <p className="text-xs text-muted-foreground">{stage.count} сделок</p>
                            </div>
                            <div className="flex-1 flex justify-center">
                              <div
                                className="h-12 rounded-lg flex items-center justify-center transition-all min-w-[2.5rem]"
                                style={{ width: `${Math.max(stage.width, 8)}%`, backgroundColor: stage.color }}
                              >
                                <span className="text-sm font-bold text-white drop-shadow-sm">
                                  {stage.amount > 0 ? formatMoney(stage.amount) : stage.count}
                                </span>
                              </div>
                            </div>
                            <div className="w-16 text-left">
                              {stage.amount > 0 && <p className="text-xs text-muted-foreground">{formatMoney(stage.amount)}</p>}
                            </div>
                          </div>
                          {i < funnel.length - 1 && funnel[i + 1].conversion !== null && (
                            <div className="flex items-center justify-center gap-1 py-0.5">
                              <ArrowDown className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground font-medium">{funnel[i + 1].conversion}%</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Source Breakdown */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Анализ источников</CardTitle>
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
                            <DataHeadCell align="right">Ср. сумма</DataHeadCell>
                          </DataHead>
                          <tbody>
                            {sources.map((row) => (
                              <DataRow key={row.source}>
                                <DataCell className="font-medium text-foreground">{row.source}</DataCell>
                                <DataCell align="right" className="text-foreground">{row.leads}</DataCell>
                                <DataCell align="right" className="text-foreground">{row.deals}</DataCell>
                                <DataCell align="right">
                                  <Badge variant={row.conversion >= 20 ? "default" : "secondary"} className="text-xs">
                                    {row.conversion}%
                                  </Badge>
                                </DataCell>
                                <DataCell align="right" className="text-foreground">{row.avgAmount > 0 ? formatMoney(row.avgAmount) : "—"}</DataCell>
                              </DataRow>
                            ))}
                          </tbody>
                        </DataTable>
                      )}
                    </CardContent>
                  </Card>

                  {/* Monthly Trend */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Тренд по месяцам</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-1 h-40">
                        {monthly.map((m) => {
                          const wonH = Math.round((m.won / maxBar) * 128)
                          const lostH = Math.round((m.lost / maxBar) * 128)
                          return (
                            <div key={m.key} className="flex-1 flex flex-col items-center gap-0.5">
                              <div className="w-full flex flex-col items-stretch gap-0.5" style={{ height: 128 }}>
                                <div className="flex-1" />
                                <div className="w-full rounded-t bg-emerald-500" style={{ height: wonH }} title={`Выиграно: ${m.won}`} />
                                <div className="w-full rounded-b bg-red-400" style={{ height: lostH }} title={`Проиграно: ${m.lost}`} />
                              </div>
                              <p className="text-[10px] text-muted-foreground">{m.month}</p>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                          <span className="text-xs text-muted-foreground">Выиграно</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-red-400" />
                          <span className="text-xs text-muted-foreground">Проиграно</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
