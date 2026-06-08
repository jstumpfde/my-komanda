"use client"

import { useEffect, useState, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import {
  Briefcase, Users, Calendar, CheckCircle2, XCircle,
  TrendingUp, BarChart3, Phone,
} from "lucide-react"

// ─── Период ──────────────────────────────────────────────────────────────────

type Period = "today" | "week" | "month" | "quarter" | "all"

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "today",   label: "Сегодня" },
  { id: "week",    label: "Неделя" },
  { id: "month",   label: "Месяц" },
  { id: "quarter", label: "Квартал" },
  { id: "all",     label: "За всё время" },
]

// ─── Типы ───────────────────────────────────────────────────────────────────

interface FunnelStage {
  slug: string
  label: string
  count: number
  isTerminal: boolean
}

interface VacancyRow {
  vacancyId: string
  vacancyTitle: string
  total: number
  hired: number
  rejected: number
  interview: number
}

interface RejectionCategory {
  id: string
  label: string
  count: number
}

interface RejectionInitiator {
  id: string
  label: string
  count: number
}

interface ContactChannel {
  id: string
  label: string
  count: number
}

interface ContactOutcome {
  id: string
  label: string
  count: number
}

interface ContactReason {
  id: string
  label: string
  count: number
}

interface ReportData {
  period: Period
  kpi: {
    activeVacancies: number
    totalCandidates: number
    interviewScheduled: number
    interviewConducted: number
    totalRejected: number
    totalHired: number
  }
  funnel: FunnelStage[]
  vacancyTable: VacancyRow[]
  interviews: {
    total: number
    conducted: number
    noShow: number
    online: number
    offline: number
  }
  rejections: {
    byCategory: RejectionCategory[]
    byInitiator: RejectionInitiator[]
  }
  contacts: {
    total: number
    byChannel: ContactChannel[]
    byOutcome: ContactOutcome[]
    noFitByReason: ContactReason[]
  }
}

// ─── Цвета ──────────────────────────────────────────────────────────────────

const COLORS = {
  purple:  "#7F77DD",
  blue:    "#378ADD",
  green:   "#1D9E75",
  orange:  "#D85A30",
  red:     "#E24B4A",
  slate:   "#94a3b8",
}

// ─── Компоненты ──────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ElementType
  label: string
  value: number | string
  bg: string
}

function KpiCard({ icon: Icon, label, value, bg }: KpiCardProps) {
  return (
    <div className={`rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 text-white ${bg}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-sm text-muted-foreground py-8 text-center">{text}</p>
  )
}

function SkeletonBar() {
  return <div className="h-7 bg-muted/30 rounded-full animate-pulse" />
}

// ─── Период-фильтр ───────────────────────────────────────────────────────────

function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PERIOD_OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={[
            "rounded-full px-3 py-1 text-sm font-medium transition-colors",
            value === opt.id
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Воронка ────────────────────────────────────────────────────────────────

function FunnelBlock({ stages, loading }: { stages: FunnelStage[]; loading: boolean }) {
  const nonZero = stages.filter(s => s.count > 0)
  const maxCount = Math.max(1, nonZero[0]?.count ?? 0)

  function stageColor(slug: string, isTerminal: boolean): string {
    if (slug === "hired") return COLORS.green
    if (slug === "rejected" || isTerminal) return COLORS.red
    if (["new", "primary_contact"].includes(slug)) return COLORS.blue
    if (["scheduled", "interview", "interviewed"].includes(slug)) return COLORS.purple
    if (["offer_sent", "offer"].includes(slug)) return COLORS.orange
    return COLORS.slate
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <SkeletonBar key={i} />)}
      </div>
    )
  }
  if (nonZero.length === 0) {
    return <EmptyState text="Нет данных о кандидатах" />
  }

  return (
    <div className="space-y-2">
      {nonZero.map(s => (
        <div key={s.slug}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">{s.label}</span>
            <span className="text-xs font-semibold">{s.count}</span>
          </div>
          <div className="h-7 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((s.count / maxCount) * 100)}%`,
                backgroundColor: stageColor(s.slug, s.isTerminal),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Таблица по вакансиям ────────────────────────────────────────────────────

function VacancyTable({ rows, loading }: { rows: VacancyRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (rows.length === 0) {
    return <EmptyState text="Нет вакансий с кандидатами" />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Вакансия</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Откликов</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">На интервью</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Нанято</th>
            <th className="text-right py-2 pl-3 font-medium text-muted-foreground text-xs">Отказов</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.vacancyId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
              <td className="py-2.5 pr-4 font-medium truncate max-w-[200px]">{r.vacancyTitle}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.total}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.interview}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 font-medium">{r.hired}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums text-rose-500">{r.rejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Собеседования ───────────────────────────────────────────────────────────

interface InterviewsBlockProps {
  data: ReportData["interviews"] | null
  loading: boolean
}

function InterviewsBlock({ data, loading }: InterviewsBlockProps) {
  if (loading || !data) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (data.total === 0) {
    return <EmptyState text="Собеседований ещё не было" />
  }

  const rows = [
    { label: "Всего назначено",  value: data.total,     color: "text-foreground" },
    { label: "Проведено",        value: data.conducted,  color: "text-emerald-600" },
    { label: "Неявка кандидата", value: data.noShow,     color: "text-rose-500" },
    { label: "Онлайн (видео)",   value: data.online,     color: "text-blue-600" },
    { label: "Офлайн (офис)",    value: data.offline,    color: "text-muted-foreground" },
  ]

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between py-1.5 border-b last:border-0">
          <span className="text-sm text-muted-foreground">{r.label}</span>
          <span className={`text-sm font-semibold tabular-nums ${r.color}`}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Причины отказа ──────────────────────────────────────────────────────────

interface RejectionsBlockProps {
  rejections: ReportData["rejections"] | null
  loading: boolean
}

function RejectionsBlock({ rejections, loading }: RejectionsBlockProps) {
  if (loading || !rejections) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-8 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  const hasCategories = rejections.byCategory.length > 0
  const hasInitiators = rejections.byInitiator.some(i => i.count > 0)

  if (!hasCategories && !hasInitiators) {
    return <EmptyState text="Данных об отказах нет. Причины фиксируются при переводе кандидата в статус «Отказ»." />
  }

  const maxCat = Math.max(1, ...rejections.byCategory.map(r => r.count))

  return (
    <div className="space-y-6">
      {hasCategories && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Почему не подошли
          </p>
          <div className="space-y-2">
            {rejections.byCategory.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs">{r.label}</span>
                  <span className="text-xs font-semibold">{r.count}</span>
                </div>
                <div className="h-5 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((r.count / maxCat) * 100)}%`,
                      backgroundColor: COLORS.red,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasInitiators && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Кто инициировал отказ
          </p>
          <div className="space-y-2">
            {rejections.byInitiator.map(i => (
              <div key={i.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <span className="text-sm text-muted-foreground">{i.label}</span>
                <span className="text-sm font-semibold tabular-nums">{i.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Созвоны и контакты ──────────────────────────────────────────────────────

interface ContactsBlockProps {
  contacts: ReportData["contacts"] | null
  loading: boolean
}

function ContactsBlock({ contacts, loading }: ContactsBlockProps) {
  if (loading || !contacts) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-8 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (contacts.total === 0) {
    return <EmptyState text="Контактов с кандидатами ещё не зафиксировано" />
  }

  const hasNoFitReasons = contacts.noFitByReason.length > 0
  const maxReason = Math.max(1, ...contacts.noFitByReason.map(r => r.count))

  // Каналы: показываем только те, у которых count > 0
  const activeChannels = contacts.byChannel.filter(c => c.count > 0)
  const maxChannel = Math.max(1, ...activeChannels.map(c => c.count))

  return (
    <div className="space-y-6">
      {/* Итого + по каналам */}
      <div>
        <div className="flex items-center justify-between py-1.5 border-b">
          <span className="text-sm font-medium">Всего контактов</span>
          <span className="text-sm font-bold tabular-nums">{contacts.total}</span>
        </div>
        {activeChannels.length > 0 && (
          <div className="mt-3 space-y-2">
            {activeChannels.map(c => (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  <span className="text-xs font-semibold">{c.count}</span>
                </div>
                <div className="h-4 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((c.count / maxChannel) * 100)}%`,
                      backgroundColor: COLORS.blue,
                      opacity: 0.75,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* По исходу */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          По исходу
        </p>
        <div className="space-y-1">
          {contacts.byOutcome.map(o => (
            <div key={o.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <span className="text-sm text-muted-foreground">{o.label}</span>
              <span className={[
                "text-sm font-semibold tabular-nums",
                o.id === "fit"     ? "text-emerald-600" :
                o.id === "no_fit"  ? "text-rose-500"    :
                                     "text-muted-foreground",
              ].join(" ")}>{o.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Почему не подошли (no_fit) */}
      {hasNoFitReasons && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Почему не подошли (по созвонам)
          </p>
          <div className="space-y-2">
            {contacts.noFitByReason.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs">{r.label}</span>
                  <span className="text-xs font-semibold">{r.count}</span>
                </div>
                <div className="h-4 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((r.count / maxReason) * 100)}%`,
                      backgroundColor: COLORS.orange,
                      opacity: 0.75,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Страница ────────────────────────────────────────────────────────────────

function ReportContent() {
  const [period, setPeriod] = useState<Period>("all")
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback((p: Period) => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const url = p === "all" ? "/api/modules/hr/report" : `/api/modules/hr/report?period=${p}`
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ReportData) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить данные отчёта")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cancel = loadData(period)
    return cancel
  }, [period, loadData])

  const kpi = data?.kpi
  const periodLabel = PERIOD_OPTIONS.find(o => o.id === period)?.label ?? ""

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-5" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Шапка */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-violet-500" />
                <div>
                  <h1 className="text-lg font-semibold">Отчёт по найму</h1>
                  <p className="text-sm text-muted-foreground">Сводная аналитика по всем вакансиям компании</p>
                </div>
              </div>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            {/* Ошибка */}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* KPI карточки */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard
                icon={Briefcase}
                label="Активных вакансий"
                value={kpi?.activeVacancies ?? "—"}
                bg="bg-emerald-500"
              />
              <KpiCard
                icon={Users}
                label="Откликов всего"
                value={kpi?.totalCandidates ?? "—"}
                bg="bg-blue-500"
              />
              <KpiCard
                icon={Calendar}
                label="Назначено интервью"
                value={kpi?.interviewScheduled ?? "—"}
                bg="bg-violet-500"
              />
              <KpiCard
                icon={CheckCircle2}
                label="Проведено интервью"
                value={kpi?.interviewConducted ?? "—"}
                bg="bg-indigo-500"
              />
              <KpiCard
                icon={XCircle}
                label="Отказов"
                value={kpi?.totalRejected ?? "—"}
                bg="bg-rose-500"
              />
            </div>

            {/* Воронка + Таблица вакансий */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title="Воронка по этапам">
                <p className="text-xs text-muted-foreground mb-3">Текущее состояние всех кандидатов</p>
                <FunnelBlock stages={data?.funnel ?? []} loading={loading} />
              </SectionCard>

              <SectionCard title="По вакансиям">
                <VacancyTable rows={data?.vacancyTable ?? []} loading={loading} />
              </SectionCard>
            </div>

            {/* Собеседования + Причины отказа */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title="Собеседования">
                <InterviewsBlock data={data?.interviews ?? null} loading={loading} />
              </SectionCard>

              <SectionCard title="Причины отказа">
                <RejectionsBlock rejections={data?.rejections ?? null} loading={loading} />
              </SectionCard>
            </div>

            {/* Созвоны и контакты */}
            <SectionCard title="Созвоны и контакты">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-4 h-4 text-violet-500" />
                <p className="text-xs text-muted-foreground">
                  Контакты с кандидатами, зафиксированные HR · {periodLabel}
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <ContactsBlock contacts={data?.contacts ?? null} loading={loading} />
              </div>
            </SectionCard>

            {/* Дополнительно: нанято */}
            {!loading && kpi && kpi.totalHired > 0 && (
              <div className="rounded-xl border p-4 flex items-center gap-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {kpi.totalHired} {kpi.totalHired === 1 ? "кандидат нанят" : kpi.totalHired >= 2 && kpi.totalHired <= 4 ? "кандидата нанято" : "кандидатов нанято"}
                  </span>
                  {" "}{period === "all" ? "за всё время." : `за выбранный период.`}
                  {kpi.totalCandidates > 0 && (
                    <> Конверсия в наём: {Math.round((kpi.totalHired / kpi.totalCandidates) * 100)}%</>
                  )}
                </p>
              </div>
            )}

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function HRReportPage() {
  return <ReportContent />
}
