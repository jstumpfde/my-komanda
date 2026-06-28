"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, Check, X, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { CandidateAvatar } from "./candidate-avatar"
import type { CardDisplaySettings } from "./card-settings"
import type { CandidateAction } from "@/lib/column-config"
import { DemoProgressBar, calcDemoPercent } from "@/components/hr/demo-progress-bar"
import { getDemoProgressGroup, getDemoProgressPercent } from "@/lib/demo-progress-groups"

export interface Candidate {
  id: string
  name: string
  city: string
  salaryMin: number
  salaryMax: number
  salaryCurrency?: string | null
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
  aiScore?: number
  aiVerdict?: string
  // AI-скор резюме (выставляется при приёме hh-отклика, до демо).
  resumeScore?: number | null
  // AI-Портрет: оценка резюме по критериям Портрета (ai_score_v2).
  aiScoreV2?: number | null
  // AI-ан: балл по ответам демо (candidates.demo_answers_score). Отдельно от
  // aiScore — туда пишут v1/v2-скоринг резюме, была бы гонка fire-and-forget.
  demoAnswersScore?: number | null
  // Имя «под вопросом» — резолвер уйдёт в нейтральное «Здравствуйте» (фамилия/аноним/
  // редкое имя). HR стоит проверить и при желании вписать имя вручную.
  nameUncertain?: boolean
  interviewDate?: Date
  interviewTime?: string
  // Ближайшее запланированное интервью (ISO) — для колонки в списке.
  nextInterviewAt?: string | null
  utmSource?: string
  workFormat?: "office" | "remote" | "hybrid"
  age?: number
  birthDate?: Date | string
  // HR-020: filterable fields
  experienceYears?: number | null
  educationLevel?: string | null
  languages?: string[] | null
  keySkills?: string[] | null
  industry?: string | null
  relocationReady?: boolean | null
  businessTripsReady?: boolean | null
  photoUrl?: string | null
  demoProgressJson?: {
    blocks?: Array<{ blockId: string; status: string; timeSpent?: number; answer?: unknown }>
    totalBlocks?: number
    completedAt?: string | null
    hasVideoVizitka?: boolean
  } | null
  isFavorite?: boolean
  createdAt?: string | Date | null
  /** Реальный stage из БД (для status-бейджа в list-view paginated режиме). */
  stage?: string | null
  // Page-based progress fields, populated from API in vacancy page mapping
  demoTotalBlocks?: number
  demoCompletedBlocks?: number
  progressPercent?: number | null
  // «Демо пройдено по ответам» — ответил на все обязательные вопросы демо,
  // даже если хвост декоративных блоков не пролистан (прогресс по страницам
  // < 100%). Считается на сервере. Делает прогресс-бар зелёным/«готово».
  demoCompletedByAnswers?: boolean
  // Колонка «Тест»: балл последнего теста и статус-лесенка
  // (submitted/in_progress/opened/sent).
  testScore?: number | null
  testStatus?: "submitted" | "in_progress" | "opened" | "sent" | "failed" | null
  // «Активен сейчас» — проходит демо/тест в последние 30 минут.
  isActive?: boolean
  /** Название вакансии — показывается в глобальном списке кандидатов (showVacancyColumn). */
  vacancyTitle?: string | null
  /** Состояние кандидата в воронке v2 (stageId — текущая стадия funnel-v2).
   *  Возвращается только пер-вакансионным API. Используется в ListView для
   *  отображения кастомного лейбла стадии вместо платформенного дефолта. */
  funnelV2StateJson?: { stageId?: string | null } | null
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
  onToggleFavorite?: (candidateId: string, isFavorite: boolean) => void
}

export function CandidateCard({ candidate, settings, columnId, isLastColumn, onOpenProfile, onAction, onToggleFavorite }: CandidateCardProps) {
  const isDecisionColumn = columnId === "decision" || columnId === "final_decision"
  const isInterviewColumn = columnId === "interview"
  const aiActuallyRan = candidate.aiScore != null && !!candidate.aiSummary
  const demoPercent = getDemoProgressPercent(candidate.demoProgressJson)
  const demoGroup = getDemoProgressGroup(demoPercent)

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
      className="relative p-3.5 rounded-lg border bg-card cursor-pointer transition"
      onClick={() => onOpenProfile?.(candidate)}
    >
      {/* Top-right cluster: demo progress + ★ favorite + score badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span
          className={cn(
            "rounded-md px-1.5 h-5 text-[10px] font-semibold inline-flex items-center justify-center border",
            demoGroup.badgeClass,
          )}
          title={`Демо: ${demoGroup.label}`}
        >
          {demoGroup.label}
        </span>
        {settings.showScore && candidate.aiScore != null && (
          <span
            className={cn(
              "rounded-md px-1.5 h-5 text-xs font-bold inline-flex items-center justify-center",
              aiActuallyRan ? getScoreColor(candidate.aiScore) : "text-muted-foreground/50 bg-muted/30"
            )}
          >
            {aiActuallyRan ? candidate.aiScore : "—"}
          </span>
        )}
        {onToggleFavorite && (
          <button
            type="button"
            className={cn(
              "transition-colors p-0.5 -m-0.5",
              candidate.isFavorite
                ? "text-amber-400 hover:text-amber-500"
                : "text-muted-foreground/40 hover:text-amber-400"
            )}
            onClick={() => onToggleFavorite(candidate.id, !candidate.isFavorite)}
            title={candidate.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
          >
            <Star className={cn("w-4 h-4", candidate.isFavorite && "fill-current")} />
          </button>
        )}
      </div>

      {/* Row 1: аватар + ФИО */}
      <div className="flex items-center gap-2 pr-24">
        <CandidateAvatar
          candidateId={candidate.id}
          name={candidate.name}
          photoUrl={candidate.photoUrl}
          colorFrom="#a78bfa"
          colorTo="#8b5cf6"
        />
        <p className="font-medium text-base text-foreground truncate">{candidate.name}</p>
      </div>

      {/* Demo progress bar — always visible */}
      {(() => {
        const { percent, completed, total } = calcDemoPercent(candidate.demoProgressJson)
        return (
          <DemoProgressBar
            variant="kanban"
            progressPercent={percent}
            completedBlocks={completed}
            totalBlocks={total}
            hasVideoVizitka={candidate.demoProgressJson?.hasVideoVizitka}
            stage={candidate.stage}
            completedByAnswers={candidate.demoCompletedByAnswers}
          />
        )
      })()}

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
        <div className="flex flex-wrap gap-1 mt-1.5 min-w-0">
          {candidate.skills.slice(0, 3).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0.5 h-auto font-normal max-w-full whitespace-normal break-words text-left leading-tight">
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

      {/* AI screening badge */}
      {candidate.aiScore != null && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-[10px] font-semibold",
            candidate.aiScore >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
            : candidate.aiScore >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          )}>
            AI {candidate.aiScore}
          </span>
          {candidate.aiVerdict && (
            <span className="text-[10px] text-muted-foreground">{candidate.aiVerdict}</span>
          )}
        </div>
      )}

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

      {/* Action buttons row — узко (карточка ужата): остаются только иконки */}
      <div className="@container flex items-center gap-2 w-full pt-2 mt-2 border-t" onClick={(e) => e.stopPropagation()}>
        {columnId === "final_decision" ? (
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-0 gap-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
            title="Нанять"
            onClick={() => onAction?.(candidate.id, columnId, "hire")}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span className="@max-[210px]:hidden">Нанять</span>
          </Button>
        ) : !isLastColumn && (
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 min-w-0 gap-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
            title="Далее"
            onClick={() => onAction?.(candidate.id, columnId, "advance")}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span className="@max-[210px]:hidden">Далее</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 min-w-0 gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
          title="Отказать"
          onClick={() => onAction?.(candidate.id, columnId, "reject")}
        >
          <X className="w-4 h-4 shrink-0" />
          <span className="@max-[210px]:hidden">Отказать</span>
        </Button>
      </div>
    </div>
  )
}
