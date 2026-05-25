// Сессия 9 (6b): отправка вопросов предквалификации кандидату.
//
// Триггер — process-queue.ts при midRangeAction='prequalification' и
// prequalification.enabled=true. Отправляем ОДНО сообщение со всеми
// вопросами в канал откуда пришёл кандидат (на MVP только hh).
// Каждому вопросу — отдельная pending-запись в candidate_qualification_answers.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  candidates,
  vacancies,
  hhResponses,
  candidateQualificationAnswers,
} from "@/lib/db/schema"
import type { VacancyAiProcessSettings, VacancyPrequalificationQuestion } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"

interface StartResult {
  started:  boolean
  reason?:  string
}

function renderQuestionsMessage(args: {
  firstName:    string
  vacancyTitle: string
  questions:    VacancyPrequalificationQuestion[]
}): string {
  const { firstName } = args
  const numbered = args.questions
    .map((q, i) => `${i + 1}. ${q.text.trim()}`)
    .join("\n")
  return `${firstName}, спасибо за отклик на «${args.vacancyTitle}»!

Перед тем как двигаться дальше, пожалуйста ответьте на короткие уточняющие вопросы:

${numbered}

Достаточно одного сообщения с вашими ответами.`
}

async function sendHhMessage(accessToken: string, hhResponseId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.hh.ru/negotiations/${hhResponseId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent":   "Company24.pro/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message: text }).toString(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function startPrequalification(candidateId: string): Promise<StartResult> {
  try {
    // 1. Загружаем кандидата + вакансию + hh-связку.
    const [row] = await db
      .select({
        candId:      candidates.id,
        candName:    candidates.name,
        vacancyId:   candidates.vacancyId,
        vacTitle:    vacancies.title,
        vacCompanyId: vacancies.companyId,
        vacAiSettings: vacancies.aiProcessSettings,
        hhResponseId: hhResponses.hhResponseId,
        currentStatus: candidates.prequalificationStatus,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .leftJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
      .where(eq(candidates.id, candidateId))
      .limit(1)

    if (!row) return { started: false, reason: "candidate_not_found" }
    if (row.currentStatus === "pending") return { started: false, reason: "already_pending" }

    const settings = (row.vacAiSettings as VacancyAiProcessSettings | null) ?? {}
    const pq = settings.prequalification
    if (!pq?.enabled) return { started: false, reason: "prequalification_disabled" }
    const questions = (pq.questions ?? []).filter(q => q.text?.trim().length > 0).slice(0, 3)
    if (questions.length === 0) return { started: false, reason: "no_questions" }

    // 2. Канал отправки — только hh на MVP.
    if (!row.hhResponseId) return { started: false, reason: "no_hh_link" }
    const tokenResult = await getValidToken(row.vacCompanyId)
    if (!tokenResult) return { started: false, reason: "no_hh_token" }

    // 3. Рендерим и отправляем. Имя — централизованным хелпером (hh first_name → fallback).
    const { firstName } = await getCandidateFirstName(candidateId)
    const message = renderQuestionsMessage({
      firstName,
      vacancyTitle: row.vacTitle ?? "",
      questions,
    })
    const sentOk = await sendHhMessage(tokenResult.accessToken, row.hhResponseId, message)
    if (!sentOk) return { started: false, reason: "hh_send_failed" }

    // 4. Создаём pending-записи в candidate_qualification_answers и
    //    обновляем candidate.prequalification_status / sent_at.
    const now = new Date()
    await db.insert(candidateQualificationAnswers).values(
      questions.map(q => ({
        candidateId,
        vacancyId:    row.vacancyId,
        questionText: q.text.trim(),
        isCritical:   Boolean(q.required),
        createdAt:    now,
      })),
    )
    await db.update(candidates).set({
      prequalificationStatus: "pending",
      prequalificationSentAt: now,
      updatedAt:              now,
    }).where(eq(candidates.id, candidateId))

    console.log("[prequalification]", JSON.stringify({
      tag:        "prequalification/started",
      candidateId,
      vacancyId:  row.vacancyId,
      questions:  questions.length,
      critical:   questions.filter(q => q.required).length,
    }))

    return { started: true }
  } catch (err) {
    console.error("[prequalification] start failed:", err instanceof Error ? err.message : err)
    return { started: false, reason: "exception" }
  }
}

// Утилита для cron'а напоминаний: отправить произвольный текст в hh-чат
// кандидата (Д+1 / Д+3 reminder, либо fallback демо). Возвращает true/false.
export async function sendCandidateMessage(candidateId: string, text: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({
        vacancyId:    candidates.vacancyId,
        hhResponseId: hhResponses.hhResponseId,
        vacCompanyId: vacancies.companyId,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .leftJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
      .where(eq(candidates.id, candidateId))
      .limit(1)
    if (!row?.hhResponseId) return false
    const token = await getValidToken(row.vacCompanyId)
    if (!token) return false
    return await sendHhMessage(token.accessToken, row.hhResponseId, text)
  } catch {
    return false
  }
}

// Утилита: вернёт открытые (pending) qualification_answers для кандидата.
// Нужна и для process-answer (узнать какие вопросы ждут ответа), и для
// finalize (подсчёт критичных + статусов).
export async function getCandidateQualificationAnswers(candidateId: string) {
  return db
    .select()
    .from(candidateQualificationAnswers)
    .where(and(
      eq(candidateQualificationAnswers.candidateId, candidateId),
    ))
}
