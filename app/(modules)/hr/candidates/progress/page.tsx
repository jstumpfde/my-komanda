"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Activity, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface CandidateProgress {
  id: string
  name: string
  vacancyId: string
  vacancyTitle: string
  stage: string
  source: string | null
  demoTotalBlocks: number
  demoCompletedBlocks: number
  progressPercent: number
  firstAnswerAt: string | null
  lastAnswerAt: string | null
  isActive: boolean
  durationSeconds: number | null
}

interface VacancyOption {
  id: string
  title: string
}

const STATUS_LABELS: Record<string, string> = {
  new: "Новый", demo: "На демо", scheduled: "Интервью назначено", interviewed: "Интервью пройдено",
  interview: "Интервью", decision: "Решение", offer: "Оффер", hired: "Принят",
  rejected: "Отказ", talent_pool: "Резерв", pending: "Ожидание",
}

const STATUS_COLORS: Record<string, string> = {
  new:          "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  demo:         "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  scheduled:    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  interviewed:  "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  interview:    "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  decision:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  offer:        "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hired:        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected:     "bg-muted text-muted-foreground",
  talent_pool:  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  pending:      "bg-gray-500/15 text-gray-600 dark:text-gray-400",
}

const STATUS_ORDER: Record<string, number> = {
  new: 0, demo: 1, scheduled: 2, interviewed: 3, interview: 3,
  decision: 4, offer: 5, hired: 6, rejected: 7, talent_pool: 8,
}

type SortKey = "first_in" | "longest" | "most_progress" | "stage"

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "first_in",      label: "Раньше зашёл" },
  { value: "longest",       label: "Дольше шёл" },
  { value: "most_progress", label: "Больше прогресс" },
  { value: "stage",         label: "Стадия" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progressBadgeClass(percent: number, isActive: boolean): string {
  if (percent === 0) return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
  if (percent === 100) return "bg-emerald-500 text-white"
  if (percent >= 71) return "bg-blue-500 text-white"
  if (percent >= 31) return "bg-amber-500 text-white"
  // 1–30 → красный, мерцает если активный
  return cn("bg-red-500 text-white", isActive && "animate-pulse")
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}с`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}м ${s}с` : `${m}м`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm > 0 ? `${h}ч ${mm}м` : `${h}ч`
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru })
  } catch {
    return "—"
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CandidatesProgressPage() {
  const [items, setItems] = useState<CandidateProgress[]>([])
  const [vacancies, setVacancies] = useState<VacancyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>("first_in")
  const [vacancyFilter, setVacancyFilter] = useState<string>("all")
  const [onlyActive, setOnlyActive] = useState(false)

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/modules/hr/candidates/progress")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => setItems(Array.isArray(data) ? data : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }
    fetchData()
    const interval = setInterval(fetchData, 10_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch("/api/modules/hr/vacancies?limit=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { vacancies?: { id: string; title: string }[] } | null) => {
        if (data?.vacancies) {
          setVacancies(data.vacancies.map((v) => ({ id: v.id, title: v.title })))
        }
      })
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    let result = items
    if (vacancyFilter !== "all") {
      result = result.filter((c) => c.vacancyId === vacancyFilter)
    }
    if (onlyActive) {
      result = result.filter((c) => c.isActive)
    }

    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "first_in": {
          // раньше зашёл — у кого firstAnswerAt раньше
          const ax = a.firstAnswerAt ? new Date(a.firstAnswerAt).getTime() : Infinity
          const bx = b.firstAnswerAt ? new Date(b.firstAnswerAt).getTime() : Infinity
          return ax - bx
        }
        case "longest": {
          const ax = a.durationSeconds ?? -1
          const bx = b.durationSeconds ?? -1
          return bx - ax
        }
        case "most_progress":
          return b.progressPercent - a.progressPercent
        case "stage":
          return (STATUS_ORDER[a.stage] ?? 99) - (STATUS_ORDER[b.stage] ?? 99)
      }
    })
    return result
  }, [items, sortKey, vacancyFilter, onlyActive])

  const activeCount = useMemo(() => items.filter((c) => c.isActive).length, [items])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  Прогресс кандидатов
                  {activeCount > 0 && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-1.5 font-normal">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {activeCount} активн.
                    </Badge>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {filtered.length} из {items.length} кандидатов · обновляется каждые 10 сек
                </p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[200px] h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
                <SelectTrigger className="w-[260px] h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все вакансии</SelectItem>
                  {vacancies.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={onlyActive}
                  onCheckedChange={(v) => setOnlyActive(v === true)}
                />
                Только активные (за 30 мин)
              </label>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Activity className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">
                  {items.length === 0 ? "Никто не проходит демо" : "Нет кандидатов по фильтру"}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {items.length === 0
                    ? "Прогресс появится после первого ответа кандидата"
                    : "Попробуйте изменить фильтры"}
                </p>
              </div>
            )}

            {/* List */}
            {!loading && filtered.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {filtered.map((c) => {
                  const durationLabel = c.isActive && c.durationSeconds !== null
                    ? `идёт ${formatDuration(c.durationSeconds)}`
                    : c.durationSeconds !== null
                      ? formatDuration(c.durationSeconds)
                      : "—"
                  return (
                    <Card
                      key={c.id}
                      className={cn(
                        "p-4 flex items-center gap-4 transition-colors hover:bg-accent/40",
                        c.isActive && "border-emerald-500/40 ring-1 ring-emerald-500/20",
                      )}
                    >
                      {/* Big % badge */}
                      <div
                        className={cn(
                          "shrink-0 size-16 rounded-xl flex flex-col items-center justify-center font-bold leading-none",
                          progressBadgeClass(c.progressPercent, c.isActive),
                        )}
                      >
                        <span className="text-xl">{c.progressPercent}</span>
                        <span className="text-[10px] opacity-80 mt-0.5">%</span>
                      </div>

                      {/* Name + vacancy */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/hr/candidates/${c.id}`}
                            className="text-sm font-medium text-foreground hover:text-primary hover:underline transition-colors truncate"
                          >
                            {c.name}
                          </Link>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-0 text-xs",
                              STATUS_COLORS[c.stage] ?? "bg-muted text-muted-foreground",
                            )}
                          >
                            {STATUS_LABELS[c.stage] ?? c.stage}
                          </Badge>
                          {c.isActive && (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-1.5 font-normal text-[11px]">
                              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              онлайн
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {c.vacancyTitle}
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="shrink-0 grid grid-cols-3 gap-6 text-right">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Блоки
                          </p>
                          <p className="text-sm font-medium text-foreground tabular-nums">
                            {c.demoCompletedBlocks} / {c.demoTotalBlocks}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Длительность
                          </p>
                          <p className="text-sm font-medium text-foreground tabular-nums">
                            {durationLabel}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Зашёл
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {formatRelative(c.firstAnswerAt)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
