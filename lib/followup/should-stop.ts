import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, followUpCampaigns } from "@/lib/db/schema"

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

const STOP_WORDS = [
  "нет", "неинтересно", "не интересно", "не нужно", "не хочу", "не подходит",
  "отказ", "остановит", "прекрат", "спасибо нет", "уже работаю", "нашел работу",
  "нашла работу", "не актуально",
]

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
  if (["scheduled", "interviewed", "hired"].includes(candidate.stage ?? "")) {
    return { stop: true, reason: "demo_completed" }
  }

  // Стоп-слова в последнем ответе кандидата (anketaAnswers — последний свободный ответ)
  if (campaign.stopOnReply) {
    const answers = candidate.anketaAnswers as Array<{ answer?: string }> | null
    const lastAnswer = answers?.[answers.length - 1]?.answer ?? ""
    const lower = lastAnswer.toLowerCase()
    if (STOP_WORDS.some(w => lower.includes(w))) {
      return { stop: true, reason: "candidate_refused" }
    }
  }

  // TODO: AI-классификация ответа на отказ — следующая итерация (MVP только стоп-слова)

  return { stop: false }
}
