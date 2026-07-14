/**
 * Тайминг ПЕРВОГО сообщения воронки v2 — паритет со стадией 1 «Портрет».
 *
 * Портрет (spec.resumeThresholds) настраивает задержки первого касания:
 *   - inviteDelaySeconds      — «человеческая» пауза перед приглашением (рабочее время)
 *   - offHoursEnabled         — слать ли в нерабочее время (иначе откладываем до утра)
 *   - offHoursDelaySeconds    — пауза перед мягким подтверждением в нерабочее время
 *
 * Эти поля зеркалятся в vacancy-колонки (syncPortraitMessagingToLegacy):
 *   inviteDelaySeconds     → first_messages_chain[0].delaySeconds
 *   offHoursEnabled        → first_message_off_hours_enabled
 *   offHoursDelaySeconds   → first_message_off_hours_delay_seconds
 *
 * ВАЖНО про inviteDelaySeconds (рабочее время): в legacy-пути и в v2-пути она
 * применяется НЕ как sleep, а как DEFERRAL — process-queue оставляет свежий
 * отклик в очереди (shouldDeferFirstMessage), и следующий cron-проход подберёт
 * его, когда с момента отклика прошло >= inviteDelaySeconds. Поэтому к моменту
 * входа кандидата в первую стадию v2 рабочая задержка УЖЕ выдержана — здесь её
 * повторно спать НЕ нужно (иначе двойная задержка). Единственная пауза, которую
 * добавляет этот модуль на входе, — нерабочая (off-hours), ровно как legacy
 * (см. lib/hh/process-queue.ts, ветка offHoursSoftMode).
 */

import { canSendNow, type VacancySchedule } from "@/lib/schedule/can-send-now"

/** Нерабочее окно из Портрета (spec.resumeThresholds), зеркало vacancy-колонок. */
export interface V2FirstMessageOffHours {
  /** spec.resumeThresholds.offHoursEnabled (mirror: first_message_off_hours_enabled). */
  enabled: boolean
  /** spec.resumeThresholds.offHoursDelaySeconds (mirror: first_message_off_hours_delay_seconds). */
  delaySeconds: number
}

/** Дефолт нерабочей задержки (сек), совпадает со spec-дефолтом offHoursDelaySeconds. */
export const DEFAULT_OFF_HOURS_DELAY_SECONDS = 15

/**
 * Пауза (мс) перед ПЕРВЫМ сообщением воронки v2 с учётом рабочего окна вакансии.
 *
 * - Рабочее время (canSendNow.allowed) → 0. Рабочая задержка inviteDelaySeconds
 *   уже выдержана deferral'ом до входа в стадию (см. шапку модуля).
 * - Нерабочее время + offHours.enabled → offHours.delaySeconds * 1000
 *   (mirror legacy: «человеческая» пауза перед мягким подтверждением).
 * - Нерабочее время + !enabled → 0 (кандидат в этот момент до стадии не доходит —
 *   process-queue откладывает его до рабочего окна; на всякий случай возвращаем 0).
 *
 * Чистая функция (canSendNow детерминирован при заданном now) — юнит-тестируется.
 */
export function resolveV2FirstMessageDelayMs(
  vacancy: VacancySchedule,
  offHours: V2FirstMessageOffHours,
  now: Date = new Date(),
): number {
  const check = canSendNow(vacancy, now)
  if (check.allowed) return 0
  if (!offHours.enabled) return 0
  const s = Number.isFinite(offHours.delaySeconds) ? offHours.delaySeconds : DEFAULT_OFF_HOURS_DELAY_SECONDS
  return Math.max(0, Math.round(s * 1000))
}
