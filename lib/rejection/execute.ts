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
import { sanitizeRejectionText } from "@/lib/rejection/legal-guard"
import { candidates, followUpMessages, vacancies } from "@/lib/db/schema"
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
  // Уже отрендеренный текст отказа. Если задан — кандидат получит его при
  // исполнении (нужно для факторных текстов стоп-факторов). NULL/пусто =
  // generic rejectMessage вакансии.
  message?: string | null
}): Promise<{ scheduled: boolean; at: Date | null }> {
  const { candidateId, reason, delayMinutes, message } = args

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
    pendingRejectionAt:      at,
    pendingRejectionReason:  reason,
    pendingRejectionSetAt:   now,
    pendingRejectionMessage: sanitizeRejectionText(typeof message === "string" && message.trim().length > 0 ? message : null),
    updatedAt:               now,
  }).where(eq(candidates.id, candidateId))

  return { scheduled: true, at }
}

// Отменить запланированный отказ (HR передумал / кандидат ответил и т.п.).
export async function cancelScheduledRejection(candidateId: string): Promise<void> {
  await db.update(candidates).set({
    pendingRejectionAt:      null,
    pendingRejectionReason:  null,
    pendingRejectionSetAt:   null,
    pendingRejectionMessage: null,
    updatedAt:               new Date(),
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
    .select({
      stage:        candidates.stage,
      stageHistory: candidates.stageHistory,
      message:      candidates.pendingRejectionMessage,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!prev) return { rejected: false }
  if (prev.stage === "rejected") {
    // Уже отклонён — просто чистим возможный pending-флаг.
    await cancelScheduledRejection(candidateId)
    return { rejected: false }
  }
  // M-1: кандидат уже нанят — отложенный отказ не должен его перезаписывать
  // (мог быть нанят вручную HR за время задержки отказа). Просто снимаем pending.
  if (prev.stage === "hired") {
    await cancelScheduledRejection(candidateId)
    return { rejected: false }
  }

  const fromStage = prev.stage ?? "new"
  const history = (prev.stageHistory as Array<Record<string, unknown>> | null) ?? []
  const now = new Date()

  await db.update(candidates).set({
    stage:                       "rejected",
    // Аудит 10.07: дата СОБЫТИЯ отказа — по ней отчёт считает «Отказов за
    // период» (раньше писалась только в ручном пути смены стадии, авто-путь
    // не писал → отчёт был вынужден считать по дате отклика).
    rejectionAt:                 now,
    automationPaused:            true,
    autoProcessingStopped:       true,
    autoProcessingStoppedReason: reason,
    autoProcessingStoppedAt:     now,
    pendingRejectionAt:          null,
    pendingRejectionReason:      null,
    pendingRejectionSetAt:       null,
    pendingRejectionMessage:     null,
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

  // Сообщение об отказе + discard в hh. Если на момент планирования был
  // сохранён кастомный текст (стоп-фактор) — шлём его; иначе generic из вакансии.
  // Аудит 10.07: сбой синка больше не глотается молча — раньше кандидат был
  // rejected локально, а на hh письмо не уходило и чат оставался открытым,
  // без какого-либо сигнала. Теперь HR получает in-app уведомление и может
  // закрыть отказ на hh руками (авто-ретрая нет осознанно: повторный discard
  // по протухшей переписке будет падать вечно — см. паттерн 12в в бэклоге).
  const hhSynced = await trySyncRejectToHh(candidateId, sanitizeRejectionText(prev.message)).catch(() => false)
  if (!hhSynced) {
    try {
      const [row] = await db
        .select({ name: candidates.name, companyId: vacancies.companyId, vacancyTitle: vacancies.title })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(eq(candidates.id, candidateId))
        .limit(1)
      if (row?.companyId) {
        const { createNotification } = await import("@/lib/notifications")
        await createNotification({
          tenantId:   row.companyId,
          type:       "hh_reject_sync_failed",
          title:      `⚠️ Отказ не ушёл на hh: ${row.name ?? "кандидат"}`,
          body:       `${row.vacancyTitle ?? ""} · кандидат отклонён на платформе, но hh-чат не закрыт (сбой синка). Закройте отказ на hh вручную.`,
          severity:   "warning",
          href:       `/hr/candidates/${candidateId}`,
          sourceType: "candidate",
          sourceId:   candidateId,
        })
      }
    } catch { /* уведомление не должно ломать сам отказ */ }
  }

  return { rejected: true }
}
