"use client"

import { useEffect, useState } from "react"
import { DashboardSidebarV2 } from "@/components/dashboard/sidebar-v2"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { TrendingUp, Users, Award, Target } from "lucide-react"

interface FunnelStage {
  stage: string
  count: number
  conversion: number | null
}

interface FunnelData {
  funnel: FunnelStage[]
  bySource: { source: string; count: number }[]
  byVacancy: { vacancyId: string; vacancyTitle: string; total: number }[]
  summary: { total: number; hired: number; conversionRate: number }
}

const STAGE_LABELS: Record<string, string> = {
  new:       "Новые",
  screening: "Скрининг",
  demo:      "Демо",
  interview: "Интервью",
  offer:     "Оффер",
  hired:     "Принят",
  rejected:  "Отказ",
}

const STAGE_COLORS = [
  "bg-slate-500", "bg-blue-500", "bg-violet-500",
  "bg-amber-500", "bg-orange-500", "bg-emerald-500", "bg-red-400",
]

const SOURCE_LABELS: Record<string, string> = {
  direct: "Прямой отклик",
  hh: "hh.ru",
  referral: "Реферал",
  manual: "Вручную",
  avito: "Авито",
  unknown: "Неизвестно",
}

export default function FunnelPageV2() {
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/modules/hr/funnel-v2")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const maxCount = data ? Math.max(...data.funnel.filter((s) => s.stage !== "rejected").map((s) => s.count), 1) : 1

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebarV2 />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6 max-w-5xl">
          <div>
            <h1 className="text-2xl font-semibold">Воронка найма</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Аналитика по всем вакансиям</p>
          </div>

          {loading ? (
            <div className="grid gap-4">
              <div className="grid grid-cols-4 gap-4">
                {[1,2,3,4].map((i) => <Skeleton key={i} className="h-24" />)}
              </div>
              <Skeleton className="h-64" />
            </div>
          ) : data && (
            <>
              {/* Сводка */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  icon={<Users className="w-5 h-5" />}
                  label="Всего кандидатов"
                  value={data.summary.total}
                  color="text-blue-500"
                />
                <StatCard
                  icon={<Award className="w-5 h-5" />}
                  label="Принято"
                  value={data.summary.hired}
                  color="text-emerald-500"
                />
                <StatCard
                  icon={<Target className="w-5 h-5" />}
                  label="Конверсия"
                  value={`${data.summary.conversionRate}%`}
                  color="text-violet-500"
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Вакансий с откликами"
                  value={data.byVacancy.length}
                  color="text-amber-500"
                />
              </div>

              {/* Воронка */}
              <div className="rounded-xl border bg-card p-6">
                <h2 className="font-semibold mb-5">Этапы воронки</h2>
                <div className="space-y-3">
                  {data.funnel.map((stage, i) => {
                    const isRejected = stage.stage === "rejected"
                    const width = isRejected ? 0 : Math.max(4, Math.round((stage.count / maxCount) * 100))
                    return (
                      <div key={stage.stage} className="flex items-center gap-4">
                        <div className="w-24 text-sm text-right text-muted-foreground shrink-0">
                          {STAGE_LABELS[stage.stage] ?? stage.stage}
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-8 bg-muted/50 rounded-md overflow-hidden">
                            <div
                              className={cn("h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2", STAGE_COLORS[i])}
                              style={{ width: `${width}%` }}
                            >
                              {stage.count > 0 && (
                                <span className="text-xs text-white font-medium">{stage.count}</span>
                              )}
                            </div>
                          </div>
                          {stage.conversion !== null && stage.count > 0 && (
                            <span className="text-xs text-muted-foreground w-12 shrink-0">
                              {stage.conversion}%
                            </span>
                          )}
                          {stage.count === 0 && (
                            <span className="text-xs text-muted-foreground/40 w-12 shrink-0">0</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* По источникам */}
                <div className="rounded-xl border bg-card p-5">
                  <h2 className="font-semibold mb-4">По источникам</h2>
                  {data.bySource.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет данных</p>
                  ) : (
                    <div className="space-y-2">
                      {data.bySource.map((s) => {
                        const maxSrc = Math.max(...data.bySource.map((x) => x.count), 1)
                        const width = Math.round((s.count / maxSrc) * 100)
                        return (
                          <div key={s.source} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{SOURCE_LABELS[s.source] ?? s.source}</span>
                              <span className="text-muted-foreground">{s.count}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* По вакансиям */}
                <div className="rounded-xl border bg-card p-5">
                  <h2 className="font-semibold mb-4">Топ вакансий</h2>
                  {data.byVacancy.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет данных</p>
                  ) : (
                    <div className="space-y-2.5">
                      {data.byVacancy.slice(0, 6).map((v) => (
                        <div key={v.vacancyId} className="flex items-center justify-between text-sm">
                          <span className="truncate text-muted-foreground max-w-[70%]">{v.vacancyTitle}</span>
                          <span className="font-medium">{v.total}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className={cn("mb-2", color)}>{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
