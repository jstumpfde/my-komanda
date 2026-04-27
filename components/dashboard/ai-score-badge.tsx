"use client"

import { cn } from "@/lib/utils"

interface AiScoreBadgeProps {
  score?: number | null
  className?: string
}

function getScoreColor(score: number) {
  if (score >= 81) return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
  if (score >= 61) return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
  if (score >= 41) return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
  return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900"
}

export function AiScoreBadge({ score, className }: AiScoreBadgeProps) {
  const has = score != null
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-1.5 h-6 min-w-[2rem] text-xs font-bold",
        has ? getScoreColor(score!) : "bg-muted/40 text-muted-foreground/60 border-muted",
        className
      )}
    >
      {has ? score : "—"}
    </span>
  )
}
