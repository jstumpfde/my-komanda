"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  TrendingDown, Users, UserCheck, Clock, Target, BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FunnelStage {
  key: string
  label: string
  color: string
  value: number
  conversion: number
}

interface SourceData {
  source: string
  count: number
}

interface VacancyOption {
  id: string
  title: string
  status: string
}

interface FunnelData {
  funnel: FunnelStage[]
  sources: SourceData[]
  vacancies: VacancyOption[]
  summary: {
    total: number
    hired: number
    rejected: number
    conversionRate: number
    avgTimeToHire: number
  }
}

const SOURCE_LABELS: Record<string, string> = {
  hh: "hh.ru",
  avito: "Авито",
  telegram: "Telegram",
  site: "Сайт",
  referral: "Реферал",
  manual: "Вручную",
  unknown: "Другое",
}

export default function FunnelPage() {
  const [data, setData] = useState<FunnelData | null>(null)
  const [vacancyId, setVacancyId] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = vacancyId !== "all" ? `?vacancyId=${vacancyId}` : ""
      const res = await fetch(`/api/modules/hr/funnel${params}`)
      setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [vacancyId])

  useEffect(() => { load() }, [load])

  const maxValue = data ? Math.max(...data.funnel.map(s => s.value), 1) : 1

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Воронка найма" subtitle="Конверсия кандидатов по этапам" />
        <main className="p-6 space-y-6">

          {/* Фильтр по вакансии */}
          <div className="flex items-center gap-4">
            <Select value={vacancyId} onValueChange={setVacancyId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Все вакансии" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все вакансии</SelectItem>
                {data?.vacancies.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Сводка */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Всего кандидатов</p>
                <p className="text-2xl font-semibold">{data.summary.total}</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/10">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Нанято</p>
                <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{data.summary.hired}</p>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10">
                <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">Конверсия</p>
                <p className="text-2xl font-semibold text-blue-700 dark:text-blue-400">{data.summary.conversionRate}%</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Ср. время найма</p>
                <p className="text-2xl font-semibold">{data.summary.avgTimeToHire} дн</p>
              </div>
            </div>
          )}

          {/* Визуальная воронка */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
          ) : data && data.funnel.length > 0 ? (
            <div className="space-y-6">
              {/* Воронка как горизонтальные бары */}
              <div className="border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <TrendingDown className="size-4" />
                  Воронка конверсии
                </h3>
                <div className="space-y-3">
                  {data.funnel.map((stage, i) => {
                    const widthPct = Math.max(5, (stage.value / maxValue) * 100)
                    return (
                      <div key={stage.key} className="flex items-center gap-4">
                        <div className="w-40 text-right">
                          <p className="text-sm font-medium">{stage.label}</p>
                          {i > 0 && (
                            <p className="text-[10px] text-muted-foreground">↓ {stage.conversion}%</p>
                          )}
                        </div>
                        <div className="flex-1 relative">
                          <div className="h-10 bg-muted/30 rounded-lg overflow-hidden">
                            <div
                              className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
                            >
                              <span className="text-sm font-bold text-white drop-shadow-sm">
                                {stage.value}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Источники */}
              {data.sources.length > 0 && (
                <div className="border border-border rounded-xl p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="size-4" />
                    Источники кандидатов
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {data.sources
                      .sort((a, b) => b.count - a.count)
                      .map(s => {
                        const total = data.sources.reduce((acc, x) => acc + x.count, 0)
                        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
                        return (
                          <div key={s.source} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{SOURCE_LABELS[s.source] || s.source}</p>
                              <p className="text-xs text-muted-foreground">{pct}% от общего</p>
                            </div>
                            <span className="text-lg font-semibold">{s.count}</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Target className="size-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Нет данных по кандидатам</p>
              <p className="text-xs text-muted-foreground mt-1">Создайте вакансию и добавьте кандидатов</p>
            </div>
          )}

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
