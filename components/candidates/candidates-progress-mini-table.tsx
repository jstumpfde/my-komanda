"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Star, Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface MiniCandidate {
  id: string
  name: string
  vacancyId?: string | null
  vacancyTitle: string
  demoTotalBlocks: number
  demoCompletedBlocks: number
  progressPercent: number | null
  isActive: boolean
  isFavorite: boolean
}

function progressTextClass(percent: number | null, isActive: boolean): string {
  if (percent === null || percent === 0) return "text-muted-foreground"
  if (percent === 100) return "text-emerald-500"
  if (percent >= 71) return "text-blue-500"
  if (percent >= 31) return "text-amber-600"
  return cn("text-red-500", isActive && "animate-pulse")
}

export function CandidatesProgressMiniTable({
  limit = 5,
  vacancyId,
  expanded = false,
  maxExpanded = 20,
}: {
  limit?: number
  // #49: фильтр по вакансии — если передан, показываем только её кандидатов.
  vacancyId?: string
  // #52: режим раскрытия — показывать до maxExpanded строк вместо limit.
  expanded?: boolean
  maxExpanded?: number
}) {
  const router = useRouter()
  const [items, setItems] = useState<MiniCandidate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/modules/hr/candidates")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => setItems(Array.isArray(data) ? data : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }
    fetchData()
    const interval = setInterval(fetchData, 10_000)
    return () => clearInterval(interval)
  }, [])

  const top = useMemo(() => {
    let filtered = items.filter(
      (c) => c.progressPercent !== null && c.demoCompletedBlocks > 0,
    )
    if (vacancyId && vacancyId !== "all") {
      filtered = filtered.filter((c) => c.vacancyId === vacancyId)
    }
    filtered.sort((a, b) => (b.progressPercent ?? 0) - (a.progressPercent ?? 0))
    const slice = expanded ? maxExpanded : limit
    return filtered.slice(0, slice)
  }, [items, limit, vacancyId, expanded, maxExpanded])

  async function toggleFavorite(id: string) {
    const target = items.find((c) => c.id === id)
    const next = !(target?.isFavorite ?? false)
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, isFavorite: next } : c)))
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}/favorite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isFavorite: !next } : c)),
      )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (top.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Activity className="size-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground font-medium">
          Никто не проходит демо
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Прогресс появится после первого ответа кандидата
        </p>
      </div>
    )
  }

  return (
    <TableCard>
      <DataTable className="text-left">
        <DataHead>
          <DataHeadCell width="40px"></DataHeadCell>
          <DataHeadCell>ФИО</DataHeadCell>
          <DataHeadCell>Вакансия</DataHeadCell>
          <DataHeadCell>Прогресс</DataHeadCell>
          <DataHeadCell>Блоки</DataHeadCell>
        </DataHead>
        <tbody>
          {top.map((c) => (
            <DataRow
              key={c.id}
              onClick={() => router.push(`/hr/candidates/${c.id}`)}
              className="cursor-pointer hover:bg-accent/40"
            >
              <DataCell className="px-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFavorite(c.id)
                  }}
                  className="inline-flex items-center justify-center p-1 rounded hover:bg-accent/60 transition-colors"
                  aria-label={c.isFavorite ? "Убрать из избранного" : "В избранное"}
                >
                  <Star
                    className={cn(
                      "size-4",
                      c.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                    )}
                  />
                </button>
              </DataCell>
              <DataCell className="font-medium text-foreground">{c.name}</DataCell>
              <DataCell className="text-muted-foreground truncate max-w-[200px]">
                {c.vacancyTitle}
              </DataCell>
              <DataCell>
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    progressTextClass(c.progressPercent, c.isActive),
                  )}
                >
                  {c.progressPercent}%
                </span>
              </DataCell>
              <DataCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                {Math.min(c.demoCompletedBlocks, c.demoTotalBlocks)} / {c.demoTotalBlocks}
              </DataCell>
            </DataRow>
          ))}
        </tbody>
      </DataTable>
    </TableCard>
  )
}
