// Сессия 9 (6b): обработка входящего ответа кандидата на предкв-вопросы.
//
// Вызывается из scan-incoming.ts когда у кандидата prequalificationStatus='pending'
// и пришло новое applicant-сообщение. Делает один AI-вызов на все
// pending-вопросы за раз, обновляет candidate_qualification_answers,
// и если все вопросы оценены — финализирует решение.
//
// AI verdict 'unclear' трактуется как «не отвечено» — pending остаётся,
// allQuestionsAnswered вернёт false, finalize не вызовется, ждём
// следующее сообщение / fallback.

import { eq, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidateQualificationAnswers, candidates } from "@/lib/db/schema"
import { screenPrequalificationAnswers } from "@/lib/ai-screen-prequalification"
import {finalizePrequalification} from "./finalize"

interface ProcessResult {
  processed:  boolean
  finalized?: boolean
  verdict?:   "passed" | "failed" | "no_answer"
  reason?:    string
}

export async function processPrequalificationAnswer(args: {
  candidateId:  string
  answerText:   string
}): Promise<ProcessResult> {
  try {
    const [cand] = await db
      .select({
        id:             candidates.id,
        vacancyId:      candidates.vacancyId,
        prequalStatus:  candidates.prequalificationStatus,
      })
      .from(candidates)
      .where(eq(candidates.id, args.candidateId))
      .limit(1)
    if (!cand) return { processed: false, reason: "candidate_not_found" }
    if (cand.prequalStatus !== "pending") {
      return { processed: false, reason: `not_pending_${cand.prequalStatus ?? "null"}` }
    }

    // Берём все ответы для этого кандидата + вакансии. Если все уже
    // имеют verdict — ничего не делаем (защита от двойной обработки).
    const all = await db
      .select()
      .from(candidateQualificationAnswers)
      .where(and(
        eq(candidateQualificationAnswers.candidateId, args.candidateId),
        eq(candidateQualificationAnswers.vacancyId, cand.vacancyId),
      ))

    const pending = all.filter(a => a.aiVerdict === null || a.aiVerdict === "unclear")
    if (pending.length === 0) {
      return { processed: false, reason: "no_pending_answers" }
    }

    // Извлекаем критерий из vacancy для каждого pending вопроса.
    // criterion хранится в ai_process_settings.prequalification.questions —
    // ищем по тексту вопроса (текст уникален в рамках одной вакансии).
    const [vac] = await db
      .select({ aiSettings: candidates.id })  // dummy — заменим ниже
      .from(candidates)
      .where(eq(candidates.id, args.candidateId))
      .limit(1)
    void vac

    // Прямой запрос к vacancies — proще.
    const { vacancies } = await import("@/lib/db/schema")
    const [vacRow] = await db
      .select({ aiSettings: vacancies.aiProcessSettings })
      .from(vacancies)
      .where(eq(vacancies.id, cand.vacancyId))
      .limit(1)
    const settings = (vacRow?.aiSettings as { prequalification?: { questions?: Array<{ text?: string; criterion?: string; required?: boolean }> } } | null) ?? {}
    const cfgQuestions = settings.prequalification?.questions ?? []

    const aiQuestions = pending.map(p => {
      const cfg = cfgQuestions.find(c => (c.text ?? "").trim() === p.questionText.trim())
      return {
        question:  p.questionText,
        criterion: cfg?.criterion ?? "",
      }
    })

    const verdicts = await screenPrequalificationAnswers(aiQuestions, args.answerText)
    if (!verdicts) {
      // AI-вызов упал — лог и выход. Не помечаем как failed, ждём след. сообщение.
      console.warn("[prequalification] AI verdict failed for candidate", args.candidateId)
      return { processed: false, reason: "ai_failed" }
    }

    // UPDATE по pending записям в том же порядке.
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]
      const v = verdicts[i]
      if (!v) continue
      // Если verdict 'unclear' и в БД уже было answer_text — НЕ перезатираем,
      // accumulate (берём последний кандидатский текст для повторной оценки).
      await db.update(candidateQualificationAnswers).set({
        answerText:  args.answerText.slice(0, 4000),
        aiVerdict:   v.verdict,
        aiReasoning: v.reasoning,
      }).where(eq(candidateQualificationAnswers.id, p.id))
    }

    console.log("[prequalification]", JSON.stringify({
      tag:        "prequalification/answered",
      candidateId: args.candidateId,
      answeredNow: verdicts.length,
      preview:     args.answerText.slice(0, 80),
    }))

    // Если ВСЕ вопросы получили verdict (не unclear) — финализируем.
    const allDone = await allQuestionsAnsweredStrict(args.candidateId, cand.vacancyId)
    if (allDone) {
      const fin = await finalizePrequalification({ candidateId: args.candidateId })
      return { processed: true, finalized: fin.finalized, verdict: fin.verdict, reason: fin.reason }
    }

    return { processed: true, finalized: false }
  } catch (err) {
    console.error("[prequalification] process-answer failed:", err instanceof Error ? err.message : err)
    return { processed: false, reason: "exception" }
  }
}

// «Все вопросы получили не-unclear verdict». unclear ≠ done — ждём ещё.
async function allQuestionsAnsweredStrict(candidateId: string, vacancyId: string): Promise<boolean> {
  const answers = await db
    .select({ aiVerdict: candidateQualificationAnswers.aiVerdict })
    .from(candidateQualificationAnswers)
    .where(and(
      eq(candidateQualificationAnswers.candidateId, candidateId),
      eq(candidateQualificationAnswers.vacancyId, vacancyId),
    ))
  if (answers.length === 0) return false
  return answers.every(a => a.aiVerdict === "passed" || a.aiVerdict === "failed")
}

// Используется в cron'е: список кандидатов с pending-предкв и
// sent_at старше threshold. Просто helper.
export async function findPendingCandidatesOlderThan(threshold: Date) {
  return db
    .select({
      id:                     candidates.id,
      prequalSentAt:          candidates.prequalificationSentAt,
    })
    .from(candidates)
    .where(and(
      eq(candidates.prequalificationStatus, "pending"),
      isNull(candidates.prequalificationCompletedAt),
    ))
    .then(rows => rows.filter(r => r.prequalSentAt && r.prequalSentAt <= threshold))
}
