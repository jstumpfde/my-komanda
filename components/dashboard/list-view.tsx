"use client"

import { useMemo, useRef } from "react"
import type { Candidate } from "./candidate-card"
import { CandidateAvatar } from "./candidate-avatar"
import type { CardDisplaySettings } from "./card-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { applySortMode, type CandidateSortMode } from "@/lib/candidate-sort"
import { MapPin, CheckCircle2, XCircle, ArrowRight, ThumbsUp, Clock, ArrowUp, ArrowDown, Star } from "lucide-react"
import { DemoProgressBar, calcDemoPercent, calcDemoFraction } from "@/components/hr/demo-progress-bar"

export type ListSortKey = "favorite" | "name" | "aiScore" | "progress" | "salary" | "responseDate" | "status" | "city" | "source"
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
  /** Множественное выделение для bulk-операций. Если не задано — колонка чекбоксов скрыта. */
  selectedIds?: Set<string>
  onSelectionChange?: (next: Set<string>) => void
  /** @deprecated Колонка № удалена. Поле сохранено для совместимости интерфейса с callers. */
  startIndex?: number
}

const DEFAULT_DIR: Record<ListSortKey, ListSortDir> = {
  favorite:     "desc",
  name:         "asc",
  aiScore:      "desc",
  progress:     "desc",
  salary:       "desc",
  responseDate: "desc",
  status:       "asc",
  city:         "asc",
  source:       "asc",
}

/** Возвращает 0..100 либо null (не приступал).
 *  Приоритет: API-поле progressPercent (page-based, корректно для всех данных).
 *  Fallback на calcDemoPercent — для legacy-записей без API-полей. */
function progressPercentOf(c: Candidate): number | null {
  const apiPct = (c as { progressPercent?: number | null }).progressPercent
  if (typeof apiPct === "number") return apiPct
  return calcDemoPercent(c.demoProgressJson).percent
}

function formatResponseDate(d: Date | string | null | undefined): { short: string; full: string } | null {
  if (!d) return null
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yy = String(date.getFullYear()).slice(-2)
  const short = `${dd}.${mm}.${yy}`
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
        "inline-flex items-center gap-1 rounded-md px-1.5 -mx-1.5 py-0.5 hover:bg-accent hover:text-foreground transition-colors whitespace-nowrap",
        active ? "text-primary font-semibold bg-primary/20 ring-1 ring-primary/30" : "text-muted-foreground",
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
  selectedIds, onSelectionChange,
}: ListViewProps) {
  const lastSelectedIdRef = useRef<string | null>(null)
  const selectionEnabled = !!selectedIds && !!onSelectionChange
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
        case "name": {
          const na = (a.name ?? "").trim()
          const nb = (b.name ?? "").trim()
          if (!na && !nb) return 0
          if (!na) return 1
          if (!nb) return -1
          return mul * na.localeCompare(nb, "ru")
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
        case "city": {
          // null/пустые в конец независимо от направления — иначе они доминируют
          // и активная сортировка перестаёт давать различимый результат.
          const ca = (a.city ?? "").trim()
          const cb = (b.city ?? "").trim()
          if (!ca && !cb) return 0
          if (!ca) return 1
          if (!cb) return -1
          return mul * ca.localeCompare(cb, "ru")
        }
        case "source": {
          const sa = (a.source ?? "").trim()
          const sb = (b.source ?? "").trim()
          if (!sa && !sb) return 0
          if (!sa) return 1
          if (!sb) return -1
          return mul * sa.localeCompare(sb, "ru")
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
      // 3-й клик — сброс на глобальный дефолт (progress desc), а не null.
      // Раньше возвращали null, но в pagination-режиме это приводило к
      // визуальному "залипанию" последней сортировки (paginated state не
      // сбрасывался). Явный reset к дефолту делает цикл предсказуемым.
      onSortChange({ key: "progress", dir: "desc" })
    }
  }

  const getScoreColor = (score: number) => {
    if (score > 70) return "bg-success/10 text-success border-success/20"
    if (score >= 40) return "bg-warning/10 text-warning border-warning/20"
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

  // Пропорциональное растяжение: разные fr-коэффициенты задают доли свободного
  // места. ★/Источник/Действия — фиксированной ширины (без fr), не растут.
  // Балансировка после расширения воронки (drizzle/0083): новые badge'и
  // длиннее («Первичный контакт» ~17 симв, «Анкета заполнена» ~16 симв),
  // поэтому Статус получает больше места (min 140 / 1.8fr), а Кандидат —
  // меньше избыточного простора (с 6fr → 3fr, max-w на имя 240px).
  const cols: string[] = []
  // ☐ — 28px, justify-end. ★ — 32px (w-8), justify-center, чтобы звёздочка
  // визуально была по центру ячейки с равным воздухом слева/справа.
  // -ml-3 на ★ и Кандидате схлопывает gap-4 до 4px edge-to-edge.
  if (selectionEnabled) cols.push("28px")               // ☐ — фикс
  cols.push("32px")                                     // ★ — фикс (w-8)
  cols.push("minmax(207px, 3.45fr)")                    // Кандидат — расширен ~15% за счёт Демо/AI
  if (showProgress) cols.push("minmax(95px, 1.2fr)")    // Демо
  if (showScore) cols.push("minmax(60px, 0.85fr)")      // AI
  if (showSalary) cols.push("minmax(110px, 1.5fr)")     // Зарплата
  if (showCity) cols.push("minmax(120px, 2fr)")         // Город
  if (showResponseDate) cols.push("minmax(80px, 1fr)")  // Дата
  cols.push("minmax(140px, 1.8fr)")                     // Статус
  if (showSource) cols.push("60px")                     // Источник — фикс
  if (showActions) cols.push("80px")                    // Действия — фикс

  const gridStyle = { gridTemplateColumns: cols.join(" ") }

  // ─── Selection helpers ──────────────────────────────────────────────────
  const visibleIds = useMemo(() => allCandidates.map((c) => c.id), [allCandidates])
  const selectedCount = useMemo(() => {
    if (!selectedIds) return 0
    let n = 0
    for (const id of visibleIds) if (selectedIds.has(id)) n++
    return n
  }, [selectedIds, visibleIds])
  const headerState: boolean | "indeterminate" =
    selectedCount === 0 ? false : selectedCount === visibleIds.length ? true : "indeterminate"

  const toggleAllVisible = () => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    if (selectedCount === visibleIds.length) {
      for (const id of visibleIds) next.delete(id)
    } else {
      for (const id of visibleIds) next.add(id)
    }
    onSelectionChange(next)
  }

  const toggleOne = (id: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    const isShift = !!(e && (e as React.MouseEvent).shiftKey)
    if (isShift && lastSelectedIdRef.current && lastSelectedIdRef.current !== id) {
      const fromIdx = visibleIds.indexOf(lastSelectedIdRef.current)
      const toIdx = visibleIds.indexOf(id)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
        const shouldSelect = !next.has(id)
        for (let i = lo; i <= hi; i++) {
          if (shouldSelect) next.add(visibleIds[i])
          else next.delete(visibleIds[i])
        }
        lastSelectedIdRef.current = id
        onSelectionChange(next)
        return
      }
    }
    if (next.has(id)) next.delete(id)
    else next.add(id)
    lastSelectedIdRef.current = id
    onSelectionChange(next)
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      {/* Table Header */}
      <div
        className="grid gap-4 pl-2 pr-4 py-2.5 bg-muted/60 border-b border-border text-[13px] font-medium text-muted-foreground tracking-normal items-center"
        style={gridStyle}
      >
        {selectionEnabled && (
          <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={headerState}
              onCheckedChange={() => toggleAllVisible()}
              aria-label={selectedCount === visibleIds.length && visibleIds.length > 0 ? "Снять выделение со всех" : "Выделить всех на странице"}
            />
          </div>
        )}
        <div className="flex items-center justify-center -ml-3">
          <button
            type="button"
            onClick={() => handleSort("favorite")}
            aria-sort={sort?.key === "favorite" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
            aria-label="Сортировать по избранному"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-accent/60 transition-colors",
              sort?.key === "favorite" ? "text-primary bg-primary/10" : "text-muted-foreground/60",
            )}
          >
            <Star className={cn("size-4", sort?.key === "favorite" && "fill-yellow-400 text-yellow-400")} />
            {sort?.key === "favorite" && (sort.dir === "asc" ? (
              <ArrowUp className="size-3" strokeWidth={2.5} />
            ) : (
              <ArrowDown className="size-3" strokeWidth={2.5} />
            ))}
          </button>
        </div>
        <div className="-ml-3">
          {onSortChange ? (
            <SortHeader label="Кандидат" sortKey="name" sort={sort} onToggle={handleSort} align="left" />
          ) : (
            <span>Кандидат</span>
          )}
        </div>
        {showProgress && <SortHeader label="Демо" sortKey="progress" sort={sort} onToggle={handleSort} align="center" />}
        {showScore && <SortHeader label="AI-оцен." sortKey="aiScore" sort={sort} onToggle={handleSort} align="center" />}
        {showSalary && <SortHeader label="Зарплата" sortKey="salary" sort={sort} onToggle={handleSort} align="center" />}
        {showCity && <SortHeader label="Город" sortKey="city" sort={sort} onToggle={handleSort} align="left" />}
        {showResponseDate && <SortHeader label="Дата" sortKey="responseDate" sort={sort} onToggle={handleSort} align="center" />}
        <SortHeader label="Статус" sortKey="status" sort={sort} onToggle={handleSort} align="center" />
        {showSource && <SortHeader label="Источник" sortKey="source" sort={sort} onToggle={handleSort} align="center" />}
        {showActions && <div className="text-center">Действия</div>}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {allCandidates.map((candidate, i) => {
          const isDecisionStage = candidate.columnId === "interview" || candidate.columnId === "offer"
          const aiActuallyRan = candidate.aiScore != null && !!candidate.aiSummary
          const progress = progressPercentOf(candidate)
          // Источник истины — поля demoTotalBlocks/demoCompletedBlocks из API
          // (см. /api/modules/hr/candidates), где total = lessons.length + 2,
          // а completed = страницы пройденные хотя бы 1 блоком + анкета + спасибо.
          // Fallback на calcDemoFraction для legacy-данных без этих полей.
          const apiTotal = (candidate as { demoTotalBlocks?: number }).demoTotalBlocks
          const apiCompleted = (candidate as { demoCompletedBlocks?: number }).demoCompletedBlocks
          const demoFraction = (typeof apiTotal === "number" && apiTotal > 0)
            ? { current: apiCompleted ?? 0, total: apiTotal, hasData: true }
            : calcDemoFraction(candidate.demoProgressJson)
          const dt = formatResponseDate(candidate.createdAt ?? candidate.addedAt)
          const isSelected = !!selectedIds?.has(candidate.id)
          return (
            <div
              key={candidate.id}
              className={cn(
                "grid gap-4 pl-2 pr-4 items-center hover:bg-muted/40 transition-colors min-h-[56px] text-[14px] cursor-pointer",
                i % 2 === 0 ? "" : "bg-muted/20",
                isSelected && "bg-primary/5 hover:bg-primary/10"
              )}
              style={gridStyle}
              onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
            >
              {/* Selection checkbox */}
              {selectionEnabled && (
                <div
                  className="flex items-center justify-end"
                  onClick={(e) => { e.stopPropagation(); toggleOne(candidate.id, e) }}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => { /* handled by row click */ }}
                    aria-label={isSelected ? "Снять выделение" : "Выделить кандидата"}
                  />
                </div>
              )}

              {/* Favorite */}
              <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center -ml-3">
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.(candidate.id, !candidate.isFavorite)}
                  className="inline-flex items-center justify-center p-1 rounded hover:bg-accent/60 transition-colors"
                  aria-label={candidate.isFavorite ? "Убрать из избранного" : "В избранное"}
                >
                  <Star className={cn("size-4", candidate.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400")} />
                </button>
              </div>

              {/* Name + experience */}
              <div className="flex items-center gap-3 min-w-0 -ml-3">
                <CandidateAvatar
                  name={candidate.name}
                  photoUrl={candidate.photoUrl}
                  colorFrom={candidate.colorFrom}
                  colorTo={candidate.colorTo}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[15px] font-medium text-foreground truncate"
                    title={candidate.name}
                  >
                    {candidate.name}
                  </p>
                  {settings.showExperience && (
                    <p
                      className="text-[13px] text-muted-foreground truncate"
                      title={candidate.experience}
                    >
                      {candidate.experienceYears ? `Опыт ${candidate.experienceYears} лет` : (candidate.experience ? `Опыт ${candidate.experience}` : "")}
                    </p>
                  )}
                </div>
              </div>

              {/* Demo progress */}
              {showProgress && (
                <div className="flex items-center justify-center">
                  <DemoProgressBar
                    variant="list"
                    progressPercent={demoFraction.hasData && demoFraction.total > 0
                      ? Math.min(100, Math.round((demoFraction.current / demoFraction.total) * 100))
                      : null}
                    completedBlocks={demoFraction.hasData ? demoFraction.current : undefined}
                    totalBlocks={demoFraction.hasData ? demoFraction.total : undefined}
                    hasVideoVizitka={candidate.demoProgressJson?.hasVideoVizitka}
                  />
                </div>
              )}

              {/* AI score */}
              {showScore && (
                <div className="text-center">
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

              {/* Salary — single expected value */}
              {showSalary && (() => {
                const salary = candidate.salaryMax || candidate.salaryMin
                return (
                  <div className="text-center text-[14px] font-medium text-foreground whitespace-nowrap">
                    {salary ? `${salary.toLocaleString("ru-RU")} ₽` : "—"}
                  </div>
                )
              })()}

              {/* City */}
              {showCity && (
                <div className="flex items-center gap-1 text-[14px] text-muted-foreground min-w-0">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{candidate.city}</span>
                </div>
              )}

              {/* Date */}
              {showResponseDate && (
                <div className="text-center text-sm text-muted-foreground tabular-nums whitespace-nowrap">
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
              <div className="text-center">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white whitespace-nowrap"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.columnTitle === "Демонстрация" ? "Демо" : candidate.columnTitle}
                </span>
              </div>

              {/* Source */}
              {showSource && (
                <div className="text-center">
                  <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
                    {candidate.source}
                  </Badge>
                </div>
              )}

              {/* Actions — компактные иконки, full-height клик-зоны */}
              {showActions && (
                <div
                  className="self-stretch flex gap-1 justify-center items-center h-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isDecisionStage ? (
                    <>
                      <button
                        type="button"
                        title="Принять"
                        className="w-7 h-full flex items-center justify-center rounded text-success hover:bg-success/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Отказать"
                        className="w-7 h-full flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="В резерв"
                        className="w-7 h-full flex items-center justify-center rounded text-warning hover:bg-warning/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reserve")}
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        title="Пригласить"
                        className="w-7 h-full flex items-center justify-center rounded text-success hover:bg-success/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Отказать"
                        className="w-7 h-full flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Открыть"
                        className="w-7 h-full flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
