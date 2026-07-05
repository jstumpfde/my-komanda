// Условие триггера алерта «горячий кандидат стынет» (батч «конверсия демо» 05.07).
//
// Кандидат с высоким баллом Портрета открыл демо и застыл — HR стоит связаться
// лично, пока кандидат тёплый. Вынесено в чистую функцию, чтобы юнит-тестить
// логику отдельно от cron/БД (cron — app/api/cron/hot-candidate-alerts).
//
// Условие (ВСЕ пункты одновременно):
//   1. resume_score >= threshold (per-vacancy порог, spec.hotCandidateAlert.threshold)
//   2. demo_opened_at задан И старше staleAfterHours часов
//   3. 0 завершённых блоков демо (demo_progress_json.blocks, статус "completed",
//      исключая виртуальные маркеры __anketa__/__thanks__/__complete__)
//   4. анкета не заполнена (anketa_answers пуст/отсутствует)
//   5. алерт ещё не отправлялся (demo_progress_json.hotAlertSentAt не задан)

export interface DemoProgressForTrigger {
  blocks?: Array<{ blockId: string; status?: string }> | null
  hotAlertSentAt?: string | null
}

export interface HotCandidateTriggerInput {
  resumeScore:      number | null | undefined
  threshold:        number
  demoOpenedAt:     Date | string | null | undefined
  staleAfterHours:  number
  demoProgressJson: DemoProgressForTrigger | null | undefined
  anketaAnswers:    unknown
  now?:             Date
}

// Виртуальные маркеры прогресса — не считаются «пройденными блоками» демо
// (см. app/(public)/demo/[token]/demo-client.tsx — postVirtualMarkers).
const VIRTUAL_MARKERS = new Set(["__anketa__", "__thanks__", "__complete__"])

function hasAnketaAnswers(anketaAnswers: unknown): boolean {
  if (!anketaAnswers) return false
  if (Array.isArray(anketaAnswers)) return anketaAnswers.length > 0
  if (typeof anketaAnswers === "object") return Object.keys(anketaAnswers as object).length > 0
  return false
}

function countCompletedRealBlocks(progress: DemoProgressForTrigger | null | undefined): number {
  const blocks = progress?.blocks
  if (!Array.isArray(blocks)) return 0
  return blocks.filter((b) => b.status === "completed" && !VIRTUAL_MARKERS.has(b.blockId)).length
}

export function shouldSendHotCandidateAlert(input: HotCandidateTriggerInput): boolean {
  const now = input.now ?? new Date()

  if (input.resumeScore == null || input.resumeScore < input.threshold) return false

  if (!input.demoOpenedAt) return false
  const openedAt = input.demoOpenedAt instanceof Date ? input.demoOpenedAt : new Date(input.demoOpenedAt)
  if (Number.isNaN(openedAt.getTime())) return false
  const hoursSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60)
  if (hoursSinceOpen < input.staleAfterHours) return false

  if (countCompletedRealBlocks(input.demoProgressJson) > 0) return false

  if (hasAnketaAnswers(input.anketaAnswers)) return false

  if (input.demoProgressJson?.hotAlertSentAt) return false

  return true
}
