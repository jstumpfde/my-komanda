"use client"

import { useMemo } from "react"
import type { Candidate } from "./candidate-card"
import type { CardDisplaySettings } from "./card-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { applySortMode, type CandidateSortMode } from "@/lib/candidate-sort"
import {
  MapPin,
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  MoreHorizontal,
  UserRound,
  ArrowRightLeft,
  Trash2,
} from "lucide-react"
import { calcDemoPercent } from "@/components/hr/demo-progress-bar"
import { AiScoreBadge } from "./ai-score-badge"

interface Column {
  id: string
  title: string
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

interface TilesViewProps {
  columns: Column[]
  settings: CardDisplaySettings
  onOpenProfile?: (candidate: Candidate, columnId: string) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
  onMoveToStage?: (candidateId: string, fromColumnId: string, toColumnId: string) => void
  onDelete?: (candidateId: string, columnId: string) => void
  sortMode?: CandidateSortMode
  groupBy?: "status" | "none"
}

function formatTimeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return "только что"
  if (diffMins < 60) return `${diffMins} мин. назад`
  if (diffHours < 24) return `${diffHours} ч. назад`
  if (diffDays === 1) return "вчера"
  if (diffDays < 7) return `${diffDays} дн. назад`
  return `${Math.floor(diffDays / 7)} нед. назад`
}

function formatFullDate(date: Date) {
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getSourceColor(source: string) {
  const colors: Record<string, string> = {
    "hh.ru": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    "Avito": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
    "Telegram": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    "LinkedIn": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  }
  return colors[source] || "bg-muted text-muted-foreground border-border"
}

function getSourceLabel(source: string) {
  const map: Record<string, string> = {
    "hh.ru": "hh",
    "Реферал": "реферал",
    "Сайт": "сайт",
  }
  return map[source] || source
}

function getDateForCard(candidate: Candidate): Date {
  if (candidate.createdAt) {
    const d = new Date(candidate.createdAt)
    if (!isNaN(d.getTime())) return d
  }
  if (candidate.lastSeen instanceof Date) return candidate.lastSeen
  return candidate.addedAt
}

export function TilesView({
  columns,
  settings,
  onOpenProfile,
  onAction,
  onMoveToStage,
  onDelete,
  sortMode = "date_desc",
  groupBy = "none",
}: TilesViewProps) {
  const allCandidates = useMemo(() => {
    const flat = columns.flatMap((col) =>
      col.candidates.map((c) => ({
        ...c,
        columnId: col.id,
        columnTitle: col.title,
        colorFrom: col.colorFrom,
        colorTo: col.colorTo,
      }))
    )
    return applySortMode(flat, sortMode) as typeof flat
  }, [columns, sortMode])

  const showStatusBadge = groupBy !== "status"

  if (allCandidates.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 rounded-xl border-2 border-dashed border-border/50 text-muted-foreground/40">
        <span className="text-sm">Нет кандидатов</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {allCandidates.map((candidate) => {
        const cardDate = getDateForCard(candidate)
        const cityLabel = candidate.city?.trim()
        const positionLabel = candidate.experience?.trim()
        const hasSalary =
          (typeof candidate.salaryMin === "number" && candidate.salaryMin > 0) ||
          (typeof candidate.salaryMax === "number" && candidate.salaryMax > 0)
        const showAiScore = settings.showScore && candidate.aiScore != null
        const { percent: demoPercent } = calcDemoPercent(candidate.demoProgressJson)
        const demoBarColor =
          demoPercent === null
            ? "bg-muted-foreground/20"
            : demoPercent === 0
              ? "bg-muted-foreground/30"
              : demoPercent < 50
                ? "bg-orange-500"
                : demoPercent < 100
                  ? "bg-emerald-500"
                  : "bg-emerald-400"
        const demoBarWidth = demoPercent === null || demoPercent === 0 ? "0%" : `${demoPercent}%`

        return (
          <div
            key={candidate.id}
            className="group rounded-xl border border-border bg-card transition-colors cursor-pointer hover:border-primary/40 hover:shadow-sm"
            onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
          >
            <div className="p-4">
              {/* Header: avatar + name + score + menu */}
              <div className="flex items-start gap-2 mb-2">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-foreground text-sm leading-tight truncate">{candidate.name}</h4>
                  {/* Demo progress bar (тонкая 4px шкала по логике HR-003) */}
                  <div
                    className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden"
                    aria-label={
                      demoPercent === null
                        ? "Демо не начато"
                        : `Прогресс демо ${demoPercent}%`
                    }
                  >
                    <div
                      className={cn("h-full rounded-full transition-all", demoBarColor)}
                      style={{ width: demoBarWidth }}
                    />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeAgo(cardDate)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{formatFullDate(cardDate)}</TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {showAiScore && <AiScoreBadge score={candidate.aiScore} />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        aria-label="Действия"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => onOpenProfile?.(candidate, candidate.columnId)}>
                        <UserRound className="w-4 h-4" />
                        Открыть профиль
                      </DropdownMenuItem>
                      {onMoveToStage && columns.length > 1 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <ArrowRightLeft className="w-4 h-4" />
                            Перенести в этап
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {columns
                              .filter((col) => col.id !== candidate.columnId)
                              .map((col) => (
                                <DropdownMenuItem
                                  key={col.id}
                                  onClick={() => onMoveToStage(candidate.id, candidate.columnId, col.id)}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: `linear-gradient(135deg, ${col.colorFrom}, ${col.colorTo})` }}
                                  />
                                  {col.title}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuItem
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}
                        className="text-destructive focus:text-destructive"
                      >
                        <XCircle className="w-4 h-4" />
                        Отказать
                      </DropdownMenuItem>
                      {onDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(candidate.id, candidate.columnId)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                            Удалить
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Meta rows: city / position / salary */}
              <div className="space-y-1 mb-2">
                {settings.showCity && cityLabel && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{cityLabel}</span>
                  </div>
                )}
                {settings.showExperience && positionLabel && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{positionLabel}</span>
                  </div>
                )}
                {(settings.showSalary || settings.showSalaryFull) && (
                  hasSalary ? (
                    <p className="text-xs font-medium text-foreground">
                      {settings.showSalaryFull
                        ? `${candidate.salaryMin.toLocaleString("ru-RU")} – ${candidate.salaryMax.toLocaleString("ru-RU")} ₽`
                        : `${Math.round(candidate.salaryMin / 1000)}-${Math.round(candidate.salaryMax / 1000)}k`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/60 italic">Зарплата не указана</p>
                  )
                )}
              </div>

              {/* Status + source */}
              <div className="flex items-center gap-2 mb-2">
                {showStatusBadge && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                    style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                  >
                    {candidate.columnTitle}
                  </span>
                )}
                {settings.showSource && candidate.source && (
                  <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
                    {getSourceLabel(candidate.source)}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              {settings.showActions && (
                <div
                  className="flex items-center gap-1 pt-2 border-t border-border/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-7 text-[11px] text-success hover:bg-success/10"
                    onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Далее
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-7 text-[11px] text-destructive hover:bg-destructive/10"
                    onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Отказать
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
