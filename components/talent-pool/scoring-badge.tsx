"use client"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface ScoreBreakdown {
  experience: number
  skills: number
  culture: number
  motivation: number
  availability: number
}

export function getScoreColor(score: number) {
  if (score >= 86) return { bg: "bg-gradient-to-br from-red-500 to-orange-500", text: "text-white", label: "Горячий" }
  if (score >= 61) return { bg: "bg-emerald-500", text: "text-white", label: "Тёплый" }
  if (score >= 31) return { bg: "bg-amber-400", text: "text-amber-900", label: "Прогрев" }
  return { bg: "bg-muted", text: "text-muted-foreground", label: "Холодный" }
}

export function scoreToStatus(score: number): "cold" | "warming" | "warm" | "hired" | "refused" {
  if (score >= 86) return "warm"
  if (score >= 61) return "warming"
  if (score >= 31) return "warming"
  return "cold"
}

interface ScoringBadgeProps {
  score: number
  breakdown?: ScoreBreakdown
  size?: "sm" | "md"
}

export function ScoringBadge({ score, breakdown, size = "md" }: ScoringBadgeProps) {
  const color = getScoreColor(score)
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm"

  const badge = (
    <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0 cursor-default", dim, color.bg, color.text)}>
      {score}
    </div>
  )

  if (!breakdown) return badge

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="left" className="text-xs space-y-1 p-3">
          <p className="font-semibold mb-1.5">Скоринг: {score}/100 — {color.label}</p>
          <div className="space-y-1">
            <Row label="Опыт" value={breakdown.experience} />
            <Row label="Навыки" value={breakdown.skills} />
            <Row label="Культура" value={breakdown.culture} />
            <Row label="Мотивация" value={breakdown.motivation} />
            <Row label="Доступность" value={breakdown.availability} />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden w-16">
        <div className="h-full bg-primary rounded-full" style={{ width: `${value}%` }} />
      </div>
      <span className="font-medium w-6 text-right">{value}</span>
    </div>
  )
}
