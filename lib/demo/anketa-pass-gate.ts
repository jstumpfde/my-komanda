/**
 * Чистая (без БД) логика ИЛИ-гейта «2-я часть демо» (anketaPassInvite) и
 * решения «слать/не слать» письмо-приглашение при бесшовном переходе.
 *
 * Извлечено из lib/messaging/second-demo-invite.ts (05.07, фикс osечки
 * бесшовного перехода): раньше решения дублировались инлайн в двух местах
 * (maybeScheduleSecondDemoInvite + describeSecondDemoInvite) — риск разъехаться.
 * Здесь — единственный источник истины, юнит-тестируемый без моков БД.
 */

export const DEFAULT_AI_EVAL_THRESHOLD = 45

export type TransferMode = "seamless" | "message" | "both"

/**
 * Резолв transferMode с обратной совместимостью: старые спеки без явного
 * transferMode читали inlineContinue (false ⇒ "message", иначе ⇒ "both").
 */
export function resolveTransferMode(ap: {
  transferMode?: unknown
  inlineContinue?: unknown
} | null | undefined): TransferMode {
  if (ap?.transferMode === "seamless" || ap?.transferMode === "message" || ap?.transferMode === "both") {
    return ap.transferMode
  }
  return ap?.inlineContinue === false ? "message" : "both"
}

export interface GateScores {
  /** Детерминированный балл по вопросам-выбора (null — вопросов/ответов нет). */
  objectiveScore: number | null
  /** AI-оценка ответов анкеты, candidates.demo_answers_score (null — ещё не посчитана). */
  aiEvalScore: number | null
}

export interface GateThresholds {
  passThreshold: number
  aiEvalThreshold: number
}

export type GateDecision =
  | { passed: true; via: "objective" | "ai_eval"; score: number }
  // Оба балла null — гейт неприменим (нет объективных вопросов и AI-оценки ещё нет).
  | { passed: false; reason: "not_applicable" }
  // Хотя бы один балл известен, но ни один порог не взят.
  | { passed: false; reason: "below_threshold"; score: number | null }

/**
 * ИЛИ-гейт: кандидат проходит во 2-ю часть демо, если
 * objectiveScore >= passThreshold ИЛИ aiEvalScore >= aiEvalThreshold.
 * Приоритет отчёта — объективный балл (детерминирован, стабилен).
 */
export function decideAnketaPassGate(
  scores: GateScores,
  thresholds: GateThresholds,
): GateDecision {
  const { objectiveScore, aiEvalScore } = scores
  const passObjective = objectiveScore != null && objectiveScore >= thresholds.passThreshold
  const passAiEval = aiEvalScore != null && aiEvalScore >= thresholds.aiEvalThreshold

  if (passObjective || passAiEval) {
    return {
      passed: true,
      via: passObjective ? "objective" : "ai_eval",
      score: passObjective ? (objectiveScore as number) : (aiEvalScore as number),
    }
  }

  if (objectiveScore == null && aiEvalScore == null) {
    return { passed: false, reason: "not_applicable" }
  }
  return { passed: false, reason: "below_threshold", score: objectiveScore ?? aiEvalScore ?? null }
}

/**
 * Слать ли письмо-приглашение (follow_up_messages, branch='second_demo_invite')
 * при прохождении гейта ПРЯМО СЕЙЧАС (первый проход, не повторный сабмит уже
 * приглашённого — тот дедуп делается раньше, до вызова этой функции).
 *
 * Решение Юрия 05.07: в seamless-режиме кандидат уже переходит на блок 2
 * бесшовно на той же странице — письмо было бы избыточным (и создало бы
 * задвоенное касание, если кандидат вернётся по ссылке из письма после того,
 * как уже прошёл инлайн). В message/both письмо остаётся — единственный путь
 * (message) или страховка на случай ухода со страницы до навигации (both).
 */
export function shouldSendPassInviteMessage(transferMode: TransferMode): boolean {
  return transferMode === "message" || transferMode === "both"
}

/**
 * Показывать ли бесшовный инлайн-переход на блок 2 (без «Спасибо» и письма).
 */
export function shouldAdvanceInline(transferMode: TransferMode): boolean {
  return transferMode === "seamless" || transferMode === "both"
}
