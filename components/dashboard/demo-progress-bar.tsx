"use client"

import { cn } from "@/lib/utils"

interface DemoProgressJson {
  blocks?: Array<{ blockId: string; status: string; timeSpent?: number; answer?: unknown }>
  totalBlocks?: number
  completedAt?: string | null
}

interface DemoProgressBarProps {
  progress?: DemoProgressJson | null
  className?: string
}

export function DemoProgressBar({ progress, className }: DemoProgressBarProps) {
  const hasData = !!progress && Array.isArray(progress.blocks)
  const completed = hasData ? progress!.blocks!.filter((b) => b?.status === "completed").length : 0
  const total = hasData ? (progress!.totalBlocks ?? progress!.blocks!.length) : 0
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  let barColor = "bg-muted-foreground/20"
  let label = "Не начато"
  let labelClass = "text-muted-foreground"

  if (hasData && pct > 0 && pct < 100) {
    barColor = "bg-blue-500"
    label = `${pct}%`
    labelClass = "text-blue-600 dark:text-blue-400"
  } else if (hasData && pct === 100) {
    barColor = "bg-emerald-500"
    label = "Завершено"
    labelClass = "text-emerald-600 dark:text-emerald-400"
  }

  return (
    <div className={className}>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: hasData && pct > 0 ? `${pct}%` : "0%" }}
        />
      </div>
      <p className={cn("text-[11px] mt-1", labelClass)}>{label}</p>
    </div>
  )
}
