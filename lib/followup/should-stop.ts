import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, followUpCampaigns } from "@/lib/db/schema"
import { STOP_WORDS, matchStopWord } from "@/lib/followup/stop-words"

export type StopReason =
  | "vacancy_closed"
  | "demo_completed"
  | "candidate_refused"
  | "campaign_disabled"
  | "auto_processing_stopped"

export interface StopResult {
  stop: boolean
  reason?: StopReason
}

// Re-export для обратной совместимости (lib/hh/scan-incoming.ts всё ещё
// импортирует STOP_WORDS отсюда — постепенно переедет на @/lib/followup/stop-words).
export { STOP_WORDS }

export async function shouldStopFollowUp(
  candidateId: string,
  campaignId: string,
): Promise<StopResult> {
  const [campaign] = await db
    .select()
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.id, campaignId))
    .limit(1)

  if (!campaign || !campaign.enabled || campaign.preset === "off") {
    return { stop: true, reason: "campaign_disabled" }
  }

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)

  if (!candidate) return { stop: true, reason: "candidate_refused" }

  if (candidate.autoProcessingStopped || candidate.automationPaused) {
    return { stop: true, reason: "auto_processing_stopped" }
  }

  if (campaign.stopOnVacancyClosed) {
    const [vacancy] = await db
      .select({ status: vacancies.status, deletedAt: vacancies.deletedAt })
      .from(vacancies)
      .where(eq(vacancies.id, candidate.vacancyId))
      .limit(1)
    if (!vacancy || vacancy.status === "closed" || vacancy.status === "archived" || vacancy.deletedAt) {
      return { stop: true, reason: "vacancy_closed" }
    }
  }

  // Демо пройдено до конца — completedAt в demoProgressJson или стадия дальше demo
  const progress = candidate.demoProgressJson as { completedAt?: string | null } | null
  if (progress?.completedAt) return { stop: true, reason: "demo_completed" }
  // Любая стадия после demo_opened считается «продвинулся дальше», дожим больше не нужен.
  // decision, anketa_filled, ai_screening, interview, final_decision, scheduled, interviewed, hired.
  const ADVANCED_STAGES = new Set([
    "decision", "anketa_filled", "ai_screening",
    "interview", "final_decision",
    "scheduled", "interviewed", "hired",
  ])
  if (ADVANCED_STAGES.has(candidate.stage ?? "")) {
    return { stop: true, reason: "demo_completed" }
  }

  // Стоп-слова в anketa_answers.
  //
  // Структура поля шире, чем «массив {question, answer:string}»:
  //   - top-level: jsonb массив ИЛИ объект ИЛИ null;
  //   - каждый элемент массива: {answer, blockId, timeSpent, answeredAt}
  //     ИЛИ голая строка (legacy: дата рождения, ISO timestamp);
  //   - .answer: строка (свободный ответ), объект {viewed:true} (медиа-блок
  //     просмотрен), объект {q-XXX: "текст",...} (мульти-вопрос), массив
  //     строк (мульти-выбор), число, null.
  //
  // Старая логика «answers[last].answer.toLowerCase()» падала с
  // TypeError, когда последний элемент — медиа-блок (.answer — объект),
  // что верно почти для всех заполненных анкет (последний блок — это
  // обычно просмотр финального видео). Поэтому проходим по всем
  // элементам и извлекаем все доступные текстовые значения; matchStopWord
  // защищает от substring false-positive'ов (инцидент 04.05.2026).
  if (campaign.stopOnReply) {
    const answers = candidate.anketaAnswers
    if (Array.isArray(answers)) {
      for (const item of answers) {
        if (!item || typeof item !== "object") continue
        const rawAnswer = (item as { answer?: unknown }).answer
        if (typeof rawAnswer === "string") {
          if (matchStopWord(rawAnswer)) {
            return { stop: true, reason: "candidate_refused" }
          }
        } else if (Array.isArray(rawAnswer)) {
          for (const v of rawAnswer) {
            if (typeof v === "string" && matchStopWord(v)) {
              return { stop: true, reason: "candidate_refused" }
            }
          }
        }
        // {viewed:true}, {q-XXX:...}, числа, null — игнорируем.
        // Внутрь {q-XXX:"текст"} не лезем намеренно: это формальные
        // ответы на вопросы анкеты, кандидат туда отказы не пишет.
      }
    }
  }

  // TODO: AI-классификация ответа на отказ — следующая итерация (MVP только стоп-слова)

  return { stop: false }
}
