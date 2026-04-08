"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import {
  Briefcase, Users, UserCheck, Clock, TrendingUp, Plus, ChevronRight,
  AlertCircle, CheckCircle2, Timer, Star, Calendar, Sparkles,
} from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ComposedChart,
} from "recharts"

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  green: "#1D9E75",
  blue: "#378ADD",
  orange: "#D85A30",
  red: "#E24B4A",
  purple: "#7F77DD",
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_VACANCIES = [
  { id: "1", title: "Менеджер по продажам", city: "Москва", responses: 142, finalists: 5, daysOpen: 12, status: "on_track" as const },
  { id: "2", title: "Frontend-разработчик", city: "Удалённо", responses: 85, finalists: 3, daysOpen: 18, status: "ahead" as const },
  { id: "3", title: "HR-менеджер", city: "Москва", responses: 24, finalists: 0, daysOpen: 28, status: "behind" as const },
  { id: "4", title: "Бухгалтер", city: "СПб", responses: 38, finalists: 2, daysOpen: 8, status: "on_track" as const },
]

const FUNNEL = [
  { stage: "Отклики", count: 445, color: C.blue },
  { stage: "Скрининг", count: 198, color: C.purple },
  { stage: "Интервью", count: 87, color: C.green },
  { stage: "Оффер", count: 24, color: C.orange },
  { stage: "Наняты", count: 12, color: "#10b981" },
]

const EVENTS = [
  { day: "8", month: "апр", title: "Интервью: Петров А.", subtitle: "14:00 · Менеджер по продажам · Zoom", type: "interview" as const },
  { day: "8", month: "апр", title: "Скрининг: Иванова М.", subtitle: "16:30 · Frontend · Телефон", type: "screening" as const },
  { day: "9", month: "апр", title: "Финальное интервью: Козлов Д.", subtitle: "10:00 · Менеджер по продажам · Офис", type: "interview" as const },
  { day: "9", month: "апр", title: "Оффер-колл: Сидорова К.", subtitle: "15:00 · Frontend", type: "offer" as const },
  { day: "10", month: "апр", title: "Выход: Новиков П.", subtitle: "Первый рабочий день · HR-менеджер", type: "onboarding" as const },
]

const EVENT_COLORS: Record<string, string> = {
  interview: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  screening: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  offer: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  onboarding: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
}

const GOALS = [
  { label: "Закрыть вакансий", current: 3, target: 5 },
  { label: "Среднее время закрытия", current: 18, target: 14, unit: "дн", inverted: true },
  { label: "Конверсия воронки", current: 12, target: 15, unit: "%" },
  { label: "Провести интервью", current: 22, target: 30 },
]

const SOURCES_PIE = [
  { name: "hh.ru", value: 62, color: "#3b82f6" },
  { name: "Telegram", value: 18, color: "#8b5cf6" },
  { name: "Рефералы", value: 12, color: C.green },
  { name: "Сайт", value: 8, color: "#f59e0b" },
]

const DYNAMICS_30D = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  responses: Math.round(8 + Math.random() * 20 + (i > 15 ? 5 : 0)),
  interviews: Math.round(2 + Math.random() * 6),
  offers: Math.round(Math.random() * 3),
}))

const AI_HINTS = [
  { icon: AlertCircle, color: C.red, bg: "bg-red-50 dark:bg-red-950/30", title: "HR-менеджер: мало откликов", desc: "28 дней без финалистов. Рекомендую пересмотреть требования.", action: "Подробнее" },
  { icon: CheckCircle2, color: C.green, bg: "bg-emerald-50 dark:bg-emerald-950/30", title: "2 кандидата готовы к офферу", desc: "Петров и Сидорова прошли все этапы по Frontend-вакансии.", action: "Подробнее" },
  { icon: Timer, color: C.orange, bg: "bg-amber-50 dark:bg-amber-950/30", title: "Оффер ждёт ответа 3 дня", desc: "Козлов Д. — Менеджер по продажам. Срок ответа истекает завтра.", action: "Подробнее" },
  { icon: Star, color: C.purple, bg: "bg-purple-50 dark:bg-purple-950/30", title: "Talent Pool: 5 кандидатов прогрелись", desc: "Ранее отклонённые кандидаты проявили активность.", action: "Подробнее" },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

const tooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }

// ─── Page ───────────────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [vacancyFilter, setVacancyFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("month")
  const [dynamicsPeriod, setDynamicsPeriod] = useState<"7" | "30" | "90">("30")

  const dynamicsData = dynamicsPeriod === "7" ? DYNAMICS_30D.slice(-7) : dynamicsPeriod === "90" ? DYNAMICS_30D : DYNAMICS_30D

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-5" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* ═══ Header ═══ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold">{getGreeting()}, {user.name.split(" ")[0]}!</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Сегодня 3 интервью · 24 новых отклика · {MOCK_VACANCIES.length} вакансий в работе
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
                  <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все вакансии</SelectItem>
                    {MOCK_VACANCIES.map(v => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Эта неделя</SelectItem>
                    <SelectItem value="month">Этот месяц</SelectItem>
                    <SelectItem value="quarter">Квартал</SelectItem>
                    <SelectItem value="year">Год</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ═══ Block 1: AI Assistant ═══ */}
            <div className="rounded-lg border bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: C.purple }} />
                <h2 className="text-sm font-semibold">AI-ассистент</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {AI_HINTS.map((h, i) => (
                  <div key={i} className="bg-white dark:bg-gray-900 rounded-md p-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", h.bg)}>
                        <h.icon className="w-3.5 h-3.5" style={{ color: h.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight text-foreground/85">{h.title}</p>
                        <p className="text-[13px] text-foreground/65 mt-0.5 leading-snug">{h.desc}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs font-medium self-end gap-1 text-foreground/70">
                      {h.action}<ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ Block 2: 5 Metrics ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Активных вакансий", value: "4", trend: "+2 за неделю", icon: Briefcase, bg: "bg-emerald-400" },
                { label: "Всего кандидатов", value: "445", trend: "+68 за неделю", icon: Users, bg: "bg-blue-400" },
                { label: "Нанято за месяц", value: "3", trend: "цель: 5", icon: UserCheck, bg: "bg-violet-600" },
                { label: "Ср. время закрытия", value: "18 дн", trend: "цель: 14 дн", icon: Clock, bg: "bg-orange-400" },
                { label: "Конверсия воронки", value: "12%", trend: "цель: 15%", icon: TrendingUp, bg: "bg-indigo-400" },
              ].map((m, i) => (
                <div key={i} className={cn("rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 text-white", m.bg)}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <m.icon className="w-4 h-4 text-white" />
                    <span className="text-sm font-semibold text-white">{m.label}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{m.value}</p>
                  <p className="text-sm mt-1 text-white/90">{m.trend}</p>
                </div>
              ))}
            </div>

            {/* ═══ Block 3: Funnel + Active Vacancies ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Funnel */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Воронка найма</h3>
                <div className="space-y-2">
                  {FUNNEL.map((f, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{f.stage}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{f.count}</span>
                          {i > 0 && <span className="text-[10px] text-muted-foreground">{Math.round((f.count / FUNNEL[i - 1].count) * 100)}%</span>}
                        </div>
                      </div>
                      <div className="h-7 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(f.count / FUNNEL[0].count) * 100}%`, backgroundColor: f.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Vacancies */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Активные вакансии</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push("/hr/vacancies?create=true")}>
                    <Plus className="w-3 h-3" />Новая
                  </Button>
                </div>
                <div className="space-y-2">
                  {MOCK_VACANCIES.map(v => (
                    <button
                      key={v.id}
                      className="w-full text-left rounded-md border p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                      onClick={() => router.push(`/hr/vacancies/${v.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{v.title}</p>
                        <p className="text-[11px] text-muted-foreground">{v.city} · {v.daysOpen} дн</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="text-[10px] h-5">{v.responses} откл.</Badge>
                        {v.finalists > 0 && <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-0">{v.finalists} фин.</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ═══ Block 4: Efficiency + Events ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Efficiency */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Эффективность по вакансиям</h3>
                <div className="space-y-4">
                  {MOCK_VACANCIES.map(v => {
                    const statusMap = {
                      ahead: { label: "Опережает", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", barColor: C.green },
                      on_track: { label: "В графике", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", barColor: C.blue },
                      behind: { label: "Отстаёт", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", barColor: C.red },
                    }
                    const s = statusMap[v.status]
                    const pct = Math.min(100, Math.round((v.finalists / Math.max(1, v.responses)) * 100 * 10))
                    return (
                      <div key={v.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium">{v.title}</span>
                          <span className={cn("text-[10px] font-medium rounded-full px-3 py-0.5", s.badge)}>{s.label}</span>
                        </div>
                        <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.barColor }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Events */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Ближайшие события</h3>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push("/hr/calendar")}>
                    <Calendar className="w-3 h-3" />Календарь
                  </Button>
                </div>
                <div className="flex flex-col gap-3">
                  {EVENTS.map((e, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={cn("min-w-[48px] text-center rounded-lg p-1.5", EVENT_COLORS[e.type] || EVENT_COLORS.interview)}>
                        <p className="text-lg font-semibold leading-none">{e.day}</p>
                        <p className="text-[10px] mt-0.5">{e.month}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{e.subtitle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ═══ Block 5: Goals + Sources ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Goals */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Цели месяца</h3>
                <div className="space-y-4">
                  {GOALS.map((g, i) => {
                    const pct = g.inverted
                      ? Math.min(100, Math.round((g.target / Math.max(1, g.current)) * 100))
                      : Math.min(100, Math.round((g.current / Math.max(1, g.target)) * 100))
                    const barColor = pct >= 80 ? C.green : pct >= 50 ? C.blue : C.orange
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs">{g.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{g.current}{g.unit || ""} / {g.target}{g.unit || ""}</span>
                            <span className="text-[10px] font-medium" style={{ color: barColor }}>{pct}%</span>
                          </div>
                        </div>
                        <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Sources donut */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Источники откликов</h3>
                <div className="flex items-center gap-6">
                  <div className="w-[140px] h-[140px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={SOURCES_PIE} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={2} strokeWidth={0}>
                          {SOURCES_PIE.map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">
                    {SOURCES_PIE.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-xs flex-1">{s.name}</span>
                        <span className="text-xs font-medium">{s.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Block 6: Dynamics Chart ═══ */}
            <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Динамика за период</h3>
                <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                  {(["7", "30", "90"] as const).map(p => (
                    <button
                      key={p}
                      className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors", dynamicsPeriod === p ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => setDynamicsPeriod(p)}
                    >
                      {p} дн
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dynamicsData}>
                    <defs>
                      <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.blue} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.purple} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={C.purple} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.green} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="responses" fill="url(#gradBlue)" stroke="none" />
                    <Area type="monotone" dataKey="interviews" fill="url(#gradPurple)" stroke="none" />
                    <Area type="monotone" dataKey="offers" fill="url(#gradGreen)" stroke="none" />
                    <Line type="monotone" dataKey="responses" stroke={C.blue} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} name="Отклики" />
                    <Line type="monotone" dataKey="interviews" stroke={C.purple} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} name="Интервью" />
                    <Line type="monotone" dataKey="offers" stroke={C.green} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} name="Офферы" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3">
                {[
                  { label: "Отклики", color: C.blue },
                  { label: "Интервью", color: C.purple },
                  { label: "Офферы", color: C.green },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-1 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="text-[11px] text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function HRDashboardPage() {
  return <DashboardContent />
}
