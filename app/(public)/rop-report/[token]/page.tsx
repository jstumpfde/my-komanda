// Публичный отчёт AI-РОП по share-токену — БЕЗ логина, read-only.
// Резолв токена → companyId СЕРВЕРНО через lib/ai-rop/dashboard-share
// (см. AI-ROP-MODULE-PLAN-2026-07.md п.10) — никаких данных без скоупа
// компании: неизвестный/отозванный токен → notFound(), дальше все запросы
// идут строго по companyId из резолва токена, а не из query/тела запроса.
//
// ?tv=1        — ТВ-режим: крупно, автообновление 60с, без фильтров.
// ?period=...  — today|yesterday|this_week|last_week|this_month|last_month (иначе «за всё время»).
// ?managerId=  — фильтр по конкретному менеджеру (bitrix manager id).
//
// force-dynamic — отчёт не кешируется, каждый заход/автообновление свежий.
export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { Phone, Tv } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { resolveCompanyByToken } from "@/lib/ai-rop/dashboard-share"
import { getTenantName } from "@/lib/ai-rop/report-views"
import { loadDashboardData } from "@/lib/ai-rop/dashboard-data"
import {
  ReportThemeToggle, PeriodTabs, ManagerFilterSelect, ReportAutoRefresh, type PeriodOption,
} from "./_controls"
import {
  SectionCard, KpiCard, ManagerTable, TrendChart, SentimentBlock,
  ChecklistWeak, TopChips, ProductTable, formatMinutes, formatScore, formatPct,
} from "./_sections"
import {
  CheckCircle2, Users as UsersIcon, Gauge, ListChecks, Clock, AlertTriangle,
} from "lucide-react"

type PeriodKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all"

const PERIOD_OPTIONS: PeriodOption[] = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "this_week", label: "Эта неделя" },
  { id: "last_week", label: "Пр. неделя" },
  { id: "this_month", label: "Этот месяц" },
  { id: "last_month", label: "Пр. месяц" },
  { id: "all", label: "За всё время" },
]

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function resolvePeriodRange(period: PeriodKey): { from?: string; to?: string } {
  const now = new Date()
  switch (period) {
    case "today": {
      const s = isoDate(now)
      return { from: s, to: s }
    }
    case "yesterday": {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      const s = isoDate(d)
      return { from: s, to: s }
    }
    case "this_week": {
      const d = new Date(now)
      const day = (d.getDay() + 6) % 7 // Mon=0
      d.setDate(d.getDate() - day)
      return { from: isoDate(d), to: isoDate(now) }
    }
    case "last_week": {
      const d = new Date(now)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day - 7)
      const to = new Date(d); to.setDate(to.getDate() + 6)
      return { from: isoDate(d), to: isoDate(to) }
    }
    case "this_month": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: isoDate(d), to: isoDate(now) }
    }
    case "last_month": {
      const firstThis = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastEnd = new Date(firstThis); lastEnd.setDate(lastEnd.getDate() - 1)
      const lastStart = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1)
      return { from: isoDate(lastStart), to: isoDate(lastEnd) }
    }
    case "all":
    default:
      return {}
  }
}

function parsePeriod(raw: string | string[] | undefined): PeriodKey {
  if (typeof raw === "string" && PERIOD_OPTIONS.some((o) => o.id === raw)) return raw as PeriodKey
  return "all"
}

export default async function RopReportPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams

  const companyId = await resolveCompanyByToken(token)
  if (!companyId) notFound()

  const tv = sp.tv === "1" || sp.tv === ""
  const period = parsePeriod(sp.period)
  const managerId = typeof sp.managerId === "string" && sp.managerId !== "all" ? sp.managerId : undefined
  const range = tv ? {} : resolvePeriodRange(period)

  const [data, tenantName] = await Promise.all([
    loadDashboardData({ tenantId: companyId, from: range.from, to: range.to, managerId }),
    getTenantName(companyId),
  ])

  const periodLabel = tv ? "сегодня" : period === "all" ? "за всё время" : PERIOD_OPTIONS.find((o) => o.id === period)!.label

  if (tv) {
    // ТВ-режим показывает «сегодня» — крупный, без фильтров, только ключевое.
    return (
      <div className="mx-auto max-w-[1800px] px-6 py-8 sm:px-10">
        <ReportAutoRefresh token={token} tv intervalSec={60} />
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Phone className="h-10 w-10 text-violet-600" />
            <div>
              <span className="text-sm font-semibold uppercase tracking-wide text-violet-600">Отчёт по звонкам</span>
              <h1 className="text-4xl font-bold mt-1">{tenantName}</h1>
            </div>
          </div>
          <Badge variant="outline" className="text-sm gap-1.5 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> обновляется каждую минуту
          </Badge>
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <KpiCard tv icon={UsersIcon} label="Звонков" value={data.totals.total} color="blue" />
          <KpiCard tv icon={CheckCircle2} label="Проанализировано" value={data.totals.done} color="emerald" />
          <KpiCard tv icon={Gauge} label="Ср. оценка" value={formatScore(data.aggs.avg_score)} color="violet" />
          <KpiCard tv icon={ListChecks} label="Чек-лист" value={formatPct(data.aggs.avg_compliance)} color="indigo" />
          <KpiCard tv icon={Clock} label="Минут разговоров" value={formatMinutes(data.totals.total_duration)} color="amber" />
          <KpiCard tv icon={AlertTriangle} label="Требует внимания" value={data.totals.failed + data.totals.no_recording} color="rose" />
        </div>

        <SectionCard title="По менеджерам" tv>
          <ManagerTable rows={data.allManagers} />
        </SectionCard>

        <div className="mt-8">
          <SectionCard title="Динамика за 14 дней" tv>
            <TrendChart series={data.series} maxDaily={data.maxDaily} tv />
          </SectionCard>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground/60">Company24.pro · AI-РОП</p>
      </div>
    )
  }

  const tvUrl = (() => {
    const params = new URLSearchParams()
    params.set("tv", "1")
    return `?${params.toString()}`
  })()

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
      <ReportAutoRefresh token={token} tv={false} intervalSec={300} />

      {/* Шапка */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-5">
        <div className="flex items-center gap-3">
          <Phone className="h-7 w-7 text-violet-600 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">Отчёт по звонкам</span>
              <Badge variant="outline" className="text-[10px] gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> обновляется автоматически
              </Badge>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold mt-0.5 truncate">{tenantName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={tvUrl}>
            <Button variant="outline" size="sm" className="gap-1.5"><Tv className="h-4 w-4" />ТВ-режим</Button>
          </a>
          <ReportThemeToggle />
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <PeriodTabs current={period} options={PERIOD_OPTIONS} />
        <ManagerFilterSelect current={managerId ?? "all"} managers={data.managersList} />
        <span className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
          Период: <b className="text-foreground">{periodLabel}</b>
        </span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-5">
        <KpiCard icon={UsersIcon} label="Звонков всего" shortLabel="Звонков" value={data.totals.total} color="blue" />
        <KpiCard icon={CheckCircle2} label="Проанализировано" shortLabel="Разобрано" value={data.totals.done} color="emerald" />
        <KpiCard icon={Gauge} label="Ср. оценка" value={formatScore(data.aggs.avg_score)} color="violet" />
        <KpiCard icon={ListChecks} label="Чек-лист" value={formatPct(data.aggs.avg_compliance)} color="indigo" />
        <KpiCard icon={Clock} label="Минут разговоров" shortLabel="Минут" value={formatMinutes(data.totals.total_duration)} color="amber" />
        <KpiCard icon={AlertTriangle} label="Требует внимания" shortLabel="Внимание" value={data.totals.failed + data.totals.no_recording} color="rose" />
      </div>

      <div className="space-y-5">
        <SectionCard title="По менеджерам">
          <ManagerTable rows={data.allManagers} />
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Динамика за 14 дней">
            <TrendChart series={data.series} maxDaily={data.maxDaily} />
          </SectionCard>
          <SectionCard title="Настроение заказчиков">
            <SentimentBlock sentMap={data.sentMap} sentTotal={data.sentTotal} />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Слабые места чек-листа">
            <ChecklistWeak items={data.checklistItemsBreakdown} />
          </SectionCard>
          <SectionCard title="Возражения и темы">
            <TopChips objections={data.topObjections} topics={data.topTopics} />
          </SectionCard>
        </div>

        <SectionCard title="Распределение по продуктам">
          <ProductTable rows={data.productStats} />
        </SectionCard>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground/60">
        Company24.pro · AI-РОП · отчёт обновляется автоматически
      </p>
    </div>
  )
}
