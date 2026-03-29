"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { TrendingUp, Target, Calendar, ArrowUp, Minus, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

const FORECAST_CARDS = [
  {
    label: "Этот месяц",
    forecast: 8_500_000,
    actual: 6_800_000,
    pct: 80,
    delta: "+12% к прошлому",
    deltaPositive: true,
  },
  {
    label: "Квартал",
    forecast: 24_000_000,
    actual: 17_000_000,
    pct: 71,
    delta: "+8% к прошлому кварталу",
    deltaPositive: true,
  },
  {
    label: "Год",
    forecast: 96_000_000,
    actual: 55_000_000,
    pct: 57,
    delta: "Выполнено за 9 мес",
    deltaPositive: null,
  },
]

const PIPELINE_DEALS = [
  { id: "1", company: "ЗАО Капитал", amount: 2_100_000, manager: "АИ", probability: 85, closeDate: "31.03.2026", stage: "Согласование" },
  { id: "2", company: "ГК Вектор", amount: 1_200_000, manager: "АИ", probability: 70, closeDate: "05.04.2026", stage: "Переговоры" },
  { id: "3", company: "АО Альфа Ресурс", amount: 980_000, manager: "МП", probability: 60, closeDate: "07.04.2026", stage: "КП отправлено" },
  { id: "4", company: "ООО Техностар", amount: 850_000, manager: "АИ", probability: 90, closeDate: "29.03.2026", stage: "Согласование" },
  { id: "5", company: "ООО Горизонт", amount: 650_000, manager: "ДК", probability: 45, closeDate: "15.04.2026", stage: "Переговоры" },
  { id: "6", company: "ООО СтройГрупп", amount: 340_000, manager: "СН", probability: 30, closeDate: "20.04.2026", stage: "КП отправлено" },
]

const SCENARIOS = [
  {
    name: "Пессимистичный",
    probability: 25,
    amount: 5_200_000,
    color: "text-red-600",
    bg: "bg-red-500/10",
    icon: ArrowDown,
    description: "Закроются только сделки с высокой вероятностью",
  },
  {
    name: "Реалистичный",
    probability: 55,
    amount: 8_500_000,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    icon: Minus,
    description: "Базовый сценарий при текущей динамике",
  },
  {
    name: "Оптимистичный",
    probability: 20,
    amount: 12_800_000,
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    icon: ArrowUp,
    description: "Закроются все активные сделки в воронке",
  },
]

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${n} ₽`
}

function ProbabilityBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : pct >= 60 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    : pct >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
  return <Badge className={cn("text-xs border-0", color)}>{pct}%</Badge>
}

export default function SalesForecastsPage() {
  const weightedForecast = PIPELINE_DEALS.reduce((s, d) => s + d.amount * (d.probability / 100), 0)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Прогнозы продаж</h1>
                <p className="text-sm text-muted-foreground">Планы, сценарии и взвешенный pipeline</p>
              </div>
            </div>

            {/* Forecast Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {FORECAST_CARDS.map((card) => (
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
                      {/* Progress bar */}
                      <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            card.pct >= 80 ? "bg-emerald-500" : card.pct >= 60 ? "bg-amber-500" : "bg-red-400"
                          )}
                          style={{ width: `${Math.min(card.pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-xs font-semibold",
                          card.pct >= 80 ? "text-emerald-600" : card.pct >= 60 ? "text-amber-600" : "text-red-600"
                        )}>
                          {card.pct}% выполнения
                        </span>
                        {card.deltaPositive !== null && (
                          <span className={cn("text-xs", card.deltaPositive ? "text-emerald-600" : "text-muted-foreground")}>
                            {card.delta}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Trend note */}
            <div className="border rounded-xl p-4 bg-primary/5 border-primary/20 mb-6 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-primary shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">При текущей динамике:</span> +12% к прошлому месяцу.
                Взвешенный прогноз по pipeline: <span className="font-bold text-primary">{formatMoney(weightedForecast)}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pipeline Forecast */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Закроются в апреле
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {PIPELINE_DEALS.map((deal) => (
                      <div key={deal.id} className="flex items-center gap-3 px-4 py-3">
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{deal.manager}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{deal.company}</p>
                          <p className="text-xs text-muted-foreground">{deal.stage} · до {deal.closeDate}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ProbabilityBadge pct={deal.probability} />
                          <span className="text-sm font-semibold text-foreground w-20 text-right">
                            {formatMoney(deal.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Взвешенная сумма</span>
                      <span className="text-sm font-bold text-foreground">{formatMoney(weightedForecast)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scenarios */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Сценарии</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {SCENARIOS.map((scenario) => {
                      const Icon = scenario.icon
                      return (
                        <div key={scenario.name} className={cn("border rounded-xl p-4", scenario.bg)}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Icon className={cn("w-4 h-4", scenario.color)} />
                              <span className={cn("text-sm font-semibold", scenario.color)}>{scenario.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">P={scenario.probability}%</span>
                          </div>
                          <p className="text-xl font-bold text-foreground mb-1">{formatMoney(scenario.amount)}</p>
                          <p className="text-xs text-muted-foreground">{scenario.description}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Weighted expected value */}
                  <div className="mt-4 p-3 rounded-xl border bg-card">
                    <p className="text-xs text-muted-foreground mb-1">Математическое ожидание</p>
                    <p className="text-lg font-bold text-foreground">
                      {formatMoney(
                        SCENARIOS.reduce((s, sc) => s + sc.amount * (sc.probability / 100), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">с учётом вероятностей сценариев</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
