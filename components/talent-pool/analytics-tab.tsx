"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Users, UserPlus, TrendingUp, Clock, Sparkles } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"

// ─── KPI ───────────────────────────────────────────────
const ANALYTICS_KPI = [
  { label: "В пуле", value: "47", icon: Users, color: "text-blue-600" },
  { label: "Новых за месяц", value: "+12", icon: UserPlus, color: "text-emerald-600" },
  { label: "Конверсия в найм", value: "8.5%", icon: TrendingUp, color: "text-purple-600" },
  { label: "Ср. время в пуле", value: "45 дн", icon: Clock, color: "text-amber-600" },
]

// ─── AreaChart data (6 months) ─────────────────────────
const DYNAMICS_DATA = [
  { month: "Окт", added: 8, hired: 1, lost: 2 },
  { month: "Ноя", added: 11, hired: 2, lost: 3 },
  { month: "Дек", added: 6, hired: 1, lost: 1 },
  { month: "Янв", added: 14, hired: 3, lost: 4 },
  { month: "Фев", added: 9, hired: 2, lost: 2 },
  { month: "Мар", added: 12, hired: 4, lost: 3 },
]

// ─── PieChart data (sources) ──────────────────────────
const SOURCES_DATA = [
  { name: "hh.ru", value: 35, color: "#6366f1" },
  { name: "LinkedIn", value: 25, color: "#06b6d4" },
  { name: "Рефералы", value: 20, color: "#f59e0b" },
  { name: "Конференции", value: 12, color: "#10b981" },
  { name: "Прямой поиск", value: 8, color: "#ef4444" },
]

// ─── Scoring by source ────────────────────────────────
const SCORING_BY_SOURCE = [
  { source: "Рефералы", score: 74, color: "bg-amber-500" },
  { source: "LinkedIn", score: 68, color: "bg-cyan-500" },
  { source: "Конференции", score: 65, color: "bg-emerald-500" },
  { source: "hh.ru", score: 52, color: "bg-indigo-500" },
  { source: "Прямой поиск", score: 48, color: "bg-red-500" },
]

// ─── Funnel ───────────────────────────────────────────
const FUNNEL_DATA = [
  { stage: "В пуле", count: 47, pct: "100%" },
  { stage: "Контакт установлен", count: 32, pct: "68%" },
  { stage: "В прогреве", count: 18, pct: "38%" },
  { stage: "Заинтересован", count: 11, pct: "23%" },
  { stage: "На интервью", count: 7, pct: "15%" },
  { stage: "Нанят", count: 4, pct: "8.5%" },
]

export function AnalyticsTab() {
  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ANALYTICS_KPI.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={cn("w-4 h-4", kpi.color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AreaChart — динамика */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Динамика пула за 6 месяцев</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={DYNAMICS_DATA}>
                <defs>
                  <linearGradient id="addedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hiredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lostGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="added" name="Добавлено" stroke="#6366f1" fill="url(#addedGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="hired" name="Нанято" stroke="#10b981" fill="url(#hiredGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="lost" name="Потеряно" stroke="#ef4444" fill="url(#lostGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* PieChart — источники */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Источники кандидатов</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={SOURCES_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name} ${value}%`}
                  style={{ fontSize: 11 }}
                >
                  {SOURCES_DATA.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Скоринг по источникам */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Средний скоринг по источникам</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SCORING_BY_SOURCE.map((s) => (
              <div key={s.source} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">{s.source}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", s.color)} style={{ width: `${s.score}%` }} />
                </div>
                <span className="text-sm font-bold w-8 text-right">{s.score}</span>
              </div>
            ))}
            <div className="flex items-start gap-2 mt-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900/30">
              <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">AI-инсайт</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Рефералы показывают лучший скоринг (74) и быстрее конвертируются в найм.
                  Рекомендуем увеличить бонус реферальной программы для привлечения большего числа рекомендаций.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Воронка прогрева */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Воронка прогрева</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {FUNNEL_DATA.map((step, i) => {
                const maxCount = FUNNEL_DATA[0].count
                const pctNum = (step.count / maxCount) * 100
                return (
                  <div key={step.stage} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-36 shrink-0">{step.stage}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${pctNum}%`,
                          backgroundColor: `hsl(${250 - i * 30}, 70%, ${55 + i * 5}%)`,
                        }}
                      />
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
              <Badge variant="secondary" className="font-bold">8.5%</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
