/**
 * Единый балл «Анкета» по обеим частям демо (Вариант Б, решение Юрия 05.07).
 *
 * Контекст: анкета демо двухступенчатая. Часть 1 («Презентация») скорится
 * первой — её балл исторически пишется в candidates.demo_answers_score
 * (колонка «Анкета» в списке, бейдж в шапке карточки). При прохождении
 * порога кандидат получает часть 2 («Путь менеджера» и т.п.), у которой свой
 * пер-блочный балл (candidates.demo_block_scores, lib/demo/block-scores.ts).
 *
 * ПОКА сдана только часть 1 — единый балл = балл части 1 (поведение как
 * сейчас, ничего не меняется: у кандидата ровно один scored-блок).
 *
 * ПОСЛЕ сдачи части 2 — единый балл считается ПО ОТВЕЧЕННЫМ ВОПРОСАМ обеих
 * частей: неотвеченные вопросы/несданные части исключаются из знаменателя.
 * Технически это просто sum(awarded)/sum(max) по breakdown ВСЕХ scored-блоков
 * (blockScores) — блок появляется в blockScores, только если у кандидата
 * есть хотя бы один реальный ответ в нём (см. score-answers.ts), поэтому
 * несданная часть 2 туда не попадает и не тянет знаменатель вниз.
 *
 * Внутри уже отвеченного блока неотвеченные вопросы ЭТОГО блока по-прежнему
 * считаются с awarded=0 в его собственном знаменателе (см. score-answers.ts,
 * не меняем) — единый балл наследует это как есть, суммируя per-block
 * awarded/max один в один.
 */

export interface UnifiedScoreQuestionBreakdown {
  questionText: string
  awarded: number
  max: number
  comment: string
}

export interface UnifiedScoreBlockInput {
  demoId: string
  title?: string
  score: number
  breakdown: UnifiedScoreQuestionBreakdown[]
}

export interface UnifiedScoreResult {
  /** Единый балл 0-100 по всем answered-блокам. */
  score: number
  /** Сколько частей демо сдано (answered-блоков с реальными ответами). */
  partsAnswered: number
  /** Сколько частей демо всего у вакансии (для индикатора "N/M"). */
  partsTotal: number
}

/**
 * Считает единый балл «Анкета» по списку answered-блоков (в порядке вставки).
 *
 * @param blocks       все scored-блоки кандидата (demo_block_scores), в порядке
 *                     вставки — обычно это порядок демо-блоков вакансии.
 * @param partsTotal   сколько частей демо всего сконфигурировано у вакансии
 *                     (для индикатора прогресса; НЕ влияет на формулу балла —
 *                     знаменатель балла берётся только из answered-блоков).
 */
export function computeUnifiedAnketaScore(
  blocks: UnifiedScoreBlockInput[],
  partsTotal: number,
): UnifiedScoreResult | null {
  if (blocks.length === 0) return null

  let sumAwarded = 0
  let sumMax = 0
  for (const b of blocks) {
    for (const q of b.breakdown) {
      sumAwarded += q.awarded
      sumMax += q.max
    }
  }

  const score = sumMax > 0 ? Math.max(0, Math.min(100, Math.round((sumAwarded / sumMax) * 100))) : 0

  return {
    score,
    partsAnswered: blocks.length,
    partsTotal: Math.max(partsTotal, blocks.length),
  }
}
