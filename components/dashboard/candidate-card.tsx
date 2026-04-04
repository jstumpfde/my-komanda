"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CheckCircle2, XCircle, ArrowRight, ThumbsUp, Archive, HelpCircle, ShieldX } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CardDisplaySettings } from "./card-settings"
import type { CandidateAction } from "@/lib/column-config"
import { HR_DECISION_COLUMNS } from "@/lib/column-config"

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
  token?: string
  demoProgress?: number
  demoTotal?: number
  demoTimeMin?: number
  aiSummary?: string
  interviewDate?: Date
  interviewTime?: string
  utmSource?: string
  workFormat?: "office" | "remote" | "hybrid"
  aiScore?: number | null
  aiSummary?: string | null
  rejectedAuto?: boolean
  rejectedAutoReasons?: string[]
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

export function CandidateCard({ candidate, settings, columnId, onOpenProfile, onAction }: CandidateCardProps) {
  const isDecisionColumn = HR_DECISION_COLUMNS.includes(columnId)
  const isFirstDecision = columnId === "decision"
  const isFinalDecision = columnId === "final_decision"
  const isHiredColumn = columnId === "hired"

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 60) return `${diffMins} мин.`
    if (diffHours < 24) return `${diffHours} ч.`
    if (diffDays === 1) return "вчера"
    if (diffDays < 7) return `${diffDays} дн.`
    return `${Math.floor(diffDays / 7)} нед.`
  }

  const getScoreColor = (score: number) => {
    if (score >= 75) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    if (score >= 50) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  }

  const getSourceLabel = (source: string) => {
    const map: Record<string, string> = {
      "hh.ru": "hh",
      "Avito": "avito",
      "Telegram": "tg",
      "LinkedIn": "in",
      "Реферал": "ref",
      "Сайт": "сайт",
    }
    return map[source] || source
  }

  const formatSalary = (min: number, max: number) => {
    return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ₽`
  }

  // Фамилия Имя (без отчества)
  const displayName = candidate.name.trim().split(/\s+/).slice(0, 2).join(" ")

  return (
    <div className="space-y-0">
      {/* Clickable card body */}
      <div
        className={cn(
          "p-3 rounded-md border bg-card cursor-pointer hover:shadow-sm transition",
          isDecisionColumn && "border-primary/20 rounded-b-none border-b-0"
        )}
        onClick={() => onOpenProfile?.(candidate)}
      >
        {/* Row 1: Name + Score circle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{displayName}</span>
            {candidate.rejectedAuto && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldX className="w-3 h-3 text-destructive shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <p className="text-xs font-medium mb-1">Причины отклонения:</p>
                    <ul className="text-xs list-disc pl-3 space-y-0.5">
                      {candidate.rejectedAutoReasons?.length ? (
                        candidate.rejectedAutoReasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))
                      ) : (
                        <li>Не соответствует стоп-факторам</li>
                      )}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <span
            className={cn(
              "rounded-md px-1.5 h-5 text-xs font-medium shrink-0 inline-flex items-center justify-center",
              getScoreColor(candidate.score)
            )}
          >
            {candidate.score}
          </span>
        </div>

        {/* Row 2: City + Source badge */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-sm text-muted-foreground truncate">{candidate.city}</span>
          <Badge variant="outline" className="text-xs h-4 px-1.5 border font-normal shrink-0 ml-2">
            {getSourceLabel(candidate.source)}
          </Badge>
        </div>

        {/* Row 3: Salary + Date */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-medium truncate">
            {formatSalary(candidate.salaryMin, candidate.salaryMax)}
          </span>
          <span className="text-xs text-muted-foreground shrink-0 ml-2">
            {candidate.lastSeen === "online" ? "онлайн" : formatTimeAgo(candidate.lastSeen as Date)}
          </span>
        </div>
      </div>

      {/* Decision buttons — always shown in decision columns */}
      {isDecisionColumn && (
        <div className="p-2 pt-1.5 border border-t-0 rounded-b-md bg-card border-primary/20">
          {isFirstDecision && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white basis-full"
                onClick={() => onAction?.(candidate.id, columnId, "advance")}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Пригласить
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => onAction?.(candidate.id, columnId, "reject")}>
                <XCircle className="w-3 h-3 mr-0.5" /> Отказать
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-blue-600 hover:bg-blue-500/10" onClick={() => onAction?.(candidate.id, columnId, "reserve")}>
                <Archive className="w-3 h-3 mr-0.5" /> Резерв
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-muted-foreground hover:bg-muted" onClick={() => onAction?.(candidate.id, columnId, "think")}>
                <HelpCircle className="w-3 h-3 mr-0.5" /> Подумать
              </Button>
            </div>
          )}

          {isFinalDecision && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white basis-full"
                onClick={() => onAction?.(candidate.id, columnId, "hire")}
              >
                <ThumbsUp className="w-3 h-3 mr-1" />
                Нанять
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => onAction?.(candidate.id, columnId, "reject")}>
                <XCircle className="w-3 h-3 mr-0.5" /> Отказать
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-blue-600 hover:bg-blue-500/10" onClick={() => onAction?.(candidate.id, columnId, "reserve")}>
                <Archive className="w-3 h-3 mr-0.5" /> Резерв
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-amber-600 hover:bg-amber-500/10" onClick={() => onAction?.(candidate.id, columnId, "preboarding")}>
                <ArrowRight className="w-3 h-3 mr-0.5" /> Пребординг
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
