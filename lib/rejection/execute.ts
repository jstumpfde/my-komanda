// Единый канон ИСПОЛНЕНИЯ отказа кандидата.
//
// Принцип (ТЗ владельца): мгновенных авто-отказов в системе нет. Точки отказа
// (стоп-факторы, провал предквалификации, «не интересно» в чате, security
// чат-бота) НЕ зовут executeRejection напрямую с нулевой задержкой — они
// планируют отказ через scheduleRejection(), а исполняет его cron
// /api/cron/pending-rejections по истечении задержки в рабочее время.
//
// executeRejection() — низкоуровневое «сделать отказ сейчас»: стадия
// 'rejected' + отмена pending-касаний + сообщение/discard в hh
// (через trySyncRejectToHh, который сам достаёт токен и текст из вакансии).
// Зовётся ТОЛЬКО из cron (по таймеру) и из ручных действий HR.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, followUpMessages } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { trySyncRejectToHh } from "@/lib/hh/sync-stage"

export const DEFAULT_REJECTION_DELAY_MINUTES = 300  // 5 часов

// Сколько ждать до отказа для вакансии (минуты). 0 = мгновенно.
export function rejectionDelayMinutes(settings: VacancyAiProcessSettings | null | undefined): number {
  const v = settings?.rejectionDelayMinutes
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return DEFAULT_REJECTION_DELAY_MINUTES
  return Math.floor(v)
}

// Запланировать отложенный отказ. Ставит pendingRejectionAt = now + задержка.
// НЕ меняет стадию и НЕ шлёт ничего в hh — это сделает cron, когда время придёт
// (и только в рабочее время вакансии). Повторный вызов не сдвигает уже
// запланированный отказ (idempotent по «уже запланирован»).
export async function scheduleRejection(args: {
  candidateId: string
  reason: string
  delayMinutes: number
}): Promise<{ scheduled: boolean; at: Date | null }> {
  const { candidateId, reason, delayMinutes } = args

  const [cand] = await db
    .select({ stage: candidates.stage, pendingRejectionAt: candidates.pendingRejectionAt })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!cand) return { scheduled: false, at: null }
  // Уже отклонён или уже запланирован — не трогаем.
  if (cand.stage === "rejected") return { scheduled: false, at: null }
  if (cand.pendingRejectionAt) return { scheduled: false, at: cand.pendingRejectionAt }

  const now = new Date()
  const at = new Date(now.getTime() + Math.max(0, delayMinutes) * 60_000)
  await db.update(candidates).set({
    pendingRejectionAt:     at,
    pendingRejectionReason: reason,
    pendingRejectionSetAt:  now,
    updatedAt:              now,
  }).where(eq(candidates.id, candidateId))

  return { scheduled: true, at }
}

// Отменить запланированный отказ (HR передумал / кандидат ответил и т.п.).
export async function cancelScheduledRejection(candidateId: string): Promise<void> {
  await db.update(candidates).set({
    pendingRejectionAt:     null,
    pendingRejectionReason: null,
    pendingRejectionSetAt:  null,
    updatedAt:              new Date(),
  }).where(eq(candidates.id, candidateId))
}

// Исполнить отказ ПРЯМО СЕЙЧАС: стадия rejected, снять автообработку, отменить
// pending-касания, сообщение + discard в hh. Очищает pendingRejection*.
// Идемпотентно: если уже rejected — ничего не делает.
export async function executeRejection(args: {
  candidateId: string
  reason: string
}): Promise<{ rejected: boolean }> {
  const { candidateId, reason } = args

  const [prev] = await db
    .select({ stage: candidates.stage, stageHistory: candidates.stageHistory })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!prev) return { rejected: false }
  if (prev.stage === "rejected") {
    // Уже отклонён — просто чистим возможный pending-флаг.
    await cancelScheduledRejection(candidateId)
    return { rejected: false }
  }

  const fromStage = prev.stage ?? "new"
  const history = (prev.stageHistory as Array<Record<string, unknown>> | null) ?? []
  const now = new Date()

  await db.update(candidates).set({
    stage:                       "rejected",
    automationPaused:            true,
    autoProcessingStopped:       true,
    autoProcessingStoppedReason: reason,
    autoProcessingStoppedAt:     now,
    pendingRejectionAt:          null,
    pendingRejectionReason:      null,
    pendingRejectionSetAt:       null,
    stageHistory: [...history, {
      from:   fromStage,
      to:     "rejected",
      at:     now.toISOString(),
      reason,
    }],
    updatedAt: now,
  }).where(eq(candidates.id, candidateId))

  // Отменяем pending-касания дожима.
  await db.update(followUpMessages).set({
    status:       "cancelled",
    errorMessage: reason,
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))

  // Сообщение об отказе + discard в hh (текст берётся из вакансии внутри).
  await trySyncRejectToHh(candidateId).catch(() => false)

  return { rejected: true }
}
