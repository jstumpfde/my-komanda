"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Target, Calendar, ArrowUp, Minus, ArrowDown, Loader2, PackageOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { getDefaultStages, type CrmStage } from "@/lib/crm/deal-stages"
import type { DealItem } from "@/app/(modules)/sales/deals/page"

function formatMoney(kopecks: number) {
  const n = kopecks / 100
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${Math.round(n)} ₽`
}

function ProbabilityBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : pct >= 60 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    : pct >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
  return <Badge className={cn("text-xs border-0", color)}>{pct}%</Badge>
}

function formatCloseDate(d: string | null): string {
  if (!d) return "без срока"
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

export default function SalesForecastsPage() {
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
      .then((j) => { const d = j?.data ?? j; if (Array.isArray(d?.stages) && d.stages.length) setStages(d.stages as CrmStage[]) })
      .catch(() => {})
  }, [])

  const wonIds = useMemo(() => new Set(stages.filter((s) => s.probability >= 100).map((s) => s.id)), [stages])
  const lostIds = useMemo(() => new Set(stages.filter((s) => s.probability <= 0).map((s) => s.id)), [stages])
  const stageLabel = useMemo(() => new Map(stages.map((s) => [s.id, s.label])), [stages])

  const open = useMemo(() => deals.filter((d) => !wonIds.has(d.stage) && !lostIds.has(d.stage)), [deals, wonIds, lostIds])
  const won = useMemo(() => deals.filter((d) => wonIds.has(d.stage)), [deals, wonIds])

  const weighted = (d: DealItem) => (d.amount || 0) * ((d.probability ?? 0) / 100)
  const weightedForecast = useMemo(() => open.reduce((s, d) => s + weighted(d), 0), [open])

  // Прогноз-карточки по периодам: факт = выигранные, закрытые в периоде; прогноз = факт + взвешенные открытые с ожид. закрытием в периоде.
  const cards = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const q = Math.floor(m / 3)
    const inPeriod = (iso: string | null, period: "month" | "quarter" | "year"): boolean => {
      if (!iso) return false
      const dt = new Date(iso)
      if (dt.getFullYear() !== y) return false
      if (period === "year") return true
      if (period === "quarter") return Math.floor(dt.getMonth() / 3) === q
      return dt.getMonth() === m
    }
    return (["month", "quarter", "year"] as const).map((period) => {
      const label = period === "month" ? "Этот месяц" : period === "quarter" ? "Квартал" : "Год"
      const actual = won.filter((d) => inPeriod(d.closedAt, period)).reduce((s, d) => s + (d.amount || 0), 0)
      const openInPeriod = open.filter((d) => inPeriod(d.expectedCloseDate, period)).reduce((s, d) => s + weighted(d), 0)
      const forecast = actual + openInPeriod
      const pct = forecast > 0 ? Math.round((actual / forecast) * 100) : 0
      return { label, forecast, actual, pct }
    })
  }, [won, open])

  // Топ открытых сделок по взвешенной сумме.
  const topDeals = useMemo(
    () => [...open].sort((a, b) => weighted(b) - weighted(a)).slice(0, 8),
    [open],
  )

  // Сценарии.
  const scenarios = useMemo(() => {
    const pessimistic = open.filter((d) => (d.probability ?? 0) >= 70).reduce((s, d) => s + (d.amount || 0), 0)
    const optimistic = open.reduce((s, d) => s + (d.amount || 0), 0)
    return [
      { name: "Пессимистичный", amount: pessimistic, color: "text-red-600", bg: "bg-red-500/10", icon: ArrowDown, description: "Закроются только сделки с вероятностью ≥70%" },
      { name: "Реалистичный", amount: weightedForecast, color: "text-amber-600", bg: "bg-amber-500/10", icon: Minus, description: "Взвешенный по вероятностям прогноз" },
      { name: "Оптимистичный", amount: optimistic, color: "text-emerald-600", bg: "bg-emerald-500/10", icon: ArrowUp, description: "Закроются все активные сделки в воронке" },
    ]
  }, [open, weightedForecast])

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
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Прогнозы продаж</h1>
                <p className="text-sm text-muted-foreground">Планы, сценарии и взвешенный pipeline</p>
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
                  <p className="text-sm text-muted-foreground">Прогноз появится, как только в воронке будут сделки.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Forecast Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {cards.map((card) => (
                    <Card key={card.label}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                          <Target className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between">
                            <p className="text-xs text-muted-foreground">Прогноз</p>
                            <p className="text-sm font-semibold text-foreground">{formatMoney(card.forecast)}</p>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <p className="text-xs text-muted-foreground">Факт</p>
                            <p className="text-base font-bold text-foreground">{formatMoney(card.actual)}</p>
                          </div>
                          <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", card.pct >= 80 ? "bg-emerald-500" : card.pct >= 60 ? "bg-amber-500" : "bg-red-400")}
                              style={{ width: `${Math.min(card.pct, 100)}%` }}
                            />
                          </div>
                          <span className={cn("text-xs font-semibold", card.pct >= 80 ? "text-emerald-600" : card.pct >= 60 ? "text-amber-600" : "text-red-600")}>
                            {card.pct}% выполнения
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Trend note */}
                <div className="border rounded-xl p-4 bg-primary/5 border-primary/20 mb-6 flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-primary shrink-0" />
                  <p className="text-sm text-foreground">
                    Взвешенный прогноз по открытым сделкам:{" "}
                    <span className="font-bold text-primary">{formatMoney(weightedForecast)}</span>{" "}
                    <span className="text-muted-foreground">({open.length} в работе)</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pipeline Forecast */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Топ открытых сделок
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {topDeals.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-4 py-6 text-center">Нет открытых сделок</p>
                      ) : (
                        <>
                          <div className="divide-y">
                            {topDeals.map((deal) => (
                              <button
                                key={deal.id}
                                onClick={() => router.push(`/sales/deals/${deal.id}`)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{deal.companyName || deal.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {stageLabel.get(deal.stage) ?? deal.stage} · до {formatCloseDate(deal.expectedCloseDate)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <ProbabilityBadge pct={deal.probability ?? 0} />
                                  <span className="text-sm font-semibold text-foreground w-20 text-right">{formatMoney(deal.amount || 0)}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="px-4 py-3 border-t bg-muted/20">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Взвешенная сумма (все открытые)</span>
                              <span className="text-sm font-bold text-foreground">{formatMoney(weightedForecast)}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Scenarios */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Сценарии</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {scenarios.map((scenario) => {
                          const Icon = scenario.icon
                          return (
                            <div key={scenario.name} className={cn("border rounded-xl p-4", scenario.bg)}>
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className={cn("w-4 h-4", scenario.color)} />
                                <span className={cn("text-sm font-semibold", scenario.color)}>{scenario.name}</span>
                              </div>
                              <p className="text-xl font-bold text-foreground mb-1">{formatMoney(scenario.amount)}</p>
                              <p className="text-xs text-muted-foreground">{scenario.description}</p>
                            </div>
                          )
                        })}
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
