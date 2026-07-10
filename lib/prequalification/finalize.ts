// Сессия 9 (6b): финальное решение по предквалификации кандидата.
//
// Вызывается:
//   - из process-answer.ts когда получены ответы на ВСЕ вопросы;
//   - из cron/prequalification когда истёк fallback (Д+fallbackDays).
//
// Логика:
//   - failed (хоть один критичный verdict='failed') → soft reject в hh,
//     stage='rejected', prequalification_status='failed'.
//   - unclear на критичных принимаем как passed (даём шанс, п.3).
//   - timeout → no_answer → шлём демо без квалификации.
//   - все критичные passed → invite (demo link), prequalification_status='passed'.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, candidateQualificationAnswers, hhResponses } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { trySyncInviteToHh } from "@/lib/hh/sync-stage"
import { scheduleRejection, rejectionDelayMinutes } from "@/lib/rejection/execute"

interface FinalizeArgs {
  candidateId: string
  // Если true — fallback по таймауту. Пишем status='no_answer' даже при
  // частичных ответах. Если false — обычное завершение по ответам.
  isTimeout?:  boolean
}

interface FinalizeResult {
  finalized: boolean
  verdict?:  "passed" | "failed" | "no_answer"
  reason?:   string
}

interface StageHistoryEntry {
  from: string
  to: string
  at: string
  reason: string
  [k: string]: unknown
}

export async function finalizePrequalification(args: FinalizeArgs): Promise<FinalizeResult> {
  try {
    const [cand] = await db
      .select({
        id:               candidates.id,
        name:             candidates.name,
        stage:            candidates.stage,
        stageHistory:     candidates.stageHistory,
        vacancyId:        candidates.vacancyId,
        prequalStatus:    candidates.prequalificationStatus,
        aiSettings:       vacancies.aiProcessSettings,
        companyId:        vacancies.companyId,
        vacancyTitle:     vacancies.title,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(candidates.id, args.candidateId))
      .limit(1)
    if (!cand) return { finalized: false, reason: "candidate_not_found" }
    if (cand.prequalStatus !== "pending") {
      return { finalized: false, reason: `already_${cand.prequalStatus ?? "null"}` }
    }

    const answers = await db
      .select()
      .from(candidateQualificationAnswers)
      .where(and(
        eq(candidateQualificationAnswers.candidateId, args.candidateId),
        eq(candidateQualificationAnswers.vacancyId, cand.vacancyId),
      ))

    // Решение.
    const criticalAnswers = answers.filter(a => a.isCritical)
    const failedCritical = criticalAnswers.some(a => a.aiVerdict === "failed")

    let verdict: "passed" | "failed" | "no_answer"
    if (failedCritical) {
      verdict = "failed"
    } else if (args.isTimeout) {
      verdict = "no_answer"
    } else {
      verdict = "passed"
    }

    const now    = new Date()
    const nowIso = now.toISOString()
    const fromStage = cand.stage ?? "new"
    const history = (cand.stageHistory as StageHistoryEntry[] | null) ?? []
    const reason  = `prequalification_${verdict}`

    if (verdict === "failed") {
      // Заход 3: отказ откладывается. Фиксируем провал предквалификации и
      // останавливаем автообработку, НО stage='rejected' и сообщение в hh
      // ставит cron pending-rejections, когда истечёт задержка вакансии
      // (в рабочее время). delay=0 → cron исполнит на ближайшем прогоне.
      //
      // Аудит 10.07 — ПОРЯДОК: scheduleRejection ДО коммита статуса. Раньше
      // статус 'failed' коммитился первым, и если scheduleRejection падал —
      // повторный finalize возвращал «already_failed», отказ не ставился
      // никогда, кандидат зависал без движения. scheduleRejection идемпотентен
      // (гварды pendingRejectionAt/stage внутри), поэтому переупорядочивание
      // безопасно.
      const aiSettings = (cand.aiSettings as VacancyAiProcessSettings | null) ?? null
      await scheduleRejection({
        candidateId:  args.candidateId,
        reason:       "prequalification_failed",
        delayMinutes: rejectionDelayMinutes(aiSettings),
      })
      await db.update(candidates).set({
        autoProcessingStopped:       true,
        autoProcessingStoppedReason: "prequalification_failed",
        autoProcessingStoppedAt:     now,
        prequalificationStatus:      "failed",
        prequalificationCompletedAt: now,
        stageHistory: [...history, { from: fromStage, to: fromStage, at: nowIso, reason }],
        updatedAt: now,
      }).where(eq(candidates.id, args.candidateId))
    } else {
      // passed или no_answer:
      //   • prequal_only — demo не отправляется, кандидат → anketa_filled,
      //     HR разбирает руками.
      //   • остальные режимы (direct_demo / prequal_then_demo) — отправляем
      //     demo. status фиксируем, stage не трогаем — invite-flow ниже
      //     выставит primary_contact/demo_opened как обычно.
      const aiSettings = (cand.aiSettings as VacancyAiProcessSettings | null) ?? null
      const mode = aiSettings?.prequalificationMode ?? "direct_demo"
      const skipDemo = mode === "prequal_only"
      const toStage = skipDemo ? "anketa_filled" : fromStage

      // Аудит 10.07 (ревизия по predeploy-guard 11.07) — ПОРЯДОК: вердикт
      // коммитится ПЕРВЫМ, отправка приглашения — после, best-effort.
      // Обратный порядок (отправка до коммита, finalized:false при сбое)
      // ломал ответившего кандидата: он застревал в pending, и fallback-крон
      // по таймауту перезаписывал его вердиктом no_answer, хотя все ответы
      // получены. Вердикт — факт, он фиксируется всегда; сбой отправки
      // (протухший hh-токен/сеть) не должен его отменять — вместо этого HR
      // получает уведомление и отправляет ссылку вручную.
      await db.update(candidates).set({
        prequalificationStatus:      verdict,
        prequalificationCompletedAt: now,
        ...(skipDemo ? { stage: "anketa_filled" } : {}),
        stageHistory: [...history, { from: fromStage, to: toStage, at: nowIso, reason }],
        updatedAt: now,
      }).where(eq(candidates.id, args.candidateId))

      // hh_responses из очереди (если ещё лежит как response) → invited.
      // Делаем и для prequal_only — отклик из очереди ушёл, решение принято.
      await db.update(hhResponses).set({ status: "invited" })
        .where(and(
          eq(hhResponses.localCandidateId, args.candidateId),
          eq(hhResponses.status, "response"),
        ))

      if (!skipDemo) {
        const sent = await trySyncInviteToHh(args.candidateId)
        if (!sent) {
          console.warn("[prequalification] invite send failed after finalize", { candidateId: args.candidateId })
          try {
            const { createNotification } = await import("@/lib/notifications")
            await createNotification({
              tenantId:   cand.companyId,
              type:       "hh_invite_send_failed",
              title:      `⚠️ Приглашение не ушло: ${cand.name ?? "кандидат"}`,
              body:       `${cand.vacancyTitle ?? ""} · предквалификация пройдена (${verdict}), но приглашение с демо-ссылкой не отправилось в hh. Отправьте кандидату ссылку вручную.`,
              severity:   "warning",
              href:       `/hr/candidates/${args.candidateId}`,
              sourceType: "candidate",
              sourceId:   args.candidateId,
            })
          } catch { /* уведомление не должно ломать finalize */ }
        }
      }
    }

    console.log("[prequalification]", JSON.stringify({
      tag:        "prequalification/finalized",
      candidateId: args.candidateId,
      verdict,
      isTimeout:   Boolean(args.isTimeout),
      critical:    criticalAnswers.length,
      failedCritical,
    }))

    return { finalized: true, verdict }
  } catch (err) {
    console.error("[prequalification] finalize failed:", err instanceof Error ? err.message : err)
    return { finalized: false, reason: "exception" }
  }
}

// Не имеет внешних зависимостей кроме vacancies — нужен для проверки
// «все ли pending ответы получены». Используется в process-answer.ts.
export async function allQuestionsAnswered(candidateId: string): Promise<boolean> {
  const [cand] = await db
    .select({ vacancyId: candidates.vacancyId })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!cand) return false
  const answers = await db
    .select()
    .from(candidateQualificationAnswers)
    .where(and(
      eq(candidateQualificationAnswers.candidateId, candidateId),
      eq(candidateQualificationAnswers.vacancyId, cand.vacancyId),
    ))
  if (answers.length === 0) return false
  return answers.every(a => a.aiVerdict !== null && a.aiVerdict !== undefined)
}

// Используется в /api/cron/prequalification: сколько дней прошло с
// момента отправки. Helper потому что Math.floor((now-sent)/day) пишется
// в 5 местах.
export function daysSinceSent(sentAt: Date | null, now: Date = new Date()): number {
  if (!sentAt) return 0
  return Math.floor((now.getTime() - sentAt.getTime()) / (24 * 3600 * 1000))
}

// Vacancy.prequalification config helper для cron'а — выбирает дни
// напоминаний и fallbackDays с дефолтами.
export async function getPrequalConfig(candidateId: string): Promise<{
  reminderD1?:   string
  reminderD3?:   string
  fallbackDays:  number
  vacancyTitle:  string
  companyId:     string
} | null> {
  const [row] = await db
    .select({
      aiSettings:   vacancies.aiProcessSettings,
      vacancyTitle: vacancies.title,
      companyId:    vacancies.companyId,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(eq(candidates.id, candidateId))
    .limit(1)
  if (!row) return null
  const ai = row.aiSettings as { prequalification?: { reminderD1?: string; reminderD3?: string; fallbackDays?: number } } | null
  return {
    reminderD1:   ai?.prequalification?.reminderD1,
    reminderD3:   ai?.prequalification?.reminderD3,
    fallbackDays: typeof ai?.prequalification?.fallbackDays === "number" && ai.prequalification.fallbackDays > 0
                    ? Math.min(30, Math.round(ai.prequalification.fallbackDays))
                    : 5,
    vacancyTitle: row.vacancyTitle ?? "",
    companyId:    row.companyId,
  }
}
