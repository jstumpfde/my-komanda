"use client"

import { Video, Mic, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Структура demo_progress_json кандидата (минимум, необходимый компоненту). */
export interface DemoProgressData {
  blocks?: Array<{ blockId?: string; status?: string; timeSpent?: number; answer?: unknown }>
  totalBlocks?: number
  completedAt?: string | null
  hasVideoVizitka?: boolean
  /** Кандидат записал аудио-ответ (media-блок с mediaType="audio"). */
  hasAudioAnswer?: boolean
  /** Клики по кнопкам-ссылкам (button-блок buttonTarget="url"). */
  ctaClicks?: Array<{ blockId?: string; at?: string }>
}

/**
 * Компактная строка значков справа в ячейке «Демо»: 🎥 видео-визитка,
 * 🎙️ аудио-ответ, ↗︎ переход по кнопке-ссылке. Горит (цвет) = кандидат
 * сделал шаг. Значок рендерится только когда шаг сделан — по
 * demo_progress_json мы достоверно знаем только факт «сделано», поэтому
 * приглушённые «шаг есть, но не сделан» не выдумываем (иначе врали бы).
 * Источники: hasVideoVizitka / hasAudioAnswer считаются сервером в
 * /api/public/demo/[token]/answer, ctaClicks — в .../cta-click.
 */
export function DemoBadges({ dp, className }: { dp: DemoProgressData | null | undefined; className?: string }) {
  if (!dp) return null
  const hasVideo = dp.hasVideoVizitka === true
  const hasAudio = dp.hasAudioAnswer === true
  const hasCta = Array.isArray(dp.ctaClicks) && dp.ctaClicks.length > 0
  if (!hasVideo && !hasAudio && !hasCta) return null
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {hasVideo && (
        <Video className="w-3 h-3 text-indigo-500" aria-label="Видео-визитка записана">
          <title>Видео-визитка записана</title>
        </Video>
      )}
      {hasAudio && (
        <Mic className="w-3 h-3 text-violet-500" aria-label="Аудио-ответ записан">
          <title>Аудио-ответ записан</title>
        </Mic>
      )}
      {hasCta && (
        <ArrowUpRight className="w-3 h-3 text-emerald-500" aria-label="Перешёл по кнопке-ссылке">
          <title>Перешёл по кнопке-ссылке</title>
        </ArrowUpRight>
      )}
    </span>
  )
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
  const rawCompleted = dp.blocks.filter((b) => b?.status === "completed" && b?.blockId !== "__complete__").length
  const total = dp.totalBlocks ?? dp.blocks.length
  // Страховка-инвариант: числитель НИКОГДА не превышает знаменатель. При
  // блок-демо (несколько демо в одном demo_progress_json) completed-блоки
  // суммируются по всем демо, а total — скаляр одного демо, что раньше давало
  // «32/20». Кламп гарантирует N ≤ M даже в этом клиентском фолбэке (основной
  // фикс — override «наивысший демо» в API). При total=0 (неизвестный знаменатель)
  // не клампим — бар в этом случае рисует процент, а не дробь.
  const current = total > 0 ? Math.min(rawCompleted, total) : rawCompleted
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
   * Полный demo_progress_json кандидата — для строки значков (🎥/🎙️/↗︎)
   * справа от числа в ячейке «Демо». Если не передан — значки не рисуем.
   */
  demoProgress?: DemoProgressData | null
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
  demoProgress,
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
    const effTotK = completedByAnswers === true ? (completedBlocks ?? 0) : (totalBlocks ?? 0)
    const label = !hasData
      ? "Не начато"
      // При «пройдено по ответам» знаменатель = пройденные блоки (12/12) —
      // экраны после отправки ответов в счёт не идут.
      : `${completedBlocks ?? 0}/${effTotK} · ${effPct}%`
    return (
      <div className={cn("mt-1.5 mb-1", className)}>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: hasData ? `${effPct}%` : "0%" }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
          <span>{label}</span>
          {demoProgress
            ? <DemoBadges dp={demoProgress} />
            : (hasVideoVizitka && <Video className="w-3 h-3 text-indigo-500" aria-label="Есть видео-визитка" />)}
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
  // «Пройдено по ответам» = кандидат ответил на все вопросы → воронку прошёл,
  // зелёный сразу (стадия могла не сдвинуться в decision, т.к. прощательные
  // экраны после отправки ответов он не долистал — и не должен ради завершения).
  const isComplete = completedFraction && (stagePassedDecision || completedByAnswers === true)
  // Кандидат досмотрел демо, но воронка ещё не двинулась — рендерим синим.
  const isCompletedButNotPassed = completedFraction && !stagePassedDecision && completedByAnswers !== true
  const isStarted = hasFraction && cur > 0 && cur < tot && !completedFraction
  const fillColor = isComplete
    ? "bg-emerald-500"
    : (isStarted || isCompletedButNotPassed)
      ? "bg-blue-500"
      : "bg-transparent"
  // "Не начато" — когда нет данных вообще ИЛИ кандидат ещё не сделал ни одного шага.
  // Если демо пройдено по ответам — это НЕ «не начато».
  // Юрий 05.07: в списке кандидатов (variant="list") noProgress рендерится как
  // «—» (единый пустой формат со всеми другими пустыми ячейками колонок),
  // БЕЗ прогресс-точек; «Не начато» ушло в title-тултип. Канбан (variant=
  // "kanban") НЕ трогаем — там подпись "Не начато" остаётся как была.
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
  // При «пройдено по ответам» знаменатель = пройденные блоки (12/12): экраны
  // после отправки ответов («Спасибо» и пр.) в счёт не идут — кандидат прошёл
  // всё нужное. Иначе показываем реальную дробь (12/16).
  const effTot = completedByAnswers === true ? cur : tot
  const label = noProgress
    ? "Не начато"
    : hasFraction
      ? `${cur}/${effTot}`
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
  // Будут ли справа значки (видео/аудио/ссылка)? Та же логика, что в DemoBadges.
  // Если значков нет — число центрируем; со значками — число слева, значки справа.
  const hasBadges = demoProgress
    ? (demoProgress.hasVideoVizitka === true
        || demoProgress.hasAudioAnswer === true
        || (Array.isArray(demoProgress.ctaClicks) && demoProgress.ctaClicks.length > 0))
    : hasVideoVizitka === true

  // Юрий 05.07: демо не начато → единый пустой формат «—» (как в других
  // пустых ячейках списка), без сегментов-точек. «Не начато» — в тултип
  // (title на обёртке ячейки в list-view.tsx уже показывает общее описание
  // колонки; здесь даём title конкретно на «—», чтобы не потерять смысл).
  if (noProgress) {
    return (
      <span className="text-muted-foreground/40 text-sm" title="Не начато">—</span>
    )
  }

  return (
    <div className={cn("flex flex-col items-center gap-1 w-full max-w-[105px] mx-auto", className)}>
      {/* Число всегда по центру ячейки на фиксированном месте; значки висят
          вплотную справа от него (absolute left-full + небольшой ml-gap),
          поэтому их количество (0/1/2/3) НЕ сдвигает центрированное число —
          в отличие от прежнего justify-between, который разносил число и значки. */}
      <span className={cn("relative text-sm tabular-nums whitespace-nowrap font-medium inline-flex items-center justify-center w-full", labelClass)}>
        <span className="relative inline-flex items-center">
          <span>{label}</span>
          {demoProgress
            ? <DemoBadges dp={demoProgress} className="absolute left-full ml-1" />
            : (hasVideoVizitka && <Video className="absolute left-full ml-1 w-3 h-3 text-indigo-500" aria-label="Есть видео-визитка" />)}
        </span>
      </span>
      {hasFraction && effTot > 0 ? (
        // Сегменты-«шаги»: effTot делений, первые cur — залиты цветом стадии,
        // остальные серые. Наглядно показывает «N из M страниц пройдено».
        // При «пройдено по ответам» effTot = cur → все сегменты залиты (готово).
        <div className="flex w-full gap-[1px]" aria-label={`Прогресс демо: ${label}`}>
          {Array.from({ length: effTot }).map((_, i) => (
            <div
              key={i}
              className={cn(
                // Фикс. высота (НЕ aspect-square): размер сегмента не зависит от
                // их числа — иначе у 12/12 квадратики крупнее, чем у 16/17.
                "h-1.5 flex-1 rounded-[2px] transition-colors",
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
