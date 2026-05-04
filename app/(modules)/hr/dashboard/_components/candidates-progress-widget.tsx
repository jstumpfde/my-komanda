"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  DEMO_PROGRESS_GROUP_ORDER,
  getDemoProgressGroup,
  type DemoProgressGroupCounts,
  type DemoProgressGroupKey,
} from "@/lib/demo-progress-groups"

interface ProgressWidgetItem {
  vacancyId: string
  title: string
  totalCandidates: number
  progressBuckets: DemoProgressGroupCounts
}

const GROUP_LABELS: Record<DemoProgressGroupKey, string> = {
  none: "Не начато",
  low: "1–29%",
  mid: "30–69%",
  high: "70–99%",
  done: "100%",
}

// Точки берутся из ключей групп — те же цвета, что в карточке кандидата и шапке колонки канбана.
const GROUP_DOT_CLASS: Record<DemoProgressGroupKey, string> = {
  none: getDemoProgressGroup(0).dotColor,
  low: getDemoProgressGroup(15).dotColor,
  mid: getDemoProgressGroup(50).dotColor,
  high: getDemoProgressGroup(85).dotColor,
  done: getDemoProgressGroup(100).dotColor,
}

export function CandidatesProgressWidget() {
  const [items, setItems] = useState<ProgressWidgetItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/hr/dashboard/progress-widget")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ProgressWidgetItem[]) => {
        if (cancelled) return
        setItems(Array.isArray(data) ? data : [])
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setItems([])
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" />
          Прогресс кандидатов по вакансиям
        </h3>
        <Link
          href="/hr/candidates/progress"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Все вакансии <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {items === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          {error ? "Не удалось загрузить данные" : "Нет активных вакансий"}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={item.vacancyId} className="flex items-center justify-between gap-3">
              <Link
                href={`/hr/vacancies/${item.vacancyId}`}
                className="text-sm font-medium truncate hover:underline min-w-0 flex-1"
              >
                {item.title}
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  {DEMO_PROGRESS_GROUP_ORDER.map(key => {
                    const count = item.progressBuckets[key] ?? 0
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-1"
                        title={`${GROUP_LABELS[key]}: ${count}`}
                      >
                        <span className={cn("w-2 h-2 rounded-full", GROUP_DOT_CLASS[key])} />
                        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                      </div>
                    )
                  })}
                </div>
                <span className="text-xs font-semibold tabular-nums w-10 text-right">
                  {item.totalCandidates}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
