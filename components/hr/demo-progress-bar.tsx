"use client"

import { Video } from "lucide-react"
import { cn } from "@/lib/utils"

/** Структура demo_progress_json кандидата (минимум, необходимый компоненту). */
export interface DemoProgressData {
  blocks?: Array<{ blockId?: string; status?: string; timeSpent?: number; answer?: unknown }>
  totalBlocks?: number
  completedAt?: string | null
  hasVideoVizitka?: boolean
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

export interface DemoFractionInfo {
  /** Сколько блоков completed (без служебного __complete__-маркера). */
  current: number
  /** Всего шагов = totalBlocks из БД (для новых записей это lessons + 2 виртуальных). */
  total: number
  /** Есть ли вообще запись о прогрессе. false → UI показывает "Не начато". */
  hasData: boolean
}

/**
 * Возвращает прогресс в виде дроби current/total для отображения в HR-таблице.
 * В отличие от calcDemoPercent даёт сырые числа без округления и без клампа,
 * чтобы UI мог нарисовать "12/17" вместо "71%".
 *
 * total читается из сохранённого totalBlocks. Для записей, созданных после
 * добавления виртуальных маркеров (__anketa__, __thanks__), это lessons + 2.
 * Для legacy-записей это просто число блоков уроков — фракция выглядит как
 * "15/15" вместо "15/17"; принимаем как ожидаемое поведение для старых данных.
 */
export function calcDemoFraction(dp: DemoProgressData | null | undefined): DemoFractionInfo {
  if (!dp || !Array.isArray(dp.blocks)) return { current: 0, total: 0, hasData: false }
  const current = dp.blocks.filter((b) => b?.status === "completed" && b?.blockId !== "__complete__").length
  const total = dp.totalBlocks ?? dp.blocks.length
  return { current, total, hasData: dp.blocks.length > 0 }
}

export type DemoProgressVariant = "list" | "kanban"

interface DemoProgressBarProps {
  /** Процент 0..100 при наличии данных, либо null — кандидат не приступал. */
  progressPercent: number | null
  /** Только для variant="kanban": количество завершённых блоков для подписи "{c}/{t} · {pct}%". */
  completedBlocks?: number
  /** Только для variant="kanban": общее количество блоков. */
  totalBlocks?: number
  /** Если true — рядом с подписью процента показывается иконка видео-визитки. */
  hasVideoVizitka?: boolean
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
  hasVideoVizitka,
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
        <p className="text-xs text-muted-foreground mt-0.5">
          {label}
          {hasVideoVizitka && (
            <Video className="inline w-3 h-3 ml-1 text-muted-foreground" aria-label="Есть видео-визитка" />
          )}
        </p>
      </div>
    )
  }

  // variant === "list"
  // В списке кандидатов показываем дробь "X/Y" вместо процента.
  // Источник истины — completedBlocks/totalBlocks (calcDemoFraction).
  // На progressPercent опираемся только для отрисовки заливки и цвета подписи.
  const hasFraction = typeof completedBlocks === "number" && typeof totalBlocks === "number" && totalBlocks > 0
  const cur = completedBlocks ?? 0
  const tot = totalBlocks ?? 0
  const isComplete = hasFraction && cur >= tot
  const isStarted = hasFraction && cur > 0 && cur < tot
  const fillColor = isComplete
    ? "bg-emerald-500"
    : isStarted
      ? "bg-blue-500"
      : "bg-transparent"
  // "Не начато" — когда нет данных вообще ИЛИ кандидат ещё не сделал ни одного шага.
  const noProgress = !hasData || (hasFraction && cur === 0) || (!hasFraction && pct === 0)
  // Возвращаем процент вместо дроби — completedBlocks может быть подсчитан
  // по подблокам (35), а total по страницам (17), что даёт некрасивую "35/17".
  // Процент cap'ается на 100% и работает консистентно для всех записей.
  const displayPct = hasFraction
    ? Math.min(100, Math.round((cur / tot) * 100))
    : (pct ?? 0)
  // Показываем дробь "15/17" — page-based прогресс. Если completedBlocks/totalBlocks
  // не приходят (legacy данные), fallback на процент.
  const label = noProgress
    ? "Не начато"
    : hasFraction
      ? `${cur}/${tot}`
      : `${displayPct}%`
  const labelClass = noProgress
    ? "text-muted-foreground"
    : isComplete
      ? "text-emerald-600 dark:text-emerald-500"
      : "text-blue-600 dark:text-blue-500"
  const fillPct = hasFraction
    ? Math.min(100, Math.round((cur / tot) * 100))
    : (pct ?? 0)
  const fillWidth = noProgress ? "0%" : `${fillPct}%`

  return (
    <div className={cn("flex flex-col items-center gap-1 w-full max-w-[140px] mx-auto", className)}>
      <span className={cn("text-sm tabular-nums whitespace-nowrap font-medium inline-flex items-center", labelClass)}>
        {label}
        {hasVideoVizitka && (
          <Video className="inline w-3 h-3 ml-1 text-muted-foreground" aria-label="Есть видео-визитка" />
        )}
      </span>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800/50"
        aria-label={`Прогресс демо: ${label}`}
      >
        <div
          className={cn("h-full rounded-full transition-all", fillColor)}
          style={{ width: fillWidth }}
        />
      </div>
    </div>
  )
}
