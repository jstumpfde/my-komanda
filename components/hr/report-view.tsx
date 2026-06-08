"use client"

// Общий рендер «Отчёта по найму». Используется приватной страницей
// (app/(modules)/hr/report) и публичной (app/(public)/report/[token]).
// variant: "app" — внутри платформы; "public" — публичная ссылка;
// "tv" — крупный режим для телевизора (увеличенные шрифты, без хедера).

import { useState } from "react"
import type { DateRange } from "react-day-picker"
import {
  Briefcase, Users, CalendarDays, CheckCircle2, XCircle,
  TrendingUp, BarChart3, Phone,
} from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"

// ─── Период ──────────────────────────────────────────────────────────────────

export type Period =
  | "today" | "yesterday"
  | "this_week" | "last_week"
  | "this_month" | "last_month"
  | "all" | "custom"

export const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "today",      label: "Сегодня" },
  { id: "yesterday",  label: "Вчера" },
  { id: "this_week",  label: "Эта неделя" },
  { id: "last_week",  label: "Пр. неделя" },
  { id: "this_month", label: "Этот месяц" },
  { id: "last_month", label: "Пр. месяц" },
  { id: "all",        label: "За всё время" },
]

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// ─── Типы ───────────────────────────────────────────────────────────────────

export interface FunnelStage { slug: string; label: string; count: number; isTerminal: boolean }
export interface VacancyRow {
  vacancyId: string; vacancyTitle: string; publishedDaysAgo: number | null
  lifecycle: "active" | "paused" | "closed"
  closedAt: string | null; hhArchived: boolean | null; hhExpiresAt: string | null
  total: number; hired: number; rejected: number; selfRejected: number
  anketa: number; decision: number; interview: number
}
export interface RejectionCategory { id: string; label: string; count: number }
export interface RejectionInitiator { id: string; label: string; count: number }
export interface ContactChannel { id: string; label: string; count: number }
export interface ContactOutcome { id: string; label: string; count: number }
export interface ContactReason { id: string; label: string; count: number }
export interface VacancyOption { id: string; title: string }

export interface ReportData {
  period: Period
  range: { from: string | null; to: string | null }
  vacancyId: string
  vacancyOptions: VacancyOption[]
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
  interviews: { total: number; conducted: number; noShow: number; online: number; offline: number }
  rejections: { byCategory: RejectionCategory[]; byInitiator: RejectionInitiator[]; automatic: RejectionCategory[] }
  contacts: { total: number; byChannel: ContactChannel[]; byOutcome: ContactOutcome[]; noFitByReason: ContactReason[] }
}

// ─── Цвета ──────────────────────────────────────────────────────────────────

const COLORS = {
  purple: "#7F77DD", blue: "#378ADD", green: "#1D9E75",
  orange: "#D85A30", red: "#E24B4A", slate: "#94a3b8",
}

// ─── Карточки/обёртки ─────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, bg, tv }: {
  icon: React.ElementType; label: string; value: number | string; bg: string; tv?: boolean
}) {
  return (
    <div className={`rounded-xl shadow-sm hover:shadow-md transition-shadow ${tv ? "p-6" : "p-4"} text-white ${bg}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`${tv ? "w-6 h-6" : "w-4 h-4"} text-white`} />
        <span className={`${tv ? "text-lg" : "text-sm"} font-semibold text-white`}>{label}</span>
      </div>
      <p className={`${tv ? "text-6xl" : "text-3xl"} font-bold text-white`}>{value}</p>
    </div>
  )
}

function SectionCard({ title, children, tv }: { title: string; children: React.ReactNode; tv?: boolean }) {
  return (
    <div className={`border rounded-xl shadow-sm hover:shadow-md transition-shadow ${tv ? "p-8" : "p-6"}`}>
      <h3 className={`${tv ? "text-2xl" : "text-lg"} font-semibold mb-4`}>{title}</h3>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{text}</p>
}

function SkeletonBar() {
  return <div className="h-7 bg-muted/30 rounded-full animate-pulse" />
}

// ─── Период-фильтр ─────────────────────────────────────────────────────────────

function PeriodFilter({ value, onChange, tv }: { value: Period; onChange: (p: Period) => void; tv?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PERIOD_OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={[
            "rounded-full font-medium transition-colors",
            tv ? "px-4 py-2 text-base" : "px-3 py-1 text-sm",
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

// ─── Календарь (диапазон дат) ────────────────────────────────────────────────

function CalendarRangeFilter({ active, from, to, onApply, tv }: {
  active: boolean
  from: Date | null
  to: Date | null
  onApply: (from: Date | null, to: Date | null) => void
  tv?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>(
    from ? { from, to: to ?? undefined } : undefined
  )

  const label = active && from
    ? `${from.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}${to ? ` — ${to.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}` : ""}`
    : "Календарь"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={[
            "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors border",
            tv ? "px-4 py-2 text-base" : "px-3 py-1 text-sm",
            active
              ? "bg-violet-600 text-white border-violet-600 shadow-sm"
              : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80",
          ].join(" ")}
        >
          <CalendarDays className={tv ? "w-4 h-4" : "w-3.5 h-3.5"} />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          numberOfMonths={1}
          defaultMonth={from ?? undefined}
        />
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => { setRange(undefined); onApply(null, null); setOpen(false) }}>
            Сбросить
          </Button>
          <Button
            size="sm"
            disabled={!range?.from}
            onClick={() => { onApply(range?.from ?? null, range?.to ?? range?.from ?? null); setOpen(false) }}
          >
            Применить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Воронка ──────────────────────────────────────────────────────────────────

function FunnelBlock({ stages, loading, tv }: { stages: FunnelStage[]; loading: boolean; tv?: boolean }) {
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

  if (loading) return <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <SkeletonBar key={i} />)}</div>
  if (nonZero.length === 0) return <EmptyState text="Нет данных о кандидатах" />

  return (
    <div className="space-y-2">
      {nonZero.map(s => (
        <div key={s.slug}>
          <div className="flex items-center justify-between mb-1">
            <span className={`${tv ? "text-base" : "text-xs"} font-medium`}>{s.label}</span>
            <span className={`${tv ? "text-base" : "text-xs"} font-semibold`}>{s.count}</span>
          </div>
          <div className={`${tv ? "h-9" : "h-7"} bg-muted/30 rounded-full overflow-hidden`}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round((s.count / maxCount) * 100)}%`, backgroundColor: stageColor(s.slug, s.isTerminal) }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Таблица по вакансиям ───────────────────────────────────────────────────────

function publishedLabel(days: number | null): string {
  if (days == null) return "—"
  if (days === 0) return "сегодня"
  if (days === 1) return "вчера"
  return `${days} дн.`
}

function shortDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

// Умная ячейка статуса: наш жизненный цикл + состояние публикации на hh.
function StatusCell({ row }: { row: VacancyRow }) {
  // Основной бейдж — наш статус.
  let mainText = "Активна"
  let mainCls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
  if (row.lifecycle === "closed") {
    mainText = row.closedAt ? `Закрыта ${shortDate(row.closedAt)}` : "Закрыта"
    mainCls = "bg-muted text-muted-foreground"
  } else if (row.lifecycle === "paused") {
    mainText = "Приостановлена"
    mainCls = "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
  }

  // hh-подстрока — показываем только значимое (архив или срок).
  let hhText: string | null = null
  let hhCls = "text-muted-foreground"
  if (row.hhArchived === true) {
    hhText = "hh: в архиве"
    hhCls = "text-amber-600"
  } else if (row.hhExpiresAt) {
    const d = daysUntil(row.hhExpiresAt)
    hhText = d > 0 ? `hh: ещё ${d} дн.` : "hh: истекла"
    hhCls = d > 0 ? "text-muted-foreground" : "text-amber-600"
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${mainCls}`}>{mainText}</span>
      {hhText && <span className={`text-[11px] whitespace-nowrap ${hhCls}`}>{hhText}</span>}
    </div>
  )
}

function VacancyTable({ rows, loading, tv }: { rows: VacancyRow[]; loading: boolean; tv?: boolean }) {
  if (loading) return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />)}</div>
  if (rows.length === 0) return <EmptyState text="Нет вакансий с кандидатами" />

  const th = `text-left py-2 font-medium text-muted-foreground ${tv ? "text-sm" : "text-xs"}`
  const thR = `text-center py-2 font-medium text-muted-foreground ${tv ? "text-sm" : "text-xs"}`
  const td = tv ? "text-base" : "text-sm"

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${td}`}>
        <thead>
          <tr className="border-b">
            <th className={`${th} pr-4`}>Вакансия</th>
            <th className={`${th} px-3`}>Статус</th>
            <th className={`${thR} px-3`}>Опубл.</th>
            <th className={`${thR} px-3`}>Откликов</th>
            <th className={`${thR} px-3`}>Анкет</th>
            <th className={`${thR} px-3`}>Собес.</th>
            <th className={`${thR} px-3`}>Решение</th>
            <th className={`${thR} px-3`}>Нанято</th>
            <th className={`${thR} px-3`}>Отказов</th>
            <th className={`${thR} pl-3`}>Сам отказ.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.vacancyId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
              <td className={`py-2.5 pr-4 font-medium truncate ${tv ? "max-w-[420px]" : "max-w-[280px]"}`}>{r.vacancyTitle}</td>
              <td className="py-2.5 px-3"><StatusCell row={r} /></td>
              <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground whitespace-nowrap">{publishedLabel(r.publishedDaysAgo)}</td>
              <td className="py-2.5 px-3 text-center tabular-nums font-medium">{r.total}</td>
              <td className="py-2.5 px-3 text-center tabular-nums">{r.anketa}</td>
              <td className="py-2.5 px-3 text-center tabular-nums">{r.interview}</td>
              <td className="py-2.5 px-3 text-center tabular-nums text-violet-600">{r.decision}</td>
              <td className="py-2.5 px-3 text-center tabular-nums text-emerald-600 font-medium">{r.hired}</td>
              <td className="py-2.5 px-3 text-center tabular-nums text-rose-500">{r.rejected}</td>
              <td className="py-2.5 pl-3 text-center tabular-nums text-amber-600">{r.selfRejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Собеседования ──────────────────────────────────────────────────────────────

function InterviewsBlock({ data, loading, tv }: { data: ReportData["interviews"] | null; loading: boolean; tv?: boolean }) {
  if (loading || !data) return <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-muted/30 rounded-lg animate-pulse" />)}</div>
  if (data.total === 0) return <EmptyState text="Собеседований ещё не было" />

  const rows = [
    { label: "Всего назначено",  value: data.total,     color: "text-foreground" },
    { label: "Проведено",        value: data.conducted,  color: "text-emerald-600" },
    { label: "Неявка кандидата", value: data.noShow,     color: "text-rose-500" },
    { label: "Онлайн (видео)",   value: data.online,     color: "text-blue-600" },
    { label: "Офлайн (офис)",    value: data.offline,    color: "text-muted-foreground" },
  ]
  const t = tv ? "text-base" : "text-sm"

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between py-1.5 border-b last:border-0">
          <span className={`${t} text-muted-foreground`}>{r.label}</span>
          <span className={`${t} font-semibold tabular-nums ${r.color}`}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Причины отказа ──────────────────────────────────────────────────────────────

function RejectionsBlock({ rejections, loading, tv }: { rejections: ReportData["rejections"] | null; loading: boolean; tv?: boolean }) {
  if (loading || !rejections) return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted/30 rounded-lg animate-pulse" />)}</div>

  const hasCategories = rejections.byCategory.length > 0
  const hasInitiators = rejections.byInitiator.some(i => i.count > 0)
  const hasAuto = (rejections.automatic?.length ?? 0) > 0
  if (!hasCategories && !hasInitiators && !hasAuto) {
    return <EmptyState text="Данных об отказах нет. Причины фиксируются автоматически (AI, стоп-факторы) и вручную при переводе кандидата в «Отказ»." />
  }
  const maxCat = Math.max(1, ...rejections.byCategory.map(r => r.count))
  const maxAuto = Math.max(1, ...(rejections.automatic ?? []).map(r => r.count))
  const lbl = tv ? "text-sm" : "text-xs"
  const t = tv ? "text-base" : "text-sm"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
      {hasAuto && (
        <div>
          <p className={`${lbl} font-semibold text-muted-foreground uppercase tracking-wide mb-3`}>
            Автоматически (AI, стоп-факторы, дедуп)
          </p>
          <div className="space-y-2">
            {rejections.automatic.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className={lbl}>{r.label}</span>
                  <span className={`${lbl} font-semibold`}>{r.count}</span>
                </div>
                <div className={`${tv ? "h-6" : "h-5"} bg-muted/30 rounded-full overflow-hidden`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((r.count / maxAuto) * 100)}%`, backgroundColor: COLORS.slate }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasCategories && (
        <div>
          <p className={`${lbl} font-semibold text-muted-foreground uppercase tracking-wide mb-3`}>Почему не подошли</p>
          <div className="space-y-2">
            {rejections.byCategory.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className={lbl}>{r.label}</span>
                  <span className={`${lbl} font-semibold`}>{r.count}</span>
                </div>
                <div className={`${tv ? "h-6" : "h-5"} bg-muted/30 rounded-full overflow-hidden`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((r.count / maxCat) * 100)}%`, backgroundColor: COLORS.red, opacity: 0.7 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasInitiators && (
        <div>
          <p className={`${lbl} font-semibold text-muted-foreground uppercase tracking-wide mb-3`}>Кто инициировал отказ</p>
          <div className="space-y-2">
            {rejections.byInitiator.map(i => (
              <div key={i.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <span className={`${t} text-muted-foreground`}>{i.label}</span>
                <span className={`${t} font-semibold tabular-nums`}>{i.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Созвоны и контакты ────────────────────────────────────────────────────────

function ContactsBlock({ contacts, loading, tv }: { contacts: ReportData["contacts"] | null; loading: boolean; tv?: boolean }) {
  if (loading || !contacts) return <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted/30 rounded-lg animate-pulse" />)}</div>
  if (contacts.total === 0) return <EmptyState text="Контактов с кандидатами ещё не зафиксировано" />

  const hasNoFitReasons = contacts.noFitByReason.length > 0
  const maxReason = Math.max(1, ...contacts.noFitByReason.map(r => r.count))
  const activeChannels = contacts.byChannel.filter(c => c.count > 0)
  const maxChannel = Math.max(1, ...activeChannels.map(c => c.count))
  const lbl = tv ? "text-sm" : "text-xs"
  const t = tv ? "text-base" : "text-sm"

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between py-1.5 border-b">
          <span className={`${t} font-medium`}>Всего контактов</span>
          <span className={`${t} font-bold tabular-nums`}>{contacts.total}</span>
        </div>
        {activeChannels.length > 0 && (
          <div className="mt-3 space-y-2">
            {activeChannels.map(c => (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`${lbl} text-muted-foreground`}>{c.label}</span>
                  <span className={`${lbl} font-semibold`}>{c.count}</span>
                </div>
                <div className={`${tv ? "h-5" : "h-4"} bg-muted/30 rounded-full overflow-hidden`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((c.count / maxChannel) * 100)}%`, backgroundColor: COLORS.blue, opacity: 0.75 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className={`${lbl} font-semibold text-muted-foreground uppercase tracking-wide mb-3`}>По исходу</p>
        <div className="space-y-1">
          {contacts.byOutcome.map(o => (
            <div key={o.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <span className={`${t} text-muted-foreground`}>{o.label}</span>
              <span className={[
                `${t} font-semibold tabular-nums`,
                o.id === "fit" ? "text-emerald-600" : o.id === "no_fit" ? "text-rose-500" : "text-muted-foreground",
              ].join(" ")}>{o.count}</span>
            </div>
          ))}
        </div>
      </div>
      {hasNoFitReasons && (
        <div>
          <p className={`${lbl} font-semibold text-muted-foreground uppercase tracking-wide mb-3`}>Почему не подошли (по созвонам)</p>
          <div className="space-y-2">
            {contacts.noFitByReason.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className={lbl}>{r.label}</span>
                  <span className={`${lbl} font-semibold`}>{r.count}</span>
                </div>
                <div className={`${tv ? "h-5" : "h-4"} bg-muted/30 rounded-full overflow-hidden`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((r.count / maxReason) * 100)}%`, backgroundColor: COLORS.orange, opacity: 0.75 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Вакансия-фильтр ────────────────────────────────────────────────────────────

function VacancyFilter({ value, options, onChange, tv }: {
  value: string; options: VacancyOption[]; onChange: (v: string) => void; tv?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={tv ? "h-11 text-base min-w-[220px]" : "h-9 text-sm min-w-[200px]"}>
        <SelectValue placeholder="Все вакансии" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Все вакансии</SelectItem>
        {options.map(o => (
          <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ─── Главный компонент ──────────────────────────────────────────────────────────

export interface ReportViewProps {
  data: ReportData | null
  loading: boolean
  error?: string | null
  period: Period
  onPeriodChange: (p: Period) => void
  /** Текущий кастомный диапазон (когда выбран календарь). */
  customFrom?: Date | null
  customTo?: Date | null
  /** Применить кастомный диапазон с календаря (null,null = сбросить). */
  onRangeChange?: (from: Date | null, to: Date | null) => void
  vacancyId: string
  onVacancyChange: (v: string) => void
  variant?: "app" | "public" | "tv"
  /** Кнопка «Поделиться» (только variant=app). */
  shareSlot?: React.ReactNode
}

export function ReportView({
  data, loading, error, period, onPeriodChange,
  customFrom = null, customTo = null, onRangeChange,
  vacancyId, onVacancyChange, variant = "app", shareSlot,
}: ReportViewProps) {
  const tv = variant === "tv"
  const kpi = data?.kpi
  const vacancyOptions = data?.vacancyOptions ?? []
  const selectedVacancy = vacancyId !== "all" ? vacancyOptions.find(v => v.id === vacancyId)?.title : null

  // Текст «Период: …» — из фактического диапазона ответа (или «За всё время»).
  const periodText = period === "all" || !data?.range?.from
    ? "За всё время"
    : `${fmtDate(data.range.from)}${data.range.to ? ` — ${fmtDate(data.range.to)}` : ""}`

  return (
    <div className={tv ? "space-y-6" : "space-y-5"}>
      {/* Шапка: заголовок слева, «Период: …» + Поделиться справа */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className={`${tv ? "w-9 h-9" : "w-6 h-6"} text-violet-500`} />
          <div>
            <h1 className={`${tv ? "text-3xl" : "text-lg"} font-semibold`}>Отчёт по найму</h1>
            <p className={`${tv ? "text-lg" : "text-sm"} text-muted-foreground`}>
              {selectedVacancy ?? "Сводная аналитика по всем вакансиям компании"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`${tv ? "text-base" : "text-sm"} text-muted-foreground whitespace-nowrap`}>
            Период: <span className="font-semibold text-foreground">{periodText}</span>
          </span>
          {shareSlot}
        </div>
      </div>

      {/* Панель фильтров: пресеты · календарь · вакансии (справа) */}
      {variant !== "tv" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <PeriodFilter value={period} onChange={onPeriodChange} tv={tv} />
          {onRangeChange && (
            <CalendarRangeFilter
              active={period === "custom"}
              from={customFrom}
              to={customTo}
              onApply={onRangeChange}
              tv={tv}
            />
          )}
          <div className="ml-auto">
            <VacancyFilter value={vacancyId} options={vacancyOptions} onChange={onVacancyChange} tv={tv} />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* KPI */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 ${tv ? "gap-4" : "gap-3"}`}>
        <KpiCard icon={Briefcase}    label="Активных вакансий"  value={kpi?.activeVacancies ?? "—"}    bg="bg-emerald-500" tv={tv} />
        <KpiCard icon={Users}        label="Откликов всего"     value={kpi?.totalCandidates ?? "—"}    bg="bg-blue-500"    tv={tv} />
        <KpiCard icon={CalendarDays} label="Назначено интервью" value={kpi?.interviewScheduled ?? "—"} bg="bg-violet-500"  tv={tv} />
        <KpiCard icon={CheckCircle2} label="Проведено интервью" value={kpi?.interviewConducted ?? "—"} bg="bg-indigo-500"  tv={tv} />
        <KpiCard icon={XCircle}      label="Отказов"            value={kpi?.totalRejected ?? "—"}      bg="bg-rose-500"    tv={tv} />
      </div>

      {/* По вакансиям — на всю ширину, первым блоком */}
      <SectionCard title="По вакансиям" tv={tv}>
        <VacancyTable rows={data?.vacancyTable ?? []} loading={loading} tv={tv} />
      </SectionCard>

      {/* Воронка + собеседования (узкие списки — в две колонки) */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 ${tv ? "gap-6" : "gap-5"}`}>
        <SectionCard title="Воронка по этапам" tv={tv}>
          <p className={`${tv ? "text-sm" : "text-xs"} text-muted-foreground mb-3`}>Текущее состояние всех кандидатов</p>
          <FunnelBlock stages={data?.funnel ?? []} loading={loading} tv={tv} />
        </SectionCard>
        <SectionCard title="Собеседования" tv={tv}>
          <InterviewsBlock data={data?.interviews ?? null} loading={loading} tv={tv} />
        </SectionCard>
      </div>

      {/* Причины отказа — на всю ширину (авто + ручные + инициатор) */}
      <SectionCard title="Причины отказа" tv={tv}>
        <RejectionsBlock rejections={data?.rejections ?? null} loading={loading} tv={tv} />
      </SectionCard>

      {/* Созвоны */}
      <SectionCard title="Созвоны и контакты" tv={tv}>
        <div className="flex items-center gap-2 mb-4">
          <Phone className={`${tv ? "w-5 h-5" : "w-4 h-4"} text-violet-500`} />
          <p className={`${tv ? "text-sm" : "text-xs"} text-muted-foreground`}>
            Контакты с кандидатами, зафиксированные HR · {periodText}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ContactsBlock contacts={data?.contacts ?? null} loading={loading} tv={tv} />
        </div>
      </SectionCard>

      {/* Нанято */}
      {!loading && kpi && kpi.totalHired > 0 && (
        <div className="rounded-xl border p-4 flex items-center gap-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className={tv ? "text-lg" : "text-sm"}>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {kpi.totalHired} {kpi.totalHired === 1 ? "кандидат нанят" : kpi.totalHired >= 2 && kpi.totalHired <= 4 ? "кандидата нанято" : "кандидатов нанято"}
            </span>
            {" "}{period === "all" ? "за всё время." : "за выбранный период."}
            {kpi.totalCandidates > 0 && <> Конверсия в наём: {Math.round((kpi.totalHired / kpi.totalCandidates) * 100)}%</>}
          </p>
        </div>
      )}
    </div>
  )
}
