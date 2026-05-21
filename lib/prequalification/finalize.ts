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
import { trySyncRejectToHh, trySyncInviteToHh } from "@/lib/hh/sync-stage"

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
        stage:            candidates.stage,
        stageHistory:     candidates.stageHistory,
        vacancyId:        candidates.vacancyId,
        prequalStatus:    candidates.prequalificationStatus,
        aiSettings:       vacancies.aiProcessSettings,
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
      // Reject. Сохраняем stage='rejected' + auto-stopped + soft reject в hh.
      await db.update(candidates).set({
        stage:                       "rejected",
        autoProcessingStopped:       true,
        autoProcessingStoppedReason: "prequalification_failed",
        autoProcessingStoppedAt:     now,
        prequalificationStatus:      "failed",
        prequalificationCompletedAt: now,
        stageHistory: [...history, { from: fromStage, to: "rejected", at: nowIso, reason }],
        updatedAt: now,
      }).where(eq(candidates.id, args.candidateId))
      await trySyncRejectToHh(args.candidateId)
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

      await db.update(candidates).set({
        prequalificationStatus:      verdict,
        prequalificationCompletedAt: now,
        ...(skipDemo ? { stage: "anketa_filled" } : {}),
        stageHistory: [...history, { from: fromStage, to: toStage, at: nowIso, reason }],
        updatedAt: now,
      }).where(eq(candidates.id, args.candidateId))

      if (!skipDemo) {
        await trySyncInviteToHh(args.candidateId)
      }

      // hh_responses из очереди (если ещё лежит как response) → invited.
      // Делаем и для prequal_only — отклик из очереди ушёл, решение принято.
      await db.update(hhResponses).set({ status: "invited" })
        .where(and(
          eq(hhResponses.localCandidateId, args.candidateId),
          eq(hhResponses.status, "response"),
        ))
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
} | null> {
  const [row] = await db
    .select({
      aiSettings:   vacancies.aiProcessSettings,
      vacancyTitle: vacancies.title,
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
  }
}
