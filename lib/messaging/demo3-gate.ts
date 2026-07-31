/**
 * Чистый гейт «ставить ли напоминание про последний демо-блок перед интервью».
 *
 * Вынесен в отдельный модуль БЕЗ импортов БД, чтобы юнит-тестироваться без
 * моков (как lib/demo/block-completion.ts). Эффект (постановка в очередь) —
 * в lib/messaging/demo3-before-interview.ts.
 *
 * Логика: см. lib/messaging/demo3-before-interview.ts (шапка модуля).
 */

import {
  buildDemoBlockDefs,
  computeDemoBlockCompletion,
  getCompletedDemoBlockIndexes,
  type DemoRowForBlockDefs,
} from "@/lib/demo/block-completion"

/** Вход чистого решения гейта. */
export interface Demo3GateInput {
  /** Демо-блоки вакансии в КАНОНИЧЕСКОМ порядке (sortOrder, createdAt). */
  demoRows: ReadonlyArray<DemoRowForBlockDefs>
  /** candidates.demo_block_scores ({ [demoId]: { score } }). */
  demoBlockScores: Record<string, { score?: number }> | null | undefined
}

/** Результат гейта. */
export interface Demo3GateDecision {
  /** true = поставить напоминание. */
  shouldRemind: boolean
  /** demos.id последнего демо-блока (для ссылки ?block=<id>). null — гейт не сработал. */
  demo3Id: string | null
  /** Название последнего блока (для логов/диагностики). */
  demo3Title: string | null
  /** Сколько демо-блоков у вакансии. */
  demoBlockCount: number
  /** Почему такое решение. */
  reason: "single_demo" | "last_not_scorable" | "already_passed" | "remind"
}

/**
 * Есть ли в lessons_json хотя бы один скорируемый task-вопрос (type="task" +
 * aiCriteria) — тот же критерий «скорируемости блока», что и
 * lib/demo/score-answers.ts extractTaskQuestions, но БЕЗ импорта БД. Только
 * такие блоки получают ключ в demo_block_scores, значит только по ним можно
 * судить «прошёл/не прошёл».
 */
function hasScorableTaskQuestion(lessonsJson: unknown): boolean {
  if (!Array.isArray(lessonsJson)) return false
  for (const lesson of lessonsJson as Array<{ blocks?: unknown }>) {
    const blocks = lesson?.blocks
    if (!Array.isArray(blocks)) continue
    for (const block of blocks as Array<{ type?: unknown; questions?: unknown }>) {
      if (!block || block.type !== "task" || !Array.isArray(block.questions)) continue
      for (const q of block.questions as Array<{ aiCriteria?: unknown }>) {
        if (typeof q?.aiCriteria === "string" && q.aiCriteria.trim().length > 0) return true
      }
    }
  }
  return false
}

/**
 * ЧИСТОЕ решение (без БД). Ставить ли напоминание про последний демо-блок.
 */
export function decideDemo3BeforeInterview(input: Demo3GateInput): Demo3GateDecision {
  const rows = input.demoRows
  const defs = buildDemoBlockDefs(rows)

  // Одно демо (или нет демо) → «Демо-3» нет, гейт молчит (поведение прежнее).
  if (defs.length <= 1) {
    return { shouldRemind: false, demo3Id: null, demo3Title: null, demoBlockCount: defs.length, reason: "single_demo" }
  }

  const lastIdx = defs.length            // 1-based индекс последнего блока
  const lastRow = rows[rows.length - 1]
  const lastDef = defs[defs.length - 1]

  // Последний блок должен быть СКОРИРУЕМ — иначе ключа в demo_block_scores не
  // бывает ни у кого, и напоминание ушло бы каждому (спам). Не гейтим.
  if (!hasScorableTaskQuestion(lastRow.lessonsJson)) {
    return { shouldRemind: false, demo3Id: lastDef.demoId, demo3Title: lastDef.title, demoBlockCount: defs.length, reason: "last_not_scorable" }
  }

  const entries = computeDemoBlockCompletion(defs, input.demoBlockScores, null)
  const completedIndexes = getCompletedDemoBlockIndexes(entries)
  if (completedIndexes.includes(lastIdx)) {
    return { shouldRemind: false, demo3Id: lastDef.demoId, demo3Title: lastDef.title, demoBlockCount: defs.length, reason: "already_passed" }
  }

  return { shouldRemind: true, demo3Id: lastDef.demoId, demo3Title: lastDef.title, demoBlockCount: defs.length, reason: "remind" }
}
