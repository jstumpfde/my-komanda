"use client"

// Блок владельцу разбора: «Ваш разбор посмотрели N раз (M мин чтения)».
// Показывается только если страница открыта создателем прогона — определяем
// по sessionStorage-метке tip_last_run_share (ставится в tip-client.tsx
// сразу после генерации, см. startPolling). Данные — GET
// /api/public/tip/run/[id]/stats -> lib/tip/analytics.ts getRunStats():
//   { viewsTotal, viewsUnique, totalSeconds, avgScrollPct }

import { useEffect, useState } from "react"
import { Eye } from "lucide-react"

interface StatsResponse {
  viewsTotal: number
  viewsUnique: number
  totalSeconds: number
  avgScrollPct: number
}

export function OwnerStatsBanner({ shareToken }: { shareToken: string }) {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const savedShare = sessionStorage.getItem("tip_last_run_share")
      const savedRunId = sessionStorage.getItem("tip_last_run_id")
      if (savedShare === shareToken && savedRunId) {
        setRunId(savedRunId)
      }
    } catch {
      // sessionStorage недоступен — просто не показываем баннер.
    }
  }, [shareToken])

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    fetch(`/api/public/tip/run/${runId}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: StatsResponse | null) => {
        if (!cancelled && d) setStats(d)
      })
      .catch(() => {
        // роут ещё не готов или сеть недоступна — молча пропускаем баннер.
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  if (!runId || !stats || stats.viewsTotal < 1) return null

  const minutes = Math.max(1, Math.round(stats.totalSeconds / 60))

  return (
    <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-800">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Ваш разбор посмотрели{" "}
        <span className="font-semibold">
          {stats.viewsTotal} {pluralizeTimes(stats.viewsTotal)}
        </span>{" "}
        ({minutes} {pluralizeMinutes(minutes)} чтения)
      </span>
    </div>
  )
}

function pluralizeTimes(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return "раз"
  if (mod10 === 1) return "раз"
  return "раз"
}

function pluralizeMinutes(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return "минут"
  if (mod10 === 1) return "минута"
  if (mod10 >= 2 && mod10 <= 4) return "минуты"
  return "минут"
}
