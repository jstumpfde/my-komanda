/**
 * Хелперы доступа к пер-блочным баллам демо (candidates.demo_block_scores).
 *
 * demo_block_scores — jsonb-мапа { [demoId]: { title, score, breakdown } },
 * которую пишет lib/demo/score-answers.ts. Ключи расставляются в порядке
 * обхода demos вакансии: orderBy(demos.sortOrder, demos.createdAt) — то есть
 * порядок вставки в объекте совпадает с визуальным порядком блоков демо.
 *
 * «Блок 1» = совокупный demo_answers_score (основной блок / анкета) — им уже
 * пользуется воронка. «Блок 2» = 2-я часть демо («Путь менеджера»): второй по
 * порядку scored-блок. Этот балл — источник сигнала 'block2' для правила
 * прохода Воронки v2 и для панели «Оценки».
 */

/** Одна запись пер-блочного балла (форма из score-answers.ts). */
export interface DemoBlockScoreEntry {
  title?: string
  score: number
  breakdown?: { questionText: string; awarded: number; max: number; comment: string }[]
}

/** Минимальный вход: любой объект с полем demo_block_scores. */
export interface HasDemoBlockScores {
  demoBlockScores?: Record<string, DemoBlockScoreEntry> | null
}

/** Балл + demoId + title блока по его порядковому номеру (1-based). null если нет. */
export interface DemoBlockScoreRef {
  demoId: string
  title: string | null
  score: number
}

/**
 * Возвращает баллы всех scored-блоков в порядке вставки (= порядок блоков демо).
 * Пустой массив, если demo_block_scores не заполнен.
 */
export function listBlockScores(candidate: HasDemoBlockScores | null | undefined): DemoBlockScoreRef[] {
  const map = candidate?.demoBlockScores
  if (!map || typeof map !== "object") return []
  const out: DemoBlockScoreRef[] = []
  for (const [demoId, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== "object") continue
    const score = Number((entry as DemoBlockScoreEntry).score)
    if (!Number.isFinite(score)) continue
    out.push({
      demoId,
      title: typeof entry.title === "string" ? entry.title : null,
      score,
    })
  }
  return out
}

/**
 * Балл N-го scored-блока демо (1-based). getBlockScore(c, 2) === getBlock2Score(c).
 * null, если блока с таким номером нет.
 */
export function getBlockScore(
  candidate: HasDemoBlockScores | null | undefined,
  index1Based: number,
): number | null {
  if (!Number.isInteger(index1Based) || index1Based < 1) return null
  const list = listBlockScores(candidate)
  const ref = list[index1Based - 1]
  return ref ? ref.score : null
}

/**
 * Балл «блока 2» демо (2-я часть / «Путь менеджера») — второй по порядку
 * scored-блок. null, если у кандидата scored менее двух блоков (нет 2-й части).
 *
 * Источник сигнала 'block2' для правила прохода Воронки v2 и панели «Оценки».
 */
export function getBlock2Score(candidate: HasDemoBlockScores | null | undefined): number | null {
  return getBlockScore(candidate, 2)
}
