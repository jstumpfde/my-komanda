"use client"

import { useEffect, useState, type ReactNode, type ElementType } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import {
  Briefcase, Users, UserCheck, Clock, TrendingUp, Plus, ChevronRight,
  Sparkles, Activity, Calendar, BarChart3,
} from "lucide-react"
import { CandidatesProgressMiniTable } from "@/components/candidates/candidates-progress-mini-table"
import { Greeting } from "./_components/greeting"
import { AwaitingReviewBanner } from "./_components/awaiting-review-banner"

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  green: "#1D9E75",
  blue: "#378ADD",
  orange: "#D85A30",
  red: "#E24B4A",
  purple: "#7F77DD",
}

// ─── Funnel grouping ────────────────────────────────────────────────────────
// Этап → массив stage-кодов из candidates.stage, которые попадают в этот этап
// (кумулятивно: «Интервью» включает всех, кто на интервью или дальше).
// stage-коды берутся из комментария в lib/db/schema.ts → candidates.stage.

const FUNNEL_STAGES: { label: string; color: string; matches: string[] }[] = [
  {
    label: "Отклики",
    color: C.blue,
    matches: ["new", "primary_contact", "demo_opened", "demo", "anketa_filled", "ai_screening", "decision", "scheduled", "interview", "interviewed", "final_decision", "offer", "hired"],
  },
  {
    label: "Скрининг",
    color: C.purple,
    matches: ["demo_opened", "demo", "anketa_filled", "ai_screening", "decision", "scheduled", "interview", "interviewed", "final_decision", "offer", "hired"],
  },
  {
    label: "Интервью",
    color: C.green,
    matches: ["scheduled", "interview", "interviewed", "decision", "final_decision", "offer", "hired"],
  },
  {
    label: "Оффер",
    color: C.orange,
    matches: ["offer", "final_decision", "hired"],
  },
  {
    label: "Наняты",
    color: "#10b981",
    matches: ["hired"],
  },
]

// ─── API types ──────────────────────────────────────────────────────────────

interface VacancyRow {
  id: string
  title: string
  city: string | null
  slug: string | null
  salaryMin: number | null
  salaryMax: number | null
  status: string
  createdAt: string
  candidateCount: number
  decisionCount: number
}

interface DashboardStats {
  kpi: {
    activeVacancies: number
    totalCandidates: number
    candidatesInWork: number
    candidatesToday: number
    hiredThisMonth: number
    conversionRate: number
  }
  vacancies: VacancyRow[]
  funnel: {
    totals: Record<string, number>
    byVacancy: Record<string, Record<string, number>>
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

function getDateString(): string {
  const formatted = new Date().toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long",
  })
  return "Сегодня: " + formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

// ─── ComingSoon overlay ─────────────────────────────────────────────────────

function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none filter blur-[1px]">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-foreground/85 text-background text-[11px] font-medium px-3 py-1 shadow">
          Скоро
        </span>
      </div>
    </div>
  )
}

// ─── KPI Pill ───────────────────────────────────────────────────────────────

function KpiPill({ icon: Icon, label, value }: { icon: ElementType; label: string; value: number | null }) {
  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 inline-flex items-center gap-3 w-fit">
      <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground leading-none">{label}</span>
        <span className="text-2xl font-bold leading-tight mt-1">{value === null ? "…" : value}</span>
      </div>
    </div>
  )
}

// ─── Color metric card ──────────────────────────────────────────────────────

function Metric({
  icon: Icon, label, value, trend, bg,
}: {
  icon: ElementType; label: string; value: number | string; trend?: string; bg: string
}) {
  return (
    <div className={cn("rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 text-white", bg)}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {trend && <p className="text-sm mt-1 text-white/90">{trend}</p>}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/hr/dashboard/stats")
      .then(r => (r.ok ? r.json() : null))
      .then((d: DashboardStats | null) => {
        if (cancelled) return
        if (d && typeof d === "object" && "kpi" in d) setStats(d)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const kpi = stats?.kpi
  const vacancies = stats?.vacancies ?? []
  const funnelTotals = stats?.funnel?.totals ?? {}

  const funnel = FUNNEL_STAGES.map(s => ({
    label: s.label,
    color: s.color,
    count: s.matches.reduce((sum, key) => sum + (funnelTotals[key] ?? 0), 0),
  }))
  const funnelMax = Math.max(1, funnel[0]?.count ?? 0)
  const funnelEmpty = funnel.every(f => f.count === 0)

  // Header subtitle
  const headerSubtitle = (() => {
    if (!loaded) return "Загрузка данных…"
    if (!kpi) return "Не удалось загрузить данные"
    const today = kpi.candidatesToday ?? 0
    const inWork = kpi.candidatesInWork ?? 0
    if (today === 0 && inWork === 0 && vacancies.length === 0) {
      return "Сегодня пока нет новых данных"
    }
    const parts: string[] = []
    parts.push(`${today} новых ${today === 1 ? "отклик" : today >= 2 && today <= 4 ? "отклика" : "откликов"} сегодня`)
    if (vacancies.length > 0) {
      parts.push(`${vacancies.length} ${vacancies.length === 1 ? "вакансия" : vacancies.length >= 2 && vacancies.length <= 4 ? "вакансии" : "вакансий"} в работе`)
    }
    return parts.join(" · ")
  })()

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
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>{getDateString()}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{headerSubtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select disabled value="all">
                  <SelectTrigger className="h-8 w-[180px] text-xs" title="Скоро">
                    <SelectValue placeholder="Все вакансии" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все вакансии</SelectItem>
                  </SelectContent>
                </Select>
                <Select disabled value="month">
                  <SelectTrigger className="h-8 w-[140px] text-xs" title="Скоро">
                    <SelectValue placeholder="Период" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Этот месяц</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ═══ Greeting ═══ */}
            <Greeting />

            {/* ═══ Очередь HR (P0-8) ═══ */}
            <AwaitingReviewBanner />

            {/* ═══ KPI pills ═══ */}
            <div className="flex flex-wrap gap-3">
              <KpiPill icon={Briefcase} label="Активные вакансии" value={kpi?.activeVacancies ?? null} />
              <KpiPill icon={Users} label="Кандидатов сегодня" value={kpi?.candidatesToday ?? null} />
              <KpiPill icon={Users} label="Кандидатов в работе" value={kpi?.candidatesInWork ?? null} />
            </div>

            {/* ═══ AI Assistant — Скоро ═══ */}
            <ComingSoon>
              <div className="rounded-lg border bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4" style={{ color: C.purple }} />
                  <h2 className="text-sm font-semibold">AI-ассистент</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white dark:bg-gray-900 rounded-md p-3 h-20" />
                  ))}
                </div>
              </div>
            </ComingSoon>

            {/* ═══ 5 Metrics ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Metric icon={Briefcase} label="Активных вакансий" value={kpi?.activeVacancies ?? "—"} bg="bg-emerald-400" />
              <Metric icon={Users} label="Всего кандидатов" value={kpi?.totalCandidates ?? "—"} bg="bg-blue-400" />
              <Metric icon={UserCheck} label="Нанято за месяц" value={kpi?.hiredThisMonth ?? "—"} bg="bg-violet-600" />
              <Metric icon={Clock} label="Ср. время закрытия" value="—" trend="Скоро" bg="bg-orange-400" />
              <Metric icon={TrendingUp} label="Конверсия воронки" value={kpi ? `${kpi.conversionRate}%` : "—"} bg="bg-indigo-400" />
            </div>

            {/* ═══ Live progress widget ═══ */}
            <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4" style={{ color: C.green }} />
                  Прогресс кандидатов сейчас
                </h3>
                <Link
                  href="/hr/candidates"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Все <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <CandidatesProgressMiniTable limit={5} />
            </div>

            {/* ═══ Funnel + Active Vacancies ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Funnel */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Воронка найма</h3>
                {!loaded ? (
                  <div className="h-40" />
                ) : funnelEmpty ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Воронка пока пуста — кандидаты появятся когда начнётся работа с откликами.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {funnel.map((f, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{f.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{f.count}</span>
                            {i > 0 && funnel[i - 1].count > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {Math.round((f.count / funnel[i - 1].count) * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-7 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(f.count / funnelMax) * 100}%`, backgroundColor: f.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Vacancies */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Активные вакансии</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push("/hr/vacancies?create=true")}>
                    <Plus className="w-3 h-3" />Новая
                  </Button>
                </div>
                {!loaded ? (
                  <div className="h-40" />
                ) : vacancies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <Briefcase className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Пока нет активных вакансий</p>
                    <Button size="sm" variant="outline" className="gap-1 mt-1" onClick={() => router.push("/hr/vacancies/new")}>
                      <Plus className="w-3 h-3" />Создать вакансию
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vacancies.slice(0, 5).map(v => (
                      <button
                        key={v.id}
                        className="w-full text-left rounded-md border p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                        onClick={() => router.push(`/hr/vacancies/${v.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{v.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {v.city ?? "—"} · {daysSince(v.createdAt)} дн
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="secondary" className="text-[10px] h-5">{v.candidateCount} откл.</Badge>
                          {v.decisionCount > 0 && (
                            <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-0">
                              {v.decisionCount} фин.
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ═══ Efficiency + Events ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Efficiency — реальное */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold">Эффективность по вакансиям</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Сколько откликов дошло до этапа «Решение» / всего откликов
                </p>
                {!loaded ? (
                  <div className="h-40" />
                ) : vacancies.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Появится после публикации вакансий
                  </p>
                ) : (
                  <div className="space-y-4">
                    {vacancies.slice(0, 5).map(v => {
                      const total = v.candidateCount || 0
                      const done = v.decisionCount || 0
                      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
                      const barColor = pct >= 50 ? C.green : pct >= 20 ? C.blue : C.orange
                      const tooltip = `Дошло до решения: ${done} из ${total} откликов${total > 0 ? ` (${pct}%)` : ""}`
                      return (
                        <div key={v.id}>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <span className="text-xs font-medium truncate">{v.title}</span>
                            <span
                              className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
                              title={tooltip}
                            >
                              {done}/{total} <span className="text-muted-foreground/70">решений</span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden" title={tooltip}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Events — Скоро */}
              <ComingSoon>
                <div className="border rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Ближайшие события</h3>
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-12 bg-muted/30 rounded-lg" />
                    ))}
                  </div>
                </div>
              </ComingSoon>
            </div>

            {/* ═══ Goals + Sources — Скоро ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ComingSoon>
                <div className="border rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Цели месяца</h3>
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i}>
                        <div className="h-3 bg-muted/30 rounded w-1/2 mb-2" />
                        <div className="h-2.5 bg-muted/30 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </ComingSoon>

              <ComingSoon>
                <div className="border rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Источники откликов</h3>
                  <div className="flex items-center gap-6">
                    <div className="w-[140px] h-[140px] shrink-0 rounded-full bg-muted/30" />
                    <div className="space-y-2 flex-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-muted/50" />
                          <div className="h-3 bg-muted/30 rounded flex-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ComingSoon>
            </div>

            {/* ═══ Dynamics — Скоро ═══ */}
            <ComingSoon>
              <div className="border rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Динамика за период</h3>
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="h-[250px] bg-muted/20 rounded-md" />
              </div>
            </ComingSoon>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function HRDashboardPage() {
  return <DashboardContent />
}
