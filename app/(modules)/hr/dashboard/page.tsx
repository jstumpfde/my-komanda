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
  Briefcase, Users, UserCheck, TrendingUp, Plus, ChevronRight,
  Sparkles, Activity, Calendar,
} from "lucide-react"
import { CandidatesProgressMiniTable } from "@/components/candidates/candidates-progress-mini-table"
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
  inProgressCount?: number
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

// #31: time-aware приветствие в Москве, единый источник правды.
// 4 варианта: ночь (0-4) / утро (5-11) / день (12-17) / вечер (18-23).
function getGreeting(): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date())
  const hourStr = parts.find(p => p.type === "hour")?.value ?? "0"
  const h = (parseInt(hourStr, 10) || 0) % 24
  if (h <= 4) return "Доброй ночи"
  if (h <= 11) return "Доброе утро"
  if (h <= 17) return "Добрый день"
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

// #47: ключ для localStorage. Сохраняем { name, savedAt } чтобы при первом
// рендере страницы (до прихода session) сразу показать имя из прошлого захода.
const HR_USER_CACHE_KEY = "hr_user_cache"

interface HrUserCache {
  name: string
  savedAt: number
}

function readHrUserCache(): HrUserCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(HR_USER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HrUserCache>
    if (typeof parsed.name === "string" && parsed.name.length > 0) {
      return { name: parsed.name, savedAt: parsed.savedAt ?? 0 }
    }
  } catch {}
  return null
}

function DashboardContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  // #30: фильтр по вакансии. "all" = показывать всё (default).
  const [selectedVacancyId, setSelectedVacancyId] = useState<string>("all")
  // #47: имя из localStorage для мгновенного первого рендера. Заменяется на
  // user.name как только сессия подтянулась.
  const [cachedName, setCachedName] = useState<string>("")

  useEffect(() => {
    const c = readHrUserCache()
    if (c) setCachedName(c.name)
  }, [])

  // #47: когда сессия загрузилась — сохранить актуальное имя в localStorage,
  // чтобы при следующем заходе оно было сразу.
  useEffect(() => {
    if (!user.name) return
    if (typeof window === "undefined") return
    try {
      const current = readHrUserCache()
      if (current?.name !== user.name) {
        localStorage.setItem(HR_USER_CACHE_KEY, JSON.stringify({ name: user.name, savedAt: Date.now() }))
      }
    } catch {}
  }, [user.name])

  useEffect(() => {
    let cancelled = false
    // #49: при изменении фильтра — перезагружаем счётчики с ?vacancyId=
    const qs = selectedVacancyId !== "all" ? `?vacancyId=${encodeURIComponent(selectedVacancyId)}` : ""
    setLoaded(false)
    fetch(`/api/modules/hr/dashboard/stats${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: DashboardStats | null) => {
        if (cancelled) return
        if (d && typeof d === "object" && "kpi" in d) setStats(d)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [selectedVacancyId])

  // #47: эффективное имя — реальное user.name из сессии, иначе из кеша.
  const effectiveName = user.name || cachedName

  const kpi = stats?.kpi
  const vacancies = stats?.vacancies ?? []
  // #30: если выбрана конкретная вакансия — используем её срез из byVacancy,
  // иначе общий totals.
  const funnelTotals = (() => {
    if (selectedVacancyId !== "all" && stats?.funnel?.byVacancy?.[selectedVacancyId]) {
      return stats.funnel.byVacancy[selectedVacancyId]
    }
    return stats?.funnel?.totals ?? {}
  })()

  const funnel = FUNNEL_STAGES.map(s => ({
    label: s.label,
    color: s.color,
    count: s.matches.reduce((sum, key) => sum + (funnelTotals[key] ?? 0), 0),
  }))
  const funnelMax = Math.max(1, funnel[0]?.count ?? 0)
  const funnelEmpty = funnel.every(f => f.count === 0)

  // Header subtitle
  const headerSubtitle = (() => {
    // #29: не показываем «Загрузка» — оставляем подзаголовок пустым до
    // прихода данных, чтобы первый рендер был спокойным.
    if (!loaded) return ""
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

            {/* ═══ Header ═══
                #29: имя из SSR-сессии. Если пустое (первый mount) — показываем
                просто «{приветствие}!» без имени, чтобы не пугать «Загрузка».
                #31: убран дублирующий <Greeting /> ниже (он рендерил то же
                самое второй раз).
                #32: убран фильтр «Этот месяц» — Юрий говорит непонятно что
                он фильтрует. Фильтр «Все вакансии» теперь стоит в правом
                верхнем углу один, как просили. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold">
                  {effectiveName
                    ? `${getGreeting()}, ${effectiveName.split(" ")[0]}!`
                    : `${getGreeting()}!`}
                </h1>
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>{getDateString()}</p>
                {headerSubtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{headerSubtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* #30: активирован фильтр вакансий. По умолчанию "all" —
                    показываем все. При выборе одной — фильтруем клиентскую
                    voronku/active-vacancies по vacancyId. */}
                <Select value={selectedVacancyId} onValueChange={setSelectedVacancyId}>
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder="Все вакансии" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все вакансии</SelectItem>
                    {vacancies.map(v => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ═══ Очередь HR (P0-8) ═══ */}
            <AwaitingReviewBanner />

            {/* ═══ KPI pills — #50/#51 ═══
                Раньше было 2 ряда (KpiPill + Metric цветной), путано.
                Юрий: один ряд понятных метрик, реагируют на фильтр вакансии.
                «Кандидатов сегодня» → «Откликов сегодня» (это hh-отклики
                за день). «Кандидатов в работе» → «Прошли демо» (count
                stage IN demo_opened+, см. /api/.../stats #49). Убраны
                «Ср. время закрытия» (Скоро-плейсхолдер) и «Всего
                кандидатов» (бесполезно при наличии «Прошли демо»). */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Metric icon={Briefcase} label="Активных вакансий" value={kpi?.activeVacancies ?? "—"} bg="bg-emerald-500" />
              <Metric icon={Users} label="Откликов сегодня" value={kpi?.candidatesToday ?? "—"} bg="bg-blue-500" />
              <Metric icon={UserCheck} label="Прошли демо" value={kpi?.candidatesInWork ?? "—"} bg="bg-violet-500" />
              <Metric icon={Activity} label="Нанято за месяц" value={kpi?.hiredThisMonth ?? "—"} bg="bg-orange-500" />
              <Metric icon={TrendingUp} label="Конверсия воронки" value={kpi ? `${kpi.conversionRate}%` : "—"} bg="bg-indigo-500" />
            </div>

            {/* ═══ AI-ассистент — #33: активирован SQL-инсайтами ═══ */}
            <AiInsights selectedVacancyId={selectedVacancyId} />

            {/* ═══ Live progress widget — #52: раскрывающийся ═══ */}
            <ProgressWidget selectedVacancyId={selectedVacancyId} />

            {/* ═══ Funnel + Active Vacancies ═══
                #49: блок «Активные вакансии» справа не показываем, когда
                выбрана конкретная — иначе там единственная карточка-дубль.
                Воронка остаётся (она уже фильтруется). */}
            <div className={cn("grid grid-cols-1 gap-5", selectedVacancyId === "all" && "lg:grid-cols-2")}>
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

              {/* Active Vacancies — #49: скрываем когда выбрана одна вакансия */}
              {selectedVacancyId === "all" && (
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
                          {/* #34: «откл./фин.» переименовано в более понятное
                              «откликов · в работе». В работе = stage IN
                              (primary_contact..offer_sent) — кандидат активно
                              в воронке. */}
                          <Badge variant="secondary" className="text-[10px] h-5">{v.candidateCount} откликов</Badge>
                          {(v.inProgressCount ?? 0) > 0 && (
                            <Badge className="text-[10px] h-5 bg-blue-100 text-blue-700 border-0">
                              {v.inProgressCount} в работе
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* ═══ Efficiency + Events ═══
                #49: «Прогресс вакансий» скрываем при выборе одной — это
                кросс-вакансионный обзор, теряет смысл с фильтром. */}
            <div className={cn("grid grid-cols-1 gap-5", selectedVacancyId === "all" && "lg:grid-cols-2")}>
              {/* #35: блок «Эффективность по вакансиям» переименован в
                  «Прогресс вакансий». Раньше показывалось «done/total» с
                  %% (например 6/432 = 1.4% для свежей вакансии — выглядело
                  как провал, хотя в первые недели это норма). Теперь —
                  «inProgress / total» без процентов: «X в работе из Y
                  откликов». Бар показывает долю «в работе» от total —
                  это нейтральная метрика, без оценки.
                  #49: скрываем при фильтре по конкретной вакансии. */}
              {selectedVacancyId === "all" && (
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold">Прогресс вакансий</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Сколько кандидатов в работе по каждой вакансии
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
                      const inWork = v.inProgressCount ?? 0
                      const barPct = total > 0 ? Math.min(100, Math.round((inWork / total) * 100)) : 0
                      const barColor = inWork === 0 ? C.orange : inWork >= 5 ? C.green : C.blue
                      const tooltip = `${inWork} в работе из ${total} откликов`
                      return (
                        <div key={v.id}>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <span className="text-xs font-medium truncate">{v.title}</span>
                            <span
                              className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
                              title={tooltip}
                            >
                              <span className="font-medium text-foreground">{inWork}</span>
                              <span className="text-muted-foreground/70"> в работе </span>
                              / {total} <span className="text-muted-foreground/70">откликов</span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden" title={tooltip}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${barPct}%`, backgroundColor: barColor }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              )}

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

            {/* #36: блоки «Цели месяца», «Источники откликов», «Динамика
                за период» были placeholder'ами «Скоро» — удалены, чтобы
                HR не видел неработающий шум на дашборде. Когда виджеты
                будут готовы — вернутся через систему «Добавить виджет»
                (отдельная будущая задача). */}

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function HRDashboardPage() {
  return <DashboardContent />
}

// ─── Прогресс кандидатов сейчас — #52 ─────────────────────────────────────
// По умолчанию 5 строк. Кнопка «Показать все» раскрывает до 20.
// Фильтр vacancyId передаётся из шапки (#49).
function ProgressWidget({ selectedVacancyId }: { selectedVacancyId: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
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
      <CandidatesProgressMiniTable
        limit={5}
        vacancyId={selectedVacancyId}
        expanded={expanded}
        maxExpanded={20}
      />
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-md hover:bg-muted/40"
        >
          {expanded ? "Свернуть" : "Показать все"}
        </button>
      </div>
    </div>
  )
}

// #33: AI-ассистент — 4 карточки с SQL-инсайтами из БД (без LLM-вызовов).
// Endpoint /api/modules/hr/dashboard/ai-insights. selectedVacancyId сейчас
// игнорируется на сервере (для будущего расширения).
interface AiInsight {
  key:         string
  title:       string
  value:       string
  description: string
  link:        string | null
}

function AiInsights({ selectedVacancyId }: { selectedVacancyId: string }) {
  const [insights, setInsights] = useState<AiInsight[] | null>(null)
  useEffect(() => {
    let cancelled = false
    // #49: фильтр инсайтов по выбранной вакансии
    const qs = selectedVacancyId !== "all" ? `?vacancyId=${encodeURIComponent(selectedVacancyId)}` : ""
    setInsights(null)
    fetch(`/api/modules/hr/dashboard/ai-insights${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { insights?: AiInsight[] } | null) => {
        if (cancelled) return
        if (d?.insights && Array.isArray(d.insights)) setInsights(d.insights)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedVacancyId])

  return (
    <div className="rounded-lg border bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: C.purple }} />
        <h2 className="text-sm font-semibold">AI-ассистент</h2>
        <span className="text-[10px] text-muted-foreground">инсайты из ваших данных</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {!insights ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-md p-3 h-20 animate-pulse" />
          ))
        ) : (
          insights.map(ins => {
            const card = (
              <div className="bg-white dark:bg-gray-900 rounded-md p-3 h-full flex flex-col">
                <p className="text-[11px] text-muted-foreground">{ins.title}</p>
                <p className="text-xl font-bold mt-0.5">{ins.value}</p>
                <p className="text-[11px] text-muted-foreground mt-auto line-clamp-2">{ins.description}</p>
              </div>
            )
            return ins.link ? (
              <Link key={ins.key} href={ins.link} className="hover:scale-[1.02] transition-transform">
                {card}
              </Link>
            ) : (
              <div key={ins.key}>{card}</div>
            )
          })
        )}
      </div>
    </div>
  )
}
