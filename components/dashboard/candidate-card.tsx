"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, ArrowRight, MapPin, Briefcase, Clock, ThumbsUp, Calendar, Circle, Copy, Check, Send, Archive, HelpCircle, PartyPopper } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CardDisplaySettings } from "./card-settings"
import type { CandidateAction } from "@/lib/column-config"
import { HR_DECISION_COLUMNS } from "@/lib/column-config"
import { toast } from "sonner"
import { useState } from "react"
import { SendDemoDialog } from "./send-demo-dialog"

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
  // Новые поля для автоматической воронки
  demoProgress?: number      // уроков пройдено (из 12)
  demoTotal?: number         // всего уроков
  demoTimeMin?: number       // минут на демо
  aiSummary?: string         // AI-резюме ответов
  interviewDate?: Date       // дата интервью
  interviewTime?: string     // время слота
  utmSource?: string         // UTM название источника
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
  const isHrDecision = columnId === "hr_decision"
  const isFinalDecision = columnId === "final_decision"
  const isDecisionColumn = HR_DECISION_COLUMNS.includes(columnId)
  const isDemoColumn = columnId === "demo"
  const isInterviewColumn = columnId === "interview"
  const isHiredColumn = columnId === "hired"
  const isAutoColumn = !isDecisionColumn && !isHiredColumn

  const [linkCopied, setLinkCopied] = useState(false)
  const [showSendDemo, setShowSendDemo] = useState(false)
  const candidateToken = candidate.token || candidate.id

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = `${window.location.origin}/candidate/${candidateToken}`
    await navigator.clipboard.writeText(link)
    setLinkCopied(true)
    toast.success("Ссылка скопирована")
    setTimeout(() => setLinkCopied(false), 2000)
  }

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
    return `${Math.floor(diffDays / 7)} нед. назад`
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

  const formatSalary = (min: number, max: number, full: boolean) => {
    if (full) return `${min.toLocaleString("ru-RU")} - ${max.toLocaleString("ru-RU")} руб.`
    return `${Math.round(min / 1000)}-${Math.round(max / 1000)}k`
  }

  const isOnline = candidate.lastSeen === "online"
  const demoLessons = candidate.demoProgress ?? 0
  const demoTotal = candidate.demoTotal ?? 12
  const demoPct = demoTotal > 0 ? Math.round((demoLessons / demoTotal) * 100) : 0
  const demoCompleted = demoLessons >= demoTotal

  return (
    <div
      className={cn(
        "rounded-lg border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200 p-4",
        isDecisionColumn && "border-primary/20"
      )}
    >
      {/* Header: Name + Score */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-foreground text-sm leading-tight truncate">{candidate.name}</h4>
            {isOnline ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
                <Circle className="w-2 h-2 fill-current" /> онлайн
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatTimeAgo(candidate.lastSeen as Date)}
              </span>
            )}
          </div>
        </div>
        {/* AI Score — large in decision columns */}
        <Badge
          variant="outline"
          className={cn(
            "ml-2 font-bold flex-shrink-0 border",
            getScoreColor(candidate.score),
            isDecisionColumn ? "text-sm px-2 py-0.5" : "text-xs"
          )}
        >
          {candidate.score}
        </Badge>
      </div>

      {/* Source */}
      <div className="flex items-center gap-1.5 mb-2">
        <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
          {candidate.source}
        </Badge>
        {candidate.utmSource && (
          <span className="text-[10px] text-muted-foreground">{candidate.utmSource}</span>
        )}
      </div>

      {/* City + salary compact */}
      {settings.showCity && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{candidate.city}</span>
          {(settings.showSalary || settings.showSalaryFull) && (
            <span className="text-foreground font-medium ml-auto">{formatSalary(candidate.salaryMin, candidate.salaryMax, !!settings.showSalaryFull)}</span>
          )}
        </div>
      )}

      {/* Demo progress (for demo column and decision columns) */}
      {(isDemoColumn || isDecisionColumn) && (
        <div className="mb-2 p-2 rounded-md bg-muted/40 border border-border/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Демонстрация</span>
            <span className={cn("text-[10px] font-medium", demoCompleted ? "text-emerald-600" : "text-foreground")}>
              {demoCompleted ? "✅" : ""} {demoLessons}/{demoTotal} уроков · {demoPct}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", demoCompleted ? "bg-emerald-500" : "bg-primary")} style={{ width: `${demoPct}%` }} />
          </div>
          {candidate.demoTimeMin && (
            <p className="text-[10px] text-muted-foreground mt-1">{candidate.demoTimeMin} мин.</p>
          )}
        </div>
      )}

      {/* AI summary (decision columns) */}
      {isDecisionColumn && candidate.aiSummary && (
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2 italic">{candidate.aiSummary}</p>
      )}

      {/* Interview date/time */}
      {isInterviewColumn && candidate.interviewDate && (
        <div className="flex items-center gap-1.5 mb-2 p-2 rounded-md bg-purple-500/5 border border-purple-200 dark:border-purple-800">
          <Calendar className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs font-medium text-purple-700 dark:text-purple-400">
            {candidate.interviewDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
            {candidate.interviewTime && ` в ${candidate.interviewTime}`}
          </span>
        </div>
      )}

      {/* Hired celebration */}
      {isHiredColumn && (
        <div className="flex items-center gap-1.5 mb-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800">
          <PartyPopper className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Нанят!</span>
        </div>
      )}

      {/* Demo link (for auto columns) */}
      {isAutoColumn && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] text-muted-foreground truncate flex-1">Ссылка: /c/{candidateToken.slice(0, 8)}…</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-muted-foreground hover:text-primary" title="Скопировать ссылку" onClick={handleCopyLink}>
            {linkCopied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-muted-foreground hover:text-primary" title="Отправить демонстрацию" onClick={(e) => { e.stopPropagation(); setShowSendDemo(true) }}>
            <Send className="w-3 h-3" />
          </Button>
        </div>
      )}

      <SendDemoDialog open={showSendDemo} onOpenChange={setShowSendDemo} candidateName={candidate.name} token={candidateToken} />

      {/* ═══ Action Buttons ════════════════════════════════════ */}
      {settings.showActions && (
        <div className="pt-2 border-t border-border/60 mt-1">
          {isHrDecision && (
            /* Решение HR: Пригласить на интервью / Отказать / Резерв / Подумать */
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onAction?.(candidate.id, columnId, "advance")}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Пригласить на интервью
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => onAction?.(candidate.id, columnId, "reject")}>
                  <XCircle className="w-3 h-3 mr-1" /> Отказать
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-warning hover:bg-warning/10" onClick={() => onAction?.(candidate.id, columnId, "reserve")}>
                  <Archive className="w-3 h-3 mr-1" /> В резерв
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-muted-foreground hover:bg-muted" onClick={() => onAction?.(candidate.id, columnId, "think")}>
                  <HelpCircle className="w-3 h-3 mr-1" /> Подумать
                </Button>
              </div>
            </div>
          )}

          {isFinalDecision && (
            /* Финальное решение: Нанять / Отказать / Резерв */
            <div className="space-y-1.5">
              <Button
                size="sm"
                className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onAction?.(candidate.id, columnId, "hire")}
              >
                <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                Нанять
              </Button>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => onAction?.(candidate.id, columnId, "reject")}>
                  <XCircle className="w-3 h-3 mr-1" /> Отказать
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-warning hover:bg-warning/10" onClick={() => onAction?.(candidate.id, columnId, "reserve")}>
                  <Archive className="w-3 h-3 mr-1" /> В резерв
                </Button>
              </div>
            </div>
          )}

          {isAutoColumn && (
            /* Авто-колонки: только профиль */
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-[11px] text-muted-foreground hover:text-primary"
                onClick={() => onOpenProfile?.(candidate)}
              >
                <ArrowRight className="w-3 h-3 mr-1" />
                Открыть профиль
              </Button>
            </div>
          )}

          {isHiredColumn && (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] text-muted-foreground hover:text-primary" onClick={() => onOpenProfile?.(candidate)}>
                <ArrowRight className="w-3 h-3 mr-1" /> Профиль
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
