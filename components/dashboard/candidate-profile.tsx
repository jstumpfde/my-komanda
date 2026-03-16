"use client"

import type { Candidate } from "./candidate-card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import {
  MapPin,
  Briefcase,
  Circle,
  Calendar,
  DollarSign,
  Star,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  Clock,
  ArrowRight,
  Mail,
  Phone,
} from "lucide-react"

interface CandidateProfileProps {
  candidate: Candidate | null
  columnId?: string
  columnTitle?: string
  columnColorFrom?: string
  columnColorTo?: string
  open: boolean
  onOpenChange: (open: boolean) => void
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
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`
  return `${Math.floor(diffDays / 30)} мес. назад`
}

function formatDuration(date: Date) {
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (diffDays < 1) return "сегодня"
  if (diffDays === 1) return "1 день"
  if (diffDays < 7) return `${diffDays} дн.`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед.`
  return `${Math.floor(diffDays / 30)} мес.`
}

function formatDate(date: Date) {
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function getScoreColor(score: number) {
  if (score >= 80) return "bg-success/10 text-success border-success/20"
  if (score >= 70) return "bg-warning/10 text-warning border-warning/20"
  return "bg-destructive/10 text-destructive border-destructive/20"
}

function getScoreLabel(score: number) {
  if (score >= 90) return "Отличный кандидат"
  if (score >= 80) return "Сильный кандидат"
  if (score >= 70) return "Хороший кандидат"
  if (score >= 60) return "Средний кандидат"
  return "Слабое соответствие"
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

export function CandidateProfile({
  candidate,
  columnId,
  columnTitle,
  columnColorFrom,
  columnColorTo,
  open,
  onOpenChange,
  onAction,
}: CandidateProfileProps) {
  if (!candidate) return null

  const isOnline = candidate.lastSeen === "online"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Gradient header */}
        <div
          className="px-6 pt-10 pb-6"
          style={{
            background: columnColorFrom && columnColorTo
              ? `linear-gradient(135deg, ${columnColorFrom}, ${columnColorTo})`
              : undefined,
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl text-white mb-1">
                {candidate.name}
              </SheetTitle>
              <SheetDescription className="text-white/70 text-sm">
                {candidate.experience}
              </SheetDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-lg font-bold px-3 py-1 border-2",
                candidate.score >= 80
                  ? "bg-white/20 text-white border-white/30"
                  : candidate.score >= 70
                    ? "bg-white/15 text-white border-white/25"
                    : "bg-white/10 text-white border-white/20"
              )}
            >
              {candidate.score}
            </Badge>
          </div>

          {/* Status + online */}
          <div className="flex items-center gap-3 mt-3">
            {columnTitle && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                {columnTitle}
              </span>
            )}
            {isOnline ? (
              <span className="flex items-center gap-1 text-xs text-white/90">
                <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" />
                онлайн
              </span>
            ) : (
              <span className="text-xs text-white/60">
                {formatTimeAgo(candidate.lastSeen as Date)}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* AI Score section */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">AI-скоринг</h3>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{getScoreLabel(candidate.score)}</span>
                <Badge
                  variant="outline"
                  className={cn("text-xs font-semibold border", getScoreColor(candidate.score))}
                >
                  {candidate.score}/100
                </Badge>
              </div>
              <Progress value={candidate.score} className="h-2" />
            </div>
          </div>

          <Separator />

          {/* Contact info */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Контакты</h3>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{candidate.name.toLowerCase().replace(/\s+/g, ".")}@mail.ru</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">+7 (9xx) xxx-xx-xx</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{candidate.city}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Salary */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Зарплатные ожидания</h3>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {candidate.salaryMin.toLocaleString("ru-RU")} — {candidate.salaryMax.toLocaleString("ru-RU")} руб.
              </span>
            </div>
          </div>

          <Separator />

          {/* Experience */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Опыт работы</h3>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground">{candidate.experience}</span>
            </div>
          </div>

          <Separator />

          {/* Skills */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Навыки</h3>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs px-2.5 py-1">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Progress */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Прогресс</h3>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">Прохождение этапов</span>
                <span className="text-sm font-medium text-foreground">{candidate.progress}%</span>
              </div>
              <Progress value={candidate.progress} className="h-2" />
            </div>
          </div>

          <Separator />

          {/* Meta */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Информация</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Источник
                </span>
                <Badge variant="outline" className={cn("text-xs border", getSourceColor(candidate.source))}>
                  {candidate.source}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  На платформе
                </span>
                <span className="text-foreground">{formatDuration(candidate.addedAt)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Добавлен
                </span>
                <span className="text-foreground">{formatDate(candidate.addedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <SheetFooter className="border-t border-border px-6 py-4">
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (candidate && columnId) {
                  onAction?.(candidate.id, columnId, "reject")
                  onOpenChange(false)
                }
              }}
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Отказать
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-warning hover:bg-warning/10 hover:text-warning"
              onClick={() => {
                if (candidate && columnId) {
                  onAction?.(candidate.id, columnId, "reserve")
                  onOpenChange(false)
                }
              }}
            >
              <Clock className="w-4 h-4 mr-1.5" />
              В резерв
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                if (candidate && columnId) {
                  onAction?.(candidate.id, columnId, "advance")
                  onOpenChange(false)
                }
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Далее
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
