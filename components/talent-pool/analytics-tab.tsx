"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Users, UserPlus, TrendingUp, Clock, Sparkles, Loader2 } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

interface AnalyticsData {
  kpi: { pool: number; newThisMonth: number; conversion: number; avgDays: number }
  sources: { name: string; value: number; color: string }[]
  scoringBySource: { source: string; score: number; color: string }[]
  dynamics: { month: string; added: number; hired: number; lost: number }[]
  funnel: { stage: string; count: number; pct: string }[]
}

export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/modules/hr/talent-pool/analytics")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.kpi) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="text-center py-16 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка аналитики…</div>
  }

  const kpi = data?.kpi ?? { pool: 0, newThisMonth: 0, conversion: 0, avgDays: 0 }
  const sources = data?.sources ?? []
  const scoringBySource = data?.scoringBySource ?? []
  const dynamics = data?.dynamics ?? []
  const funnel = data?.funnel ?? []
  const empty = kpi.pool === 0

  const kpiCards = [
    { label: "В пуле", value: String(kpi.pool), icon: Users, color: "text-blue-600" },
    { label: "Новых за месяц", value: `+${kpi.newThisMonth}`, icon: UserPlus, color: "text-emerald-600" },
    { label: "Конверсия в найм", value: `${kpi.conversion}%`, icon: TrendingUp, color: "text-purple-600" },
    { label: "Ср. время в пуле", value: `${kpi.avgDays} дн`, icon: Clock, color: "text-amber-600" },
  ]

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <k.icon className={cn("w-4 h-4", k.color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1", k.color)}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {empty && (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
          Пул пока пуст — добавьте кандидатов в «Базе», и аналитика заполнится реальными данными.
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Динамика */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Динамика пула за 6 месяцев</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dynamics}>
                <defs>
                  <linearGradient id="addedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hiredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="added" name="Добавлено" stroke="#6366f1" fill="url(#addedGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="hired" name="Нанято" stroke="#10b981" fill="url(#hiredGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Источники */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Источники кандидатов</CardTitle></CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">Нет данных</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={sources} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}
                    dataKey="value" label={({ name, value }) => `${name} ${value}%`} style={{ fontSize: 11 }}>
                    {sources.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Скоринг по источникам */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Средний скоринг по источникам</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {scoringBySource.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Нет данных</p>
            ) : scoringBySource.map((s) => (
              <div key={s.source} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{s.source}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", s.color)} style={{ width: `${s.score}%` }} />
                </div>
                <span className="text-sm font-bold w-8 text-right">{s.score}</span>
              </div>
            ))}
            {scoringBySource.length > 0 && (
              <div className="flex items-start gap-2 mt-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900/30">
                <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI-инсайт</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Лучший средний скоринг — у источника «{scoringBySource[0]?.source}» ({scoringBySource[0]?.score}).
                    Стоит наращивать приток кандидатов из него.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Воронка прогрева */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Воронка прогрева</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnel.map((step, i) => {
                const maxCount = funnel[0]?.count || 1
                const pctNum = (step.count / maxCount) * 100
                return (
                  <div key={step.stage} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-36 shrink-0">{step.stage}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                      <div className="h-full rounded transition-all"
                        style={{ width: `${pctNum}%`, backgroundColor: `hsl(${250 - i * 30}, 70%, ${55 + i * 5}%)` }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">
                        {step.count} ({step.pct})
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-xs font-medium">Общая конверсия пула → найм</span>
              <Badge variant="secondary" className="font-bold">{kpi.conversion}%</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
