"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, ArrowRight, MapPin, Briefcase, Clock, ThumbsUp, Calendar, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CardDisplaySettings } from "./card-settings"
import type { CandidateAction } from "@/lib/column-config"

export interface Candidate {
  id: string
  name: string
  city: string
  salaryMin: number
  salaryMax: number
  score: number
  progress: number
  source: string
  experience: string
  skills: string[]
  addedAt: Date
  lastSeen: Date | "online"
}

interface CandidateCardProps {
  candidate: Candidate
  settings: CardDisplaySettings
  columnId: string
  isDragging?: boolean
  onDragStart?: (candidateId: string, columnId: string) => void
  onDragEnd?: () => void
  onOpenProfile?: (candidate: Candidate) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
}

export function CandidateCard({ candidate, settings, columnId, isDragging, onDragStart, onDragEnd, onOpenProfile, onAction }: CandidateCardProps) {
  const isDecisionStage = columnId === "interview" || columnId === "offer"
  
  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 60) return `${diffMins} мин. назад`
    if (diffHours < 24) return `${diffHours} ч. назад`
    if (diffDays === 1) return "вчера"
    if (diffDays < 7) return `${diffDays} дн. назад`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`
    return `${Math.floor(diffDays / 30)} мес. назад`
  }

  const formatDuration = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffDays < 1) return "сегодня"
    if (diffDays === 1) return "1 день"
    if (diffDays < 7) return `${diffDays} дн.`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед.`
    return `${Math.floor(diffDays / 30)} мес.`
  }

  const isOnline = candidate.lastSeen === "online"

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

  const formatSalary = (min: number, max: number, full: boolean) => {
    if (full) {
      return `${min.toLocaleString("ru-RU")} - ${max.toLocaleString("ru-RU")} руб.`
    }
    return `${Math.round(min / 1000)}-${Math.round(max / 1000)}k`
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        onDragStart?.(candidate.id, columnId)
      }}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        "rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200 p-4 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 scale-95 shadow-none"
      )}
    >
      {/* Header with Score */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-foreground text-sm leading-tight">{candidate.name}</h4>
            {/* Online/last seen indicator */}
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
          {/* Time on platform */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
            <Calendar className="w-3 h-3" />
            <span>На платформе {formatDuration(candidate.addedAt)}</span>
          </div>
        </div>
        {settings.showScore && (
          <Badge
            variant="outline"
            className={cn(
              "ml-2 font-semibold text-xs flex-shrink-0 border",
              getScoreColor(candidate.score)
            )}
          >
            {candidate.score}
          </Badge>
        )}
      </div>

      {/* Location */}
      {settings.showCity && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-2">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{candidate.city}</span>
        </div>
      )}

      {/* Salary */}
      {(settings.showSalary || settings.showSalaryFull) && (
        <div className="text-foreground text-xs font-medium mb-2">
          {formatSalary(candidate.salaryMin, candidate.salaryMax, settings.showSalaryFull)}
        </div>
      )}

      {/* Experience */}
      {settings.showExperience && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-2">
          <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{candidate.experience}</span>
        </div>
      )}

      {/* Skills */}
      {settings.showSkills && candidate.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {candidate.skills.slice(0, 3).map((skill) => (
            <Badge
              key={skill}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-5"
            >
              {skill}
            </Badge>
          ))}
          {candidate.skills.length > 3 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground"
            >
              +{candidate.skills.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {settings.showProgress && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-muted-foreground text-xs">Прогресс</span>
            <span className="text-foreground text-xs font-medium">{candidate.progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${candidate.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Source Tag */}
      {settings.showSource && (
        <div className="mb-3">
          <Badge
            variant="outline"
            className={cn("text-xs border", getSourceColor(candidate.source))}
          >
            {candidate.source}
          </Badge>
        </div>
      )}

      {/* Action Buttons */}
      {settings.showActions && (
        <div className="pt-2 border-t border-border/60 mt-1">
          {isDecisionStage ? (
            /* Интервью и Предложение: Принять / Отказать / Резерв / Открыть */
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] px-2 font-medium text-success hover:bg-success/10 hover:text-success"
                onClick={() => onAction?.(candidate.id, columnId, "advance")}
              >
                <ThumbsUp className="w-3 h-3 mr-1 shrink-0" />
                Принять
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] px-2 font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onAction?.(candidate.id, columnId, "reject")}
              >
                <XCircle className="w-3 h-3 mr-1 shrink-0" />
                Отказать
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] px-2 font-medium text-warning hover:bg-warning/10 hover:text-warning"
                title="В резерв"
                onClick={() => onAction?.(candidate.id, columnId, "reserve")}
              >
                <Clock className="w-3 h-3 mr-1 shrink-0" />
                Резерв
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                title="Открыть профиль"
                onClick={() => onOpenProfile?.(candidate)}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            /* Остальные этапы: Пригласить / Отказать / Открыть */
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] px-2 font-medium text-success hover:bg-success/10 hover:text-success"
                onClick={() => onAction?.(candidate.id, columnId, "advance")}
              >
                <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" />
                Пригласить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] px-2 font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onAction?.(candidate.id, columnId, "reject")}
              >
                <XCircle className="w-3 h-3 mr-1 shrink-0" />
                Отказать
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                title="Открыть профиль"
                onClick={() => onOpenProfile?.(candidate)}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
