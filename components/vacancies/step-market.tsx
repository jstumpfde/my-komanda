"use client"

import { useEffect, useMemo, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { TrendingUp, Star, ExternalLink, PlugZap, AlertTriangle, SearchX } from "lucide-react"
import Link from "next/link"
import type { VacancyDraft } from "@/lib/vacancy-types"
import type { MarketStatsPayload } from "@/app/api/modules/hr/market-stats/route"

interface Props {
  draft: VacancyDraft
  onChange: (draft: VacancyDraft) => void
}

type FetchState =
  | { kind: "loading" }
  | { kind: "no_integration" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ok"; data: MarketStatsPayload }

export function StepMarket({ draft, onChange }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    setState({ kind: "loading" })

    const params = new URLSearchParams({ title: draft.title || "", city: draft.city || "" })
    fetch(`/api/modules/hr/market-stats?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return
        const json = await res.json().catch(() => null)
        if (res.status === 409 && json?.error === "hh_not_connected") {
          setState({ kind: "no_integration" })
          return
        }
        if (!res.ok) {
          setState({ kind: "error", message: json?.message || "Не удалось получить данные hh" })
          return
        }
        const data = json as MarketStatsPayload
        if (!data.found) {
          setState({ kind: "empty" })
          return
        }
        setState({ kind: "ok", data })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "Не удалось получить данные hh" })
      })

    return () => {
      cancelled = true
    }
  }, [draft.title, draft.city])

  const midSalary = Math.round((draft.salaryMin + draft.salaryMax) / 2)

  const zone = useMemo(() => {
    if (state.kind !== "ok" || state.data.salaryMedian == null) return null
    const ratio = midSalary / state.data.salaryMedian
    if (ratio < 0.8) return { label: "Красная зона", desc: "Зарплата значительно ниже рынка — мало откликов", color: "bg-red-500/10 border-red-200 text-red-700 dark:text-red-400" }
    if (ratio < 1.0) return { label: "Жёлтая зона", desc: "Зарплата чуть ниже рынка — средний поток", color: "bg-amber-500/10 border-amber-200 text-amber-700 dark:text-amber-400" }
    return { label: "Зелёная зона", desc: "Конкурентная зарплата — максимум откликов", color: "bg-emerald-500/10 border-emerald-200 text-emerald-700 dark:text-emerald-400" }
  }, [midSalary, state])

  const fetchedAtLabel = state.kind === "ok"
    ? new Date(state.data.fetchedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Анализ рынка</h2>
        <p className="text-sm text-muted-foreground">
          Данные по запросу «{draft.title || "не указано"}» в регионе «{draft.city || "вся Россия"}»
        </p>
      </div>

      {state.kind === "loading" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardContent>
        </Card>
      )}

      {state.kind === "no_integration" && (
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
              <PlugZap className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Подключите hh.ru в настройках, чтобы видеть статистику рынка</p>
              <Link href="/hr/integrations" className="text-sm text-primary underline underline-offset-2">
                Перейти к интеграциям
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {state.kind === "error" && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium">{state.message}</p>
          </CardContent>
        </Card>
      )}

      {state.kind === "empty" && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
              <SearchX className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium">По запросу ничего не нашлось — уточните название</p>
          </CardContent>
        </Card>
      )}

      {state.kind === "ok" && (
        <>
          {/* Median */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Медианная зарплата по рынку</p>
                  {state.data.salaryMedian != null ? (
                    <p className="text-2xl font-bold text-foreground">{state.data.salaryMedian.toLocaleString("ru-RU")} ₽</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">В найденных вакансиях зарплата не указана</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Найдено {state.data.found.toLocaleString("ru-RU")} вакансий по запросу</span>
                {state.data.salaryFrom != null && (
                  <>
                    <span className="text-border">|</span>
                    <span>Мин: {state.data.salaryFrom.toLocaleString("ru-RU")} ₽</span>
                  </>
                )}
                {state.data.salaryTo != null && (
                  <>
                    <span className="text-border">|</span>
                    <span>Макс: {state.data.salaryTo.toLocaleString("ru-RU")} ₽</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Salary slider */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Ваша зарплатная вилка</p>
                <p className="text-sm font-bold text-foreground">
                  {draft.salaryMin.toLocaleString("ru-RU")} – {draft.salaryMax.toLocaleString("ru-RU")} ₽
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">От</label>
                  <Slider
                    value={[draft.salaryMin]}
                    onValueChange={([v]) => onChange({ ...draft, salaryMin: v })}
                    min={30000}
                    max={400000}
                    step={5000}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">До</label>
                  <Slider
                    value={[draft.salaryMax]}
                    onValueChange={([v]) => onChange({ ...draft, salaryMax: v })}
                    min={30000}
                    max={400000}
                    step={5000}
                  />
                </div>
              </div>

              {/* Zone — только если знаем медиану */}
              {zone && (
                <div className={cn("p-3 rounded-lg border", zone.color)}>
                  <p className="text-sm font-semibold">{zone.label}</p>
                  <p className="text-xs mt-0.5 opacity-80">{zone.desc}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Similar vacancies */}
          {state.data.similar.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                Похожие вакансии на рынке
              </h3>
              <div className="space-y-3">
                {state.data.similar.map((v, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{v.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {v.employer}{v.area ? ` · ${v.area}` : ""}
                          </p>
                          <p className="text-sm font-medium text-foreground mt-1">{v.salary}</p>
                        </div>
                        {v.url && (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Открыть вакансию на hh.ru"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mt-1" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {fetchedAtLabel && (
        <p className="text-xs text-muted-foreground text-right">По данным hh.ru · {fetchedAtLabel}</p>
      )}
    </div>
  )
}
