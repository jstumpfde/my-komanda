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

// P0-31: стадии, прошедшие точку «решение по демо». Только в них прогресс-бар
// рендерится зелёным при 100%. Остальные стадии (включая demo_opened,
// primary_contact, demo_in_progress и т.д.) → синий даже при 16/16,
// чтобы зелёный сигнал означал «кандидат прошёл воронку дальше демо»,
// а не просто «досмотрел видео».
const GREEN_GATING_STAGES = new Set([
  "decision",
  "anketa_filled",
  "ai_screening",
  "test_task_sent",
  "interview",
  "offer",
  "hired",
])

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
   * Стадия воронки кандидата (`candidate.stage`). Если задана — зелёный цвет
   * при 100% включается только когда stage ∈ GREEN_GATING_STAGES.
   * Если не передана — fallback на старое поведение (только cur/tot).
   */
  stage?: string | null
  /**
   * «Демо пройдено по ответам»: кандидат ответил на все обязательные вопросы,
   * даже если хвост декоративных блоков (media/button/image) не пролистан и
   * прогресс по страницам < 100%. Если true — бар считается завершённым
   * (зелёный / «готово» / 100%-заливка), знаменатель/число НЕ меняем.
   * Stage-гейтинг зелёного цвета сохраняется (как и для обычного 100%).
   */
  completedByAnswers?: boolean
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
  stage,
  completedByAnswers,
  variant = "list",
  className,
}: DemoProgressBarProps) {
  const pct = progressPercent
  // «Пройдено по ответам» — кандидат заполнил все обязательные вопросы; считаем
  // демо завершённым (для цвета/подписи), даже если по страницам < 100%.
  const hasData = pct !== null || completedByAnswers === true
  // P0-31: при 100% — зелёный только если stage прошёл точку «decision».
  // Если stage не передан (legacy-вызовы) — оставляем зелёный (backward-compat).
  const stagePassedDecision = stage === undefined || stage === null
    ? true
    : GREEN_GATING_STAGES.has(stage)

  if (variant === "kanban") {
    // «Пройдено по ответам» приравниваем к 100% для цвета/подписи бара.
    const effPct = completedByAnswers === true ? 100 : (pct ?? 0)
    const at100 = effPct === 100
    const barColor = !hasData
      ? "bg-muted-foreground/20"
      : effPct === 0
        ? "bg-muted-foreground/30"
        : effPct < 50
          ? "bg-orange-500"
          : effPct < 100
            ? "bg-emerald-500"
            : (at100 && !stagePassedDecision
                ? "bg-blue-500"
                : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]")
    const label = !hasData
      ? "Не начато"
      // Знаменатель/число НЕ меняем — показываем реальные блоки, но процент
      // отражает «пройдено по ответам» (100%), чтобы сигнал совпадал с цветом.
      : `${completedBlocks ?? 0}/${totalBlocks ?? 0} · ${effPct}%`
    return (
      <div className={cn("mt-1.5 mb-1", className)}>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: hasData ? `${effPct}%` : "0%" }}
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
  // P0-31: «complete» теперь требует и cur>=tot, и stage>=decision (если stage передан).
  // «Пройдено по ответам» приравниваем к завершённому, даже если cur < tot
  // (хвост декоративных блоков не пролистан).
  const completedFraction = (hasFraction && cur >= tot) || completedByAnswers === true
  const isComplete = completedFraction && stagePassedDecision
  // Кандидат досмотрел демо, но воронка ещё не двинулась — рендерим синим.
  const isCompletedButNotPassed = completedFraction && !stagePassedDecision
  const isStarted = hasFraction && cur > 0 && cur < tot && !completedFraction
  const fillColor = isComplete
    ? "bg-emerald-500"
    : (isStarted || isCompletedButNotPassed)
      ? "bg-blue-500"
      : "bg-transparent"
  // "Не начато" — когда нет данных вообще ИЛИ кандидат ещё не сделал ни одного шага.
  // Если демо пройдено по ответам — это НЕ «не начато».
  const noProgress = !completedByAnswers
    && (!hasData || (hasFraction && cur === 0) || (!hasFraction && (pct ?? 0) === 0))
  // Возвращаем процент вместо дроби — completedBlocks может быть подсчитан
  // по подблокам (35), а total по страницам (17), что даёт некрасивую "35/17".
  // Процент cap'ается на 100% и работает консистентно для всех записей.
  const displayPct = hasFraction
    ? Math.min(100, Math.round((cur / tot) * 100))
    : (pct ?? 0)
  // Показываем дробь "15/17" — page-based прогресс (знаменатель/число НЕ меняем
  // даже при «пройдено по ответам»). Если completedBlocks/totalBlocks не приходят
  // (legacy данные), fallback на процент.
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
  // Заливка: при «пройдено по ответам» — 100%, иначе по дроби/проценту.
  const fillPct = completedByAnswers === true
    ? 100
    : hasFraction
      ? Math.min(100, Math.round((cur / tot) * 100))
      : (pct ?? 0)
  const fillWidth = noProgress ? "0%" : `${fillPct}%`

  return (
    <div className={cn("flex flex-col items-center gap-1 w-full max-w-[105px] mx-auto", className)}>
      <span className={cn("text-sm tabular-nums whitespace-nowrap font-medium inline-flex items-center", labelClass)}>
        {label}
        {hasVideoVizitka && (
          <Video className="inline w-3 h-3 ml-1 text-muted-foreground" aria-label="Есть видео-визитка" />
        )}
      </span>
      {hasFraction && tot > 0 ? (
        // Сегменты-«шаги»: tot делений, первые cur — залиты цветом стадии,
        // остальные серые. Наглядно показывает «N из M страниц пройдено».
        // При «пройдено по ответам» заливаем все сегменты — сигнал «готово».
        <div className="flex w-full gap-[1px]" aria-label={`Прогресс демо: ${label}`}>
          {Array.from({ length: tot }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "aspect-square flex-1 rounded-[2px] transition-colors",
                (completedByAnswers === true || i < cur) ? fillColor : "bg-gray-200 dark:bg-gray-700/50",
              )}
            />
          ))}
        </div>
      ) : (
        // Fallback для legacy-записей без известного числа шагов — сплошная шкала.
        <div
          className="w-full h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800/50"
          aria-label={`Прогресс демо: ${label}`}
        >
          <div
            className={cn("h-full rounded-full transition-all", fillColor)}
            style={{ width: fillWidth }}
          />
        </div>
      )}
    </div>
  )
}
