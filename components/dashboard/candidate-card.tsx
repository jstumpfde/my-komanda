"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, ArrowRight, Check, GraduationCap, X, Archive, Clock, Users } from "lucide-react"
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
  token?: string
  demoProgress?: number
  demoTotal?: number
  demoTimeMin?: number
  aiSummary?: string
  interviewDate?: Date
  interviewTime?: string
  utmSource?: string
  workFormat?: "office" | "remote" | "hybrid"
  age?: number
  birthDate?: Date | string
}

interface CandidateCardProps {
  candidate: Candidate
  settings: CardDisplaySettings
  columnId: string
  isLastColumn?: boolean
  isDragging?: boolean
  onDragStart?: (candidateId: string, columnId: string) => void
  onDragEnd?: () => void
  onOpenProfile?: (candidate: Candidate) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
}

export function CandidateCard({ candidate, settings, columnId, isLastColumn, onOpenProfile, onAction }: CandidateCardProps) {
  const isDecisionColumn = columnId === "decision" || columnId === "final_decision"
  const isInterviewColumn = columnId === "interview"

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

  const getSourceLabel = (source: string) => {
    const map: Record<string, string> = {
      "hh.ru": "hh",
      "Реферал": "реферал",
      "Сайт": "сайт",
    }
    return map[source] || source
  }

  const formatSalary = (min: number, max: number) => {
    return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} руб.`
  }

  return (
    <div
      className="relative p-3.5 rounded-lg border bg-card cursor-pointer hover:shadow-sm transition"
      onClick={() => onOpenProfile?.(candidate)}
    >
      {/* Score badge — top right */}
      {settings.showScore && (
        <Badge
          variant="outline"
          className={cn(
            "absolute top-2 right-2 font-bold border text-xs",
            getScoreColor(candidate.score)
          )}
        >
          {candidate.score}
        </Badge>
      )}

      {/* Row 1: ФИО */}
      <p className={cn("font-medium text-base text-foreground", settings.showScore && "pr-10")}>{candidate.name}</p>

      {/* Row 2: Город + Источник */}
      {(settings.showCity || settings.showSource) && (
        <div className="flex items-center justify-between mt-1.5">
          {settings.showCity && <span className="text-sm text-muted-foreground">{candidate.city}</span>}
          {settings.showSource && (
            <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
              {getSourceLabel(candidate.source)}
            </Badge>
          )}
        </div>
      )}

      {/* Row 3: Зарплата */}
      {(settings.showSalary || settings.showSalaryFull) && (
        <p className="text-sm font-medium mt-1.5">
          {settings.showSalaryFull
            ? formatSalary(candidate.salaryMin, candidate.salaryMax)
            : `${Math.round(candidate.salaryMin / 1000)}-${Math.round(candidate.salaryMax / 1000)}k`
          }
        </p>
      )}

      {/* Опыт */}
      {settings.showExperience && candidate.experience && (
        <p className="text-xs text-muted-foreground mt-1">Опыт: {candidate.experience}</p>
      )}

      {/* Навыки */}
      {settings.showSkills && candidate.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {candidate.skills.slice(0, 3).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              {skill}
            </Badge>
          ))}
        </div>
      )}

      {/* Возраст */}
      {settings.showAge && (() => {
        let age = candidate.age
        if (age == null && candidate.birthDate) {
          const birth = new Date(candidate.birthDate)
          const now = new Date()
          age = now.getFullYear() - birth.getFullYear()
          if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--
        }
        return age != null ? <p className="text-xs text-muted-foreground mt-1">Возраст: {age} лет</p> : null
      })()}

      {/* AI summary (decision columns) */}
      {isDecisionColumn && candidate.aiSummary && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">{candidate.aiSummary}</p>
      )}

      {/* Interview date/time */}
      {isInterviewColumn && candidate.interviewDate && (
        <div className="flex items-center gap-1.5 mt-2 p-2 rounded-md bg-purple-500/5 border border-purple-200 dark:border-purple-800">
          <Calendar className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs font-medium text-purple-700 dark:text-purple-400">
            {candidate.interviewDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
            {candidate.interviewTime && ` в ${candidate.interviewTime}`}
          </span>
        </div>
      )}

      {/* Action icons row */}
      <div className="flex items-center justify-between gap-1 w-full pt-2 mt-2 border-t" onClick={(e) => e.stopPropagation()}>
        {columnId === "final_decision" && (
          <Button variant="ghost" className="w-9 h-9 rounded-full p-0 text-green-600 bg-green-50 border border-green-200 hover:bg-green-100 dark:bg-green-950 dark:border-green-800 dark:hover:bg-green-900" title="Нанять" onClick={() => onAction?.(candidate.id, columnId, "hire")}>
            <Check className="w-5 h-5" />
          </Button>
        )}
        {columnId !== "final_decision" && !isLastColumn && (
          <Button variant="ghost" className="w-9 h-9 rounded-full p-0 text-green-600 bg-green-50 border border-green-200 hover:bg-green-100 dark:bg-green-950 dark:border-green-800 dark:hover:bg-green-900" title="Следующий этап" onClick={() => onAction?.(candidate.id, columnId, "advance")}>
            <ArrowRight className="w-5 h-5" />
          </Button>
        )}
        {columnId === "hired" && (
          <Button variant="ghost" className="w-8 h-8 rounded-full p-0 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" title="Онбординг" onClick={() => onAction?.(candidate.id, columnId, "onboarding")}>
            <GraduationCap className="w-4 h-4" />
          </Button>
        )}
        <Button variant="ghost" className="w-9 h-9 rounded-full p-0 text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 dark:bg-red-950 dark:border-red-800 dark:hover:bg-red-900" title="Отказать" onClick={() => onAction?.(candidate.id, columnId, "reject")}>
          <X className="w-5 h-5" />
        </Button>
        <Button variant="ghost" className="w-8 h-8 rounded-full p-0 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950" title="Резерв" onClick={() => onAction?.(candidate.id, columnId, "reserve")}>
          <Archive className="w-4 h-4" />
        </Button>
        {(columnId === "decision" || columnId === "interview" || columnId === "final_decision") && (
          <Button variant="ghost" className="w-8 h-8 rounded-full p-0 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-950" title="Подумать" onClick={() => onAction?.(candidate.id, columnId, "think")}>
            <Clock className="w-4 h-4" />
          </Button>
        )}
        <Button variant="ghost" className="w-8 h-8 rounded-full p-0 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950" title="Talent Pool" onClick={() => onAction?.(candidate.id, columnId, "talent_pool")}>
          <Users className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
