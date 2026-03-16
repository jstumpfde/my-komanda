"use client"

import { useState, useMemo } from "react"
import type { Candidate } from "./candidate-card"
import type { CardDisplaySettings } from "./card-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { MapPin, CheckCircle2, XCircle, ArrowRight, ThumbsUp, Clock, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"

type SortKey = "score" | "salaryMin" | "city" | "columnTitle" | "source"
type SortDir = "asc" | "desc"

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
}

export function ListView({ columns, settings, onOpenProfile, onAction }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown className="size-3 opacity-40" />
    return sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
  }

  const rawCandidates = columns.flatMap((col) =>
    col.candidates.map((c) => ({ ...c, columnId: col.id, columnTitle: col.title, colorFrom: col.colorFrom, colorTo: col.colorTo }))
  )

  const allCandidates = useMemo(() => {
    if (!sortKey) return rawCandidates
    return [...rawCandidates].sort((a, b) => {
      let aVal: string | number = ""
      let bVal: string | number = ""
      if (sortKey === "score") { aVal = a.score; bVal = b.score }
      else if (sortKey === "salaryMin") { aVal = a.salaryMin; bVal = b.salaryMin }
      else if (sortKey === "city") { aVal = a.city; bVal = b.city }
      else if (sortKey === "columnTitle") { aVal = a.columnTitle; bVal = b.columnTitle }
      else if (sortKey === "source") { aVal = a.source; bVal = b.source }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal), "ru")
        : String(bVal).localeCompare(String(aVal), "ru")
    })
  }, [rawCandidates, sortKey, sortDir])

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

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      {/* Table Header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-2.5 bg-muted/60 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        <div>Кандидат</div>
        {settings.showScore && (
          <button onClick={() => handleSort("score")} className={cn("flex items-center gap-1 hover:text-foreground transition-colors", sortKey === "score" && "text-foreground")}>
            AI скор <SortIcon k="score" />
          </button>
        )}
        {(settings.showSalary || settings.showSalaryFull) && (
          <button onClick={() => handleSort("salaryMin")} className={cn("flex items-center gap-1 hover:text-foreground transition-colors", sortKey === "salaryMin" && "text-foreground")}>
            Зарплата <SortIcon k="salaryMin" />
          </button>
        )}
        {settings.showCity && (
          <button onClick={() => handleSort("city")} className={cn("flex items-center gap-1 hover:text-foreground transition-colors", sortKey === "city" && "text-foreground")}>
            Город <SortIcon k="city" />
          </button>
        )}
        <button onClick={() => handleSort("columnTitle")} className={cn("flex items-center gap-1 hover:text-foreground transition-colors", sortKey === "columnTitle" && "text-foreground")}>
          Статус <SortIcon k="columnTitle" />
        </button>
        {settings.showSource && (
          <button onClick={() => handleSort("source")} className={cn("flex items-center gap-1 hover:text-foreground transition-colors", sortKey === "source" && "text-foreground")}>
            Источник <SortIcon k="source" />
          </button>
        )}
        <div>Действия</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {allCandidates.map((candidate, i) => {
          const isDecisionStage = candidate.columnId === "interview" || candidate.columnId === "offer"
          return (
            <div
              key={candidate.id}
              className={cn(
                "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/40 transition-colors",
                i % 2 === 0 ? "" : "bg-muted/20"
              )}
            >
              {/* Name + experience */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
                  {settings.showExperience && (
                    <p className="text-[11px] text-muted-foreground truncate">{candidate.experience}</p>
                  )}
                </div>
              </div>

              {/* Score */}
              {settings.showScore && (
                <div>
                  <Badge variant="outline" className={cn("text-xs border font-semibold", getScoreColor(candidate.score))}>
                    {candidate.score}
                  </Badge>
                </div>
              )}

              {/* Salary */}
              {(settings.showSalary || settings.showSalaryFull) && (
                <div className="text-xs font-medium text-foreground">
                  {settings.showSalaryFull
                    ? `${candidate.salaryMin.toLocaleString("ru-RU")} — ${candidate.salaryMax.toLocaleString("ru-RU")} ₽`
                    : `${Math.round(candidate.salaryMin / 1000)}-${Math.round(candidate.salaryMax / 1000)}k`
                  }
                </div>
              )}

              {/* City */}
              {settings.showCity && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{candidate.city}</span>
                </div>
              )}

              {/* Stage badge */}
              <div>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.columnTitle}
                </span>
              </div>

              {/* Source */}
              {settings.showSource && (
                <div>
                  <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
                    {candidate.source}
                  </Badge>
                </div>
              )}

              {/* Actions */}
              {settings.showActions && (
                <div className="flex items-center gap-1">
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
