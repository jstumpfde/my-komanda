"use client"

import { useMemo } from "react"
import type { Candidate } from "./candidate-card"
import type { CardDisplaySettings } from "./card-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { applySortMode, type CandidateSortMode } from "@/lib/candidate-sort"
import { MapPin, CheckCircle2, XCircle, ArrowRight, ThumbsUp, Clock, ArrowUp, ArrowDown, Star } from "lucide-react"

export type ListSortKey = "favorite" | "aiScore" | "progress" | "salary" | "responseDate" | "status"
export type ListSortDir = "asc" | "desc"
export interface ListSortState {
  key: ListSortKey
  dir: ListSortDir
}

interface Column {
  id: string
  title: string
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

interface ListViewProps {
  columns: Column[]
  settings: CardDisplaySettings
  onOpenProfile?: (candidate: Candidate, columnId: string) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
  onToggleFavorite?: (candidateId: string, isFavorite: boolean) => void
  sortMode?: CandidateSortMode
  /** Если задан — сортировка по колонке управляется снаружи (URL/сервер). */
  sort?: ListSortState | null
  onSortChange?: (next: ListSortState | null) => void
}

const DEFAULT_DIR: Record<ListSortKey, ListSortDir> = {
  favorite:     "desc",
  aiScore:      "desc",
  progress:     "desc",
  salary:       "desc",
  responseDate: "desc",
  status:       "asc",
}

function progressPercentOf(c: Candidate): number | null {
  const dp = c.demoProgressJson
  if (!dp || !Array.isArray(dp.blocks)) return null
  const total = dp.totalBlocks ?? dp.blocks.length
  if (!total) return null
  const completed = dp.blocks.filter((b) => b?.status === "completed").length
  return Math.round((completed / total) * 100)
}

function progressTextClass(p: number | null): string {
  if (p === null) return "text-muted-foreground"
  if (p >= 85) return "text-emerald-500"
  if (p >= 50) return "text-blue-500"
  if (p >= 25) return "text-yellow-500"
  return "text-zinc-500"
}

function formatResponseDate(d: Date | string | null | undefined): { short: string; full: string } | null {
  if (!d) return null
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yy = String(date.getFullYear()).slice(-2)
  const short = date.getFullYear() === now.getFullYear() ? `${dd}.${mm}` : `${dd}.${mm}.${yy}`
  const full = date.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  return { short, full }
}

const STAGE_ORDER: Record<string, number> = {
  new: 0, demo: 1, scheduled: 2, interview: 3, interviewed: 3, decision: 4, offer: 5, final_decision: 6, hired: 7, talent_pool: 8, rejected: 9,
}

function SortHeader({
  label, sortKey, sort, onToggle, align = "left",
}: {
  label: string
  sortKey: ListSortKey
  sort: ListSortState | null
  onToggle: (key: ListSortKey) => void
  align?: "left" | "center" | "right"
}) {
  const active = sort?.key === sortKey
  const dir = active ? sort!.dir : null
  const ariaSort = !active ? "none" : dir === "asc" ? "ascending" : "descending"
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-sort={ariaSort}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 -mx-1.5 py-0.5 hover:bg-accent/60 hover:text-foreground transition-colors",
        active ? "text-primary font-semibold bg-primary/10" : "text-muted-foreground",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
      )}
    >
      {label}
      {dir === "asc" ? (
        <ArrowUp className="size-3.5" strokeWidth={2.5} />
      ) : dir === "desc" ? (
        <ArrowDown className="size-3.5" strokeWidth={2.5} />
      ) : null}
    </button>
  )
}

export function ListView({
  columns, settings, onOpenProfile, onAction, onToggleFavorite,
  sortMode = "date_desc", sort = null, onSortChange,
}: ListViewProps) {
  const showProgress     = settings.showProgress !== false
  const showResponseDate = settings.showResponseDate !== false
  const showCity         = settings.showCity
  const showScore        = settings.showScore
  const showSalary       = settings.showSalary || settings.showSalaryFull
  const showSource       = settings.showSource
  const showActions      = settings.showActions

  const rawCandidates = useMemo(() => columns.flatMap((col) =>
    col.candidates.map((c) => ({ ...c, columnId: col.id, columnTitle: col.title, colorFrom: col.colorFrom, colorTo: col.colorTo }))
  ), [columns])

  const allCandidates = useMemo(() => {
    if (!sort) return applySortMode(rawCandidates, sortMode) as typeof rawCandidates
    const arr = [...rawCandidates]
    const mul = sort.dir === "asc" ? 1 : -1
    arr.sort((a, b) => {
      switch (sort.key) {
        case "favorite": {
          return mul * ((a.isFavorite ? 1 : 0) - (b.isFavorite ? 1 : 0))
        }
        case "aiScore": {
          return mul * ((a.aiScore ?? -1) - (b.aiScore ?? -1))
        }
        case "progress": {
          return mul * ((progressPercentOf(a) ?? -1) - (progressPercentOf(b) ?? -1))
        }
        case "salary": {
          const sa = a.salaryMax || a.salaryMin || 0
          const sb = b.salaryMax || b.salaryMin || 0
          return mul * (sa - sb)
        }
        case "responseDate": {
          const ta = (a.createdAt ? new Date(a.createdAt).getTime() : (a.addedAt as Date | undefined)?.getTime?.() ?? 0)
          const tb = (b.createdAt ? new Date(b.createdAt).getTime() : (b.addedAt as Date | undefined)?.getTime?.() ?? 0)
          return mul * (ta - tb)
        }
        case "status": {
          return mul * ((STAGE_ORDER[a.columnId] ?? 99) - (STAGE_ORDER[b.columnId] ?? 99))
        }
      }
      return 0
    })
    return arr
  }, [rawCandidates, sort, sortMode])

  const handleSort = (key: ListSortKey) => {
    if (!onSortChange) return
    if (!sort || sort.key !== key) {
      onSortChange({ key, dir: DEFAULT_DIR[key] })
    } else if (sort.dir === DEFAULT_DIR[key]) {
      onSortChange({ key, dir: sort.dir === "asc" ? "desc" : "asc" })
    } else {
      onSortChange(null)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-success/10 text-success border-success/20"
    if (score >= 70) return "bg-warning/10 text-warning border-warning/20"
    return "bg-destructive/10 text-destructive border-destructive/20"
  }

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      "hh.ru": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
      "Avito": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
      "Telegram": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
      "LinkedIn": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    }
    return colors[source] || "bg-muted text-muted-foreground border-border"
  }

  const cols: string[] = ["40px"] // ★
  cols.push("minmax(180px, 2fr)")  // Кандидат
  if (showScore) cols.push("90px")
  if (showProgress) cols.push("110px")
  if (showSalary) cols.push("140px")
  if (showCity) cols.push("120px")
  if (showResponseDate) cols.push("110px")
  cols.push("130px") // Статус
  if (showSource) cols.push("110px")
  if (showActions) cols.push("auto")

  const gridStyle = { gridTemplateColumns: cols.join(" ") }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      {/* Table Header */}
      <div
        className="grid gap-3 px-4 py-2.5 bg-muted/60 border-b border-border text-[13px] font-medium text-muted-foreground tracking-normal items-center"
        style={gridStyle}
      >
        <button
          type="button"
          onClick={() => handleSort("favorite")}
          aria-sort={sort?.key === "favorite" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
          className={cn(
            "inline-flex items-center justify-center gap-0.5 rounded-md py-0.5 hover:bg-accent/60 transition-colors",
            sort?.key === "favorite" && "bg-primary/10",
          )}
          aria-label="Сортировать по избранному"
        >
          <Star className={cn("size-4", sort?.key === "favorite" ? "fill-amber-400 text-amber-400" : "")} />
          {sort?.key === "favorite" && (
            sort.dir === "asc"
              ? <ArrowUp className="size-3 text-primary" strokeWidth={2.5} />
              : <ArrowDown className="size-3 text-primary" strokeWidth={2.5} />
          )}
        </button>
        <div>Кандидат</div>
        {showScore && <SortHeader label="AI скор" sortKey="aiScore" sort={sort} onToggle={handleSort} />}
        {showProgress && <SortHeader label="Прогресс" sortKey="progress" sort={sort} onToggle={handleSort} />}
        {showSalary && <SortHeader label="Зарплата" sortKey="salary" sort={sort} onToggle={handleSort} />}
        {showCity && <div>Город</div>}
        {showResponseDate && <SortHeader label="Дата отклика" sortKey="responseDate" sort={sort} onToggle={handleSort} />}
        <SortHeader label="Статус" sortKey="status" sort={sort} onToggle={handleSort} />
        {showSource && <div>Источник</div>}
        {showActions && <div>Действия</div>}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {allCandidates.map((candidate, i) => {
          const isDecisionStage = candidate.columnId === "interview" || candidate.columnId === "offer"
          const aiActuallyRan = candidate.aiScore != null && !!candidate.aiSummary
          const progress = progressPercentOf(candidate)
          const dt = formatResponseDate(candidate.createdAt ?? candidate.addedAt)
          return (
            <div
              key={candidate.id}
              className={cn(
                "grid gap-3 px-4 items-center hover:bg-muted/40 transition-colors min-h-[56px] text-[14px] cursor-pointer",
                i % 2 === 0 ? "" : "bg-muted/20"
              )}
              style={gridStyle}
              onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
            >
              {/* Favorite */}
              <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.(candidate.id, !candidate.isFavorite)}
                  className="inline-flex items-center justify-center p-1 rounded hover:bg-accent/60 transition-colors"
                  aria-label={candidate.isFavorite ? "Убрать из избранного" : "В избранное"}
                >
                  <Star className={cn("size-4", candidate.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")} />
                </button>
              </div>

              {/* Name + experience */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-foreground truncate">{candidate.name}</p>
                  {settings.showExperience && (
                    <p className="text-[13px] text-muted-foreground truncate">{candidate.experience}</p>
                  )}
                </div>
              </div>

              {/* Score */}
              {showScore && (
                <div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[14px] border font-semibold",
                      aiActuallyRan ? getScoreColor(candidate.aiScore!) : "text-muted-foreground/50 bg-muted/30 border-muted"
                    )}
                  >
                    {aiActuallyRan ? candidate.aiScore : "—"}
                  </Badge>
                </div>
              )}

              {/* Progress */}
              {showProgress && (
                <div className={cn("text-sm font-medium tabular-nums", progressTextClass(progress))}>
                  {progress === null ? "—" : `${progress}%`}
                </div>
              )}

              {/* Salary */}
              {showSalary && (
                <div className="text-[14px] font-medium text-foreground whitespace-nowrap">
                  {settings.showSalaryFull
                    ? `${candidate.salaryMin.toLocaleString("ru-RU")} — ${candidate.salaryMax.toLocaleString("ru-RU")} ₽`
                    : `${Math.round(candidate.salaryMin / 1000)}-${Math.round(candidate.salaryMax / 1000)}k`
                  }
                </div>
              )}

              {/* City */}
              {showCity && (
                <div className="flex items-center gap-1 text-[14px] text-muted-foreground min-w-0">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{candidate.city}</span>
                </div>
              )}

              {/* Response Date */}
              {showResponseDate && (
                <div className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                  {dt ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{dt.short}</span>
                      </TooltipTrigger>
                      <TooltipContent>{dt.full}</TooltipContent>
                    </Tooltip>
                  ) : "—"}
                </div>
              )}

              {/* Stage badge */}
              <div>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white whitespace-nowrap"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.columnTitle}
                </span>
              </div>

              {/* Source */}
              {showSource && (
                <div>
                  <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
                    {candidate.source}
                  </Badge>
                </div>
              )}

              {/* Actions */}
              {showActions && (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isDecisionStage ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10" title="Принять" onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}>
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Отказать" onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}>
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-warning hover:bg-warning/10" title="В резерв" onClick={() => onAction?.(candidate.id, candidate.columnId, "reserve")}>
                        <Clock className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10" title="Пригласить" onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Отказать" onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}>
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    title="Открыть"
                    onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
