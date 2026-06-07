"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getOnboarding, isOnboardingComplete, remainingSteps } from "@/lib/onboarding"
import Link from "next/link"
import {
  Users, UserCheck, Calendar, AlertTriangle, ArrowRight,
  Rocket, Clock, Briefcase, Loader2, LayoutDashboard,
} from "lucide-react"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface HrStats {
  kpi: {
    activeVacancies:  number
    totalCandidates:  number
    candidatesInWork: number
    candidatesToday:  number
    hiredThisMonth:   number
    conversionRate:   number
  }
  vacancies: Array<{
    id:             string
    title:          string
    candidateCount: number
  }>
  funnel: {
    totals:    Record<string, number>
    byVacancy: Record<string, Record<string, number>>
  }
}

interface ActivityItem {
  id:          string
  action:      string
  entityType:  string
  entityId:    string | null
  entityTitle: string | null
  module:      string | null
  details:     Record<string, unknown> | null
  createdAt:   string | null
  userId:      string | null
  userName:    string | null
}

// ─── Стадии воронки (по real-enum, см. lib/db/schema.ts:380) ──────────────────

const FUNNEL_STAGES: Array<{ key: string; label: string; color: string }> = [
  { key: "new",         label: "Нов",  color: "#22d3ee" },
  { key: "demo",        label: "Демо", color: "#3b82f6" },
  { key: "scheduled",   label: "Назн", color: "#8b5cf6" },
  { key: "interviewed", label: "Инт",  color: "#f59e0b" },
  { key: "hired",       label: "Нан",  color: "#22c55e" },
]

// ─── Эмодзи для activity feed ─────────────────────────────────────────────────
// Карта по (action, entityType). Если пары нет — fallback по action,
// если и его нет — default-точка.

function actionEmoji(a: Pick<ActivityItem, "action" | "entityType">): string {
  const key = `${a.action}:${a.entityType}`
  const map: Record<string, string> = {
    "create:candidate":  "🟢",
    "update:candidate":  "🔵",
    "delete:candidate":  "🗑️",
    "create:vacancy":    "📋",
    "update:vacancy":    "✏️",
    "delete:vacancy":    "🗑️",
    "ai_request:vacancy": "⚡",
    "ai_request:candidate": "⚡",
  }
  if (map[key]) return map[key]
  if (a.action === "hired")   return "✅"
  if (a.action === "rejected") return "🔴"
  if (a.action === "ai_request") return "⚡"
  if (a.action === "create") return "🟢"
  if (a.action === "update") return "🔵"
  if (a.action === "delete") return "🗑️"
  return "•"
}

function actionLabel(a: ActivityItem): string {
  const who = a.userName ?? "Кто-то"
  const what = a.entityTitle ?? a.entityType
  const verbs: Record<string, string> = {
    create:      "создал",
    update:      "обновил",
    delete:      "удалил",
    hired:       "нанят",
    rejected:    "отклонён",
    ai_request:  "запросил AI для",
  }
  const v = verbs[a.action] ?? a.action
  return `${who} ${v} ${what}`
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return "Доброй ночи"
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

function formatDate(): string {
  return new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
}

function formatTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}

// Имя из session: берём первое слово (имя), чтобы поприветствовать.
function firstName(full: string | null | undefined): string {
  if (!full) return ""
  const first = full.trim().split(/\s+/)[0]
  return first || ""
}

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: session } = useSession()

  const [obRemaining, setObRemaining] = useState(0)
  const [obDone, setObDone] = useState(true)

  const [stats, setStats] = useState<HrStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    const ob = getOnboarding()
    setObDone(isOnboardingComplete(ob))
    setObRemaining(remainingSteps(ob))
  }, [])

  useEffect(() => {
    fetch("/api/modules/hr/dashboard/stats")
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: HrStats) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))

    fetch("/api/activity-log?limit=7&page=1")
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: { items?: ActivityItem[] }) => setActivity(Array.isArray(data.items) ? data.items : []))
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false))
  }, [])

  const name = firstName(session?.user?.name)

  const kpiCandidatesToday = stats?.kpi.candidatesToday ?? 0
  const kpiCandidatesInWork = stats?.kpi.candidatesInWork ?? 0
  const kpiHiredThisMonth = stats?.kpi.hiredThisMonth ?? 0
  // Интервью сегодня: endpoint отсутствует — показываем 0 (compromise #4)
  const kpiInterviewsToday = 0

  const kpi = [
    { label: "Новых откликов",       value: kpiCandidatesToday,  sub: "за сегодня",        icon: Users,          color: "text-blue-600 bg-blue-500/10" },
    { label: "Ожидают решения HR",   value: kpiCandidatesInWork, sub: "требуют внимания",  icon: AlertTriangle,  color: "text-red-600 bg-red-500/10", alert: kpiCandidatesInWork > 0 },
    { label: "Интервью сегодня",     value: kpiInterviewsToday,  sub: "—",                  icon: Calendar,       color: "text-purple-600 bg-purple-500/10" },
    { label: "Нанято за месяц",      value: kpiHiredThisMonth,   sub: "",                   icon: UserCheck,      color: "text-emerald-600 bg-emerald-500/10" },
  ]

  // Attention deriv: если кто-то ждёт решения — кнопка ведёт на канд.
  const attentionItems: Array<{ text: string; href: string; cta: string }> = []
  if (kpiCandidatesInWork > 0) {
    attentionItems.push({
      text: `${kpiCandidatesInWork} кандидатов ждут решения`,
      href: "/hr/vacancies",
      cta: "Посмотреть",
    })
  }
  if (kpiInterviewsToday > 0) {
    attentionItems.push({
      text: `${kpiInterviewsToday} интервью сегодня`,
      href: "/interviews",
      cta: "Расписание",
    })
  }

  // Топ-3 вакансии по числу кандидатов, исключая пустые.
  const topVacancies = (stats?.vacancies ?? [])
    .filter(v => v.candidateCount > 0)
    .sort((a, b) => b.candidateCount - a.candidateCount)
    .slice(0, 3)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Greeting */}
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <LayoutDashboard className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">
                  {getGreeting()}{name ? `, ${name}` : ""}! ☀️
                </h1>
              </div>
              <p className="text-muted-foreground text-sm capitalize">{formatDate()}</p>
            </div>

            {/* Onboarding banner */}
            {!obDone && obRemaining > 0 && (
              <div className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <Rocket className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Настройте платформу: осталось {obRemaining} {obRemaining === 1 ? "шаг" : obRemaining < 5 ? "шага" : "шагов"}</p>
                    <p className="text-xs text-muted-foreground">Завершите настройку для максимума от Company24</p>
                  </div>
                </div>
                <Button size="sm" asChild><Link href="/register">Продолжить</Link></Button>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {kpi.map(k => (
                <Card key={k.label} className={cn(k.alert && "border-red-200 dark:border-red-800")}>
                  <CardContent className="p-4">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", k.color)}>
                      <k.icon className="w-4 h-4" />
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {statsLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : k.value}
                      </span>
                      {k.alert && <Badge className="bg-red-500 text-white text-[10px] animate-pulse mb-1">!</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                    {k.sub && <p className="text-[10px] text-muted-foreground/70">{k.sub}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column — attention + vacancies */}
              <div className="lg:col-span-2 space-y-6">
                {/* Attention block */}
                {attentionItems.length > 0 && (
                  <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4" /> Требуют внимания
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {attentionItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-card border">
                          <span className="text-sm text-foreground">{item.text}</span>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" asChild>
                            <Link href={item.href}>{item.cta} <ArrowRight className="w-3 h-3" /></Link>
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Top vacancies funnel */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="w-4 h-4" /> Сводная воронка — топ вакансии
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {statsLoading ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : topVacancies.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Нет вакансий с кандидатами</p>
                    ) : (
                      topVacancies.map(v => {
                        const perStage = stats?.funnel.byVacancy[v.id] ?? {}
                        return (
                          <div key={v.id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">{v.title}</span>
                              <Badge variant="secondary" className="text-xs">{v.candidateCount} чел</Badge>
                            </div>
                            <div className="flex gap-1 h-6">
                              {FUNNEL_STAGES.map(stage => {
                                const cnt = perStage[stage.key] ?? 0
                                if (cnt === 0) return null
                                return (
                                  <div
                                    key={stage.key}
                                    className="rounded flex items-center justify-center text-white text-[10px] font-bold"
                                    style={{ backgroundColor: stage.color, flex: cnt }}
                                    title={`${stage.label}: ${cnt}`}
                                  >
                                    {cnt}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right column — activity feed */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Последняя активность
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {activityLoading ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Пока нет активности</p>
                  ) : (
                    activity.map(a => (
                      <div key={a.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                        <span className="text-base mt-0.5 shrink-0">{actionEmoji(a)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">{actionLabel(a)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{formatTime(a.createdAt)}</span>
                            {a.module && <span className="text-[10px] text-muted-foreground">· {a.module}</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
