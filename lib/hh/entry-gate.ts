/**
 * lib/hh/entry-gate.ts
 *
 * Входной гейт «Портрета» (решение Юрия 06.07.2026, инцидент вакансия 6916):
 * кандидат с resume_score НИЖЕ порога Портрета не должен получать первое
 * сообщение со ссылкой на демо — независимо от того, портретная вакансия
 * (portraitScoring=true) или legacy. До этого фикса пороги (spec.resumeThresholds)
 * применялись к решению «звать/не звать» ТОЛЬКО внутри контура «Портрет»
 * (process-queue.ts, `if (portraitOn && spec?.resumeThresholds)`) — у legacy-
 * вакансий с настроенным, но не подключённым к рантайму Spec, безусловный
 * lower=0 никогда не отсекал даже score=0 (10 нулевых у вакансии 6916).
 *
 * Это ЧИСТАЯ (без БД/IO) функция-решение — юнит-тестируется без моков.
 * Вызывающая сторона (process-queue.ts) сама решает, что делать с результатом:
 *   "reject"         — НЕ слать первое сообщение, поставить пред. отказ через
 *                       scheduleRejection (rejectAction="pending_rejection").
 *   "pending_manual" — НЕ слать первое сообщение, ПОМЕТИТЬ кандидата на ручной
 *                       разбор HR БЕЗ таймера (rejectAction="pending_manual",
 *                       та же семантика, что anketaPassInvite.failAction=
 *                       "pending_manual" в answer/route.ts — pendingRejectionAt
 *                       остаётся NULL, письмо не планируется и не уходит само).
 *   "send"           — вести себя как раньше (этот гейт ни на что не влияет).
 *   "wait"           — резюме ещё не оценено (score IS NULL, скоринг упал/не
 *                       запускался) — не отказывать и не слать, оставить на
 *                       следующий тик очереди (как ведёт себя очередь и сейчас
 *                       до появления resume_score).
 *
 * Семантика «пороги ЗАДАНЫ» (Юрий 06.07, дополнение): HR явно выбрал сценарий
 * зоны отказа ≠ "none" — тот же маркер, что раньше был тумблером rt.
 * autoRejectEnabled, теперь трёхвариантный селект rt.rejectAction. enabled=false
 * ИЛИ rejectAction="none" ИЛИ lowerThreshold<=0 → пороги «не заданы» → легаси-
 * поведение байт-в-байт (гейт ничего не делает).
 */

export const PORTRAIT_BELOW_THRESHOLD_REASON = "portrait_below_threshold"

/** Три сценария входного гейта — см. lib/core/spec/types.ts ResumeThresholdsSchema.rejectAction. */
export type EntryGateRejectAction = "none" | "pending_manual" | "pending_rejection"

export interface EntryGateThresholds {
  /** Блок порогов включён (spec.resumeThresholds.enabled). */
  enabled: boolean
  /**
   * Сценарий зоны отказа (spec.resumeThresholds.rejectAction). Вызывающая
   * сторона (process-queue.ts) передаёт производное поле схемы (transform
   * в types.ts уже держит его в синхроне с legacy autoRejectEnabled).
   */
  rejectAction: EntryGateRejectAction
  /** Нижний порог (spec.resumeThresholds.lowerThreshold). */
  lowerThreshold: number
}

export type EntryGateDecision =
  | { action: "reject"; score: number; threshold: number }
  | { action: "pending_manual"; score: number; threshold: number }
  | { action: "send" }
  | { action: "wait" }

/**
 * Заданы ли пороги/зона отказа настолько, что гейт вообще применим.
 * Без этого маркера — легаси-поведение (действие "send", гейт молчит).
 */
export function isEntryGateConfigured(t: EntryGateThresholds | null | undefined): boolean {
  if (!t) return false
  return t.enabled === true && t.rejectAction !== "none" && t.lowerThreshold > 0
}

/**
 * Решение входного гейта Портрета.
 *
 * @param score       candidates.resume_score. null = ещё не посчитан (AI упал
 *                    или скоринг для этой вакансии не запускался).
 * @param thresholds  Пороги из Spec (spec.resumeThresholds) ИЛИ null/undefined,
 *                    если Spec нет вовсе.
 */
export function decideEntryGate(
  score: number | null | undefined,
  thresholds: EntryGateThresholds | null | undefined,
): EntryGateDecision {
  // Пороги не заданы (нет Spec / блок выключен / сценарий "none" /
  // порог 0) → поведение прежнее, гейт не вмешивается.
  if (!isEntryGateConfigured(thresholds)) return { action: "send" }

  // Score ещё не посчитан — НЕ отказываем и НЕ шлём, ждём следующий тик
  // (тот же принцип, что уже действует в очереди до появления resume_score).
  if (score == null) return { action: "wait" }

  const t = thresholds as EntryGateThresholds
  if (score < t.lowerThreshold) {
    return t.rejectAction === "pending_manual"
      ? { action: "pending_manual", score, threshold: t.lowerThreshold }
      : { action: "reject", score, threshold: t.lowerThreshold }
  }
  return { action: "send" }
}
