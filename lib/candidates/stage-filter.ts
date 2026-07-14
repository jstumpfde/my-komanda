/**
 * lib/candidates/stage-filter.ts
 *
 * Разведка 14.07 (задачи 2+3, список кандидатов): "Статус в воронке" в фильтре
 * кандидатов допускает ДВА синтетических слуга поверх реального candidates.stage —
 * они не хранятся в БД как отдельная стадия, а разворачиваются в OR-условие по
 * нескольким полям кандидата:
 *
 *  - "preliminary_reject" — кандидат либо УЖЕ на стадии preliminary_reject,
 *    либо ждёт исполнения (pending_rejection_at IS NOT NULL — таймер cron
 *    pending-rejections), либо помечен на разбор без таймера (pending_
 *    rejection_reason IS NOT NULL — anketa_gate_failed / portrait_below_
 *    threshold). Баг Юрия 06.07: раньше чекбокс матчил только stage=
 *    'preliminary_reject' и не находил pending_rejection_*-кандидатов.
 *
 *  - "manual_review" — низкий/средний AI-балл резюме, авто-обработка
 *    остановлена, но candidates.stage НЕ меняется (кандидат мог даже остаться
 *    в 'new'). Два независимых пишущих пути (lib/hh/process-queue.ts):
 *      auto_processing_stopped_reason = 'below_threshold_manual_review'
 *        (ветка "keep_new" — mid-range score / autoInviteOn=false)
 *      pending_rejection_reason = 'portrait_below_threshold' AND
 *        pending_rejection_at IS NULL
 *        (входной гейт Портрета, rejectAction='pending_manual' — БЕЗ таймера,
 *         отличаем от 'portrait_pending_reject', который проставляет таймер).
 *    Раньше не было ни бейджа, ни фильтра — кандидаты были невидимы
 *    (23 шт. у «Маркетолога» на 14.07, ни одного pendingRejectionReason).
 *
 * Обе ветки route.ts (глобальный /hr/candidates и пер-вакансионный список)
 * раньше содержали (или должны были содержать) одинаковую логику раздельно —
 * вынесено сюда, чтобы не разъезжались. Чистая функция, без БД/IO — юнит-
 * тестируется без моков; собственно SQL-фрагменты собирает вызывающая сторона
 * (route.ts), т.к. это требует drizzle sql/eq/inArray/or с схемой candidates.
 */

export const PRELIMINARY_REJECT_SLUG = "preliminary_reject"
export const MANUAL_REVIEW_SLUG = "manual_review"

export interface SplitFunnelStatusSlugs {
  /** Реальные candidates.stage значения (обычный inArray/eq). */
  plainStages: string[]
  /** Чекбокс «Предварительный отказ» отмечен. */
  wantsPreliminaryReject: boolean
  /** Чекбокс «На ручной проверке» отмечен. */
  wantsManualReview: boolean
}

/**
 * Разбирает список слугов из чекбоксов «Статус в воронке» (funnelStatuses)
 * на обычные stage-значения и два синтетических флага. Пустые/дублирующиеся
 * записи не фильтрует специально — вызывающая сторона (route.ts) и так
 * прогоняет через inArray/eq, где дубли безвредны.
 */
export function splitFunnelStatusSlugs(stages: readonly string[]): SplitFunnelStatusSlugs {
  return {
    plainStages: stages.filter(s => s !== PRELIMINARY_REJECT_SLUG && s !== MANUAL_REVIEW_SLUG),
    wantsPreliminaryReject: stages.includes(PRELIMINARY_REJECT_SLUG),
    wantsManualReview: stages.includes(MANUAL_REVIEW_SLUG),
  }
}
