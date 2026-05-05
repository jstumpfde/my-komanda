"use client"

import { cn } from "@/lib/utils"

/** Структура demo_progress_json кандидата (минимум, необходимый компоненту). */
export interface DemoProgressData {
  blocks?: Array<{ blockId?: string; status?: string; timeSpent?: number; answer?: unknown }>
  totalBlocks?: number
  completedAt?: string | null
}

export interface DemoProgressInfo {
  /** Процент прохождения 0..100, либо null если кандидат не приступал. */
  percent: number | null
  completed: number
  total: number
}

/**
 * Считает прогресс прохождения демо. Логика идентична используемой в канбан-карточке:
 * процент = round(completed / total * 100), где total = totalBlocks ?? blocks.length.
 * Возвращает percent === null, когда demo_progress_json отсутствует / некорректен —
 * это интерпретируется UI как "Не начато".
 */
export function calcDemoPercent(dp: DemoProgressData | null | undefined): DemoProgressInfo {
  if (!dp || !Array.isArray(dp.blocks)) return { percent: null, completed: 0, total: 0 }
  const completed = dp.blocks.filter((b) => b?.status === "completed" && b?.blockId !== "__complete__").length
  const total = dp.totalBlocks ?? dp.blocks.length
  if (!total) return { percent: 0, completed, total }
  const rawPercent = Math.round((completed / total) * 100)
  return { percent: Math.min(rawPercent, 100), completed, total }
}

export type DemoProgressVariant = "list" | "kanban"

interface DemoProgressBarProps {
  /** Процент 0..100 при наличии данных, либо null — кандидат не приступал. */
  progressPercent: number | null
  /** Только для variant="kanban": количество завершённых блоков для подписи "{c}/{t} · {pct}%". */
  completedBlocks?: number
  /** Только для variant="kanban": общее количество блоков. */
  totalBlocks?: number
  /**
   * "list"   — узкая шкала ~80px справа подпись "{N}%" / "Не начато" / "Завершено".
   *             Цвета: пусто — серая, 1-99% — синяя, 100% — зелёная.
   * "kanban" — шкала во всю ширину, подпись "{c}/{t} · {pct}%" под шкалой.
   *             Цвета: серые, оранжевая (<50), изумрудная (<100), светящаяся изумрудная (=100).
   */
  variant?: DemoProgressVariant
  className?: string
}

export function DemoProgressBar({
  progressPercent,
  completedBlocks,
  totalBlocks,
  variant = "list",
  className,
}: DemoProgressBarProps) {
  const pct = progressPercent
  const hasData = pct !== null

  if (variant === "kanban") {
    const barColor = !hasData
      ? "bg-muted-foreground/20"
      : pct === 0
        ? "bg-muted-foreground/30"
        : pct < 50
          ? "bg-orange-500"
          : pct < 100
            ? "bg-emerald-500"
            : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
    const label = !hasData
      ? "Не начато"
      : `${completedBlocks ?? 0}/${totalBlocks ?? 0} · ${pct}%`
    return (
      <div className={cn("mt-1.5 mb-1", className)}>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: hasData ? `${pct}%` : "0%" }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    )
  }

  // variant === "list"
  // null/undefined прогресс трактуем как 0% (кандидат не приступал).
  const percent = hasData ? (pct as number) : 0
  const isComplete = percent === 100
  const isStarted = percent > 0 && percent < 100

  return (
    <div className={cn("flex flex-col items-center gap-1 w-full max-w-[140px] mx-auto", className)}>
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          percent === 0 && "text-muted-foreground",
          isStarted && "text-primary",
          isComplete && "text-success",
        )}
      >
        {percent}%
      </span>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800/50"
        aria-label={`Прогресс демо: ${percent}%`}
      >
        <div
          className={cn(
            "h-full transition-all",
            percent === 0 && "bg-transparent",
            isStarted && "bg-primary",
            isComplete && "bg-success",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
