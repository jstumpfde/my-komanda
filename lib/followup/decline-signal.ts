// Чистая функция решения: что делать с ответом кандидата в чате по вердикту
// classifyCandidateResponse (lib/ai/classify-candidate-response.ts). Вынесена
// отдельно от lib/hh/scan-incoming.ts / lib/avito/scan-incoming.ts, чтобы
// юнит-тестировать без БД/AI (см. lib/messaging/dozhim-mutex.ts — тот же паттерн).
//
// Инцидент 06.07.2026 (Ильин, вакансия 6916): «по холодным звонкам больше не
// собираюсь работать» — явный отказ от требования, но НЕ общий отказ от
// вакансии. Авто-отказ здесь недопустим (осознанно только по стоп-факторам,
// см. CLAUDE.md) — правильная реакция: пауза дожима + эскалация HR.

import type { CandidateIntent } from "@/lib/ai/classify-candidate-response"

export const REJECTION_CONFIDENCE_THRESHOLD = 0.9

export type IncomingMessageAction =
  | { type: "auto_reject" }
  | { type: "pause_and_escalate"; reason: string }
  | { type: "wants_contact" }
  | { type: "log_only" }

/**
 * Решает, что делать с одним классифицированным входящим сообщением
 * кандидата. Не выполняет побочных эффектов — только решение.
 */
export function decideIncomingMessageAction(
  intent:     CandidateIntent,
  confidence: number,
): IncomingMessageAction {
  if (intent === "rejection" && confidence >= REJECTION_CONFIDENCE_THRESHOLD) {
    return { type: "auto_reject" }
  }
  if (intent === "decline_requirement") {
    // Любая уверенность — не авто-отказываем, только пауза+эскалация.
    return { type: "pause_and_escalate", reason: "decline_requirement_needs_review" }
  }
  if (intent === "rejection") {
    // confidence < REJECTION_CONFIDENCE_THRESHOLD: раньше здесь был только
    // лог, дожим продолжал идти как ни в чём не бывало (часть инцидента
    // 06.07) — теперь тоже пауза+эскалация вместо тихого no-op.
    return { type: "pause_and_escalate", reason: "rejection_low_confidence_needs_review" }
  }
  if (intent === "wants_personal_contact") {
    return { type: "wants_contact" }
  }
  // busy_later / agreement / unclear
  return { type: "log_only" }
}
