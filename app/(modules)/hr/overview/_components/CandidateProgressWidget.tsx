"use client"

/**
 * Виджет "Прогресс кандидатов по вакансиям" для HR-дашборда.
 *
 * Показывает топ-5 активных вакансий с числом откликов и мини-визуализацией
 * распределения кандидатов по группам прогресса демо (5 цветных точек с числами).
 *
 * Источник данных: GET /api/modules/hr/dashboard/progress-widget.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ProgressBuckets {
  "0": number
  "1to30": number
  "30to70": number
  "70to99": number
  "100": number
}

interface ProgressWidgetItem {
  vacancyId: string
  title: string
  totalCandidates: number
  progressBuckets: ProgressBuckets
}

type BucketKey = keyof ProgressBuckets

const BUCKET_ORDER: { key: BucketKey; color: string; label: string }[] = [
  { key: "0",      color: "bg-muted-foreground/40",                         label: "Не начато" },
  { key: "1to30",  color: "bg-yellow-500",                                  label: "1–29%" },
  { key: "30to70", color: "bg-orange-500",                                  label: "30–69%" },
  { key: "70to99", color: "bg-blue-500",                                    label: "70–99%" },
  { key: "100",    color: "bg-emerald-500",                                 label: "100%" },
]

export function CandidateProgressWidget() {
  const [items, setItems] = useState<ProgressWidgetItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/hr/dashboard/progress-widget")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as ProgressWidgetItem[]
      })
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки")
      })
    return () => { cancelled = true }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Прогресс кандидатов по вакансиям
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Loading */}
        {items === null && !error && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Не удалось загрузить данные
          </p>
        )}

        {/* Empty */}
        {items !== null && !error && items.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Нет активных вакансий с откликами
          </p>
        )}

        {/* Data */}
        {items !== null && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((v) => (
              <div key={v.vacancyId} className="flex flex-col gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/hr/vacancies/${v.vacancyId}`}
                    className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate"
                    title={v.title}
                  >
                    {v.title}
                  </Link>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {v.totalCandidates} {pluralCandidates(v.totalCandidates)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {BUCKET_ORDER.map((b) => {
                    const count = v.progressBuckets[b.key] ?? 0
                    return (
                      <div
                        key={b.key}
                        className="flex items-center gap-1"
                        title={`${b.label}: ${count}`}
                      >
                        <span className={cn("inline-block w-2.5 h-2.5 rounded-full", b.color, count === 0 && "opacity-40")} />
                        <span className={cn("text-xs tabular-nums", count === 0 ? "text-muted-foreground/50" : "text-foreground")}>
                          {count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t">
          <Link
            href="/hr/candidates/progress"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Все вакансии <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function pluralCandidates(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "чел"
  return "чел"
}
