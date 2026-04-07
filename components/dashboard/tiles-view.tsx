"use client"

import { useMemo } from "react"
import type { Candidate } from "./candidate-card"
import type { CardDisplaySettings } from "./card-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { MapPin, Briefcase, Circle, CheckCircle2, XCircle, ArrowRight, ThumbsUp, Clock } from "lucide-react"

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
}

function formatTimeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 60) return `${diffMins} мин. назад`
  if (diffHours < 24) return `${diffHours} ч. назад`
  if (diffDays === 1) return "вчера"
  if (diffDays < 7) return `${diffDays} дн. назад`
  return `${Math.floor(diffDays / 7)} нед. назад`
}

function getScoreColor(score: number) {
  if (score >= 80) return "bg-success/10 text-success border-success/20"
  if (score >= 70) return "bg-warning/10 text-warning border-warning/20"
  return "bg-destructive/10 text-destructive border-destructive/20"
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

export function TilesView({ columns, settings, onOpenProfile, onAction }: TilesViewProps) {
  const allCandidates = useMemo(() => {
    return columns
      .flatMap((col) =>
        col.candidates.map((c) => ({
          ...c,
          columnId: col.id,
          columnTitle: col.title,
          colorFrom: col.colorFrom,
          colorTo: col.colorTo,
        }))
      )
      .sort((a, b) => b.score - a.score) // Sort by AI score descending
  }, [columns])

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
        const isOnline = candidate.lastSeen === "online"
        const isDecisionStage = candidate.columnId === "interview" || candidate.columnId === "offer"

        return (
          <div
            key={candidate.id}
            className="rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-200 overflow-hidden"
          >
            {/* Color bar */}
            <div
              className="h-1.5"
              style={{ background: `linear-gradient(90deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
            />

            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                  >
                    {candidate.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">{candidate.name}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isOnline ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <Circle className="w-2 h-2 fill-current" />
                          онлайн
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(candidate.lastSeen as Date)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {settings.showScore && (
                  <Badge variant="outline" className={cn("font-bold text-sm border", getScoreColor(candidate.score))}>
                    {candidate.score}
                  </Badge>
                )}
              </div>

              {/* Info */}
              <div className="space-y-1.5 mb-3">
                {settings.showCity && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {candidate.city}
                  </div>
                )}
                {settings.showExperience && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Briefcase className="w-3.5 h-3.5" />
                    {candidate.experience}
                  </div>
                )}
                {(settings.showSalary || settings.showSalaryFull) && (
                  <p className="text-xs font-medium text-foreground">
                    {settings.showSalaryFull
                      ? `${candidate.salaryMin.toLocaleString("ru-RU")} – ${candidate.salaryMax.toLocaleString("ru-RU")} ₽`
                      : `${Math.round(candidate.salaryMin / 1000)}-${Math.round(candidate.salaryMax / 1000)}k`
                    }
                  </p>
                )}
              </div>

              {/* Skills */}
              {settings.showSkills && candidate.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {candidate.skills.slice(0, 4).map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">{skill}</Badge>
                  ))}
                  {candidate.skills.length > 4 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground">
                      +{candidate.skills.length - 4}
                    </Badge>
                  )}
                </div>
              )}

              {/* Stage + Source */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                  style={{ background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})` }}
                >
                  {candidate.columnTitle}
                </span>
                {settings.showSource && (
                  <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
                    {candidate.source}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              {settings.showActions && (
                <div className="flex items-center gap-1 pt-2 border-t border-border/60">
                  {isDecisionStage ? (
                    <>
                      <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-success hover:bg-success/10" onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}>
                        <ThumbsUp className="w-3 h-3 mr-1" />Принять
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}>
                        <XCircle className="w-3 h-3 mr-1" />Отказать
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-success hover:bg-success/10" onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />Далее
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}>
                        <XCircle className="w-3 h-3 mr-1" />Отказать
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
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
