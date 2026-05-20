// Сессия 7: планирование авто-сообщения «подтверждение после анкеты».
//
// Когда кандидат отправляет финальную анкету, apply-route вызывает этот
// helper. Если у вакансии включён блок anketaConfirmation, создаём
// follow_up_messages запись с branch='anketa_confirmation' и scheduled_at
// = now + delayMinutes. Cron /api/cron/follow-up подберёт и отправит через
// hh-чат (cron уже умеет рендерить плейсхолдеры и вызывать hh API).
//
// Канал: только hh-чат (по плану п.9). Email-канал в бэклоге.
// Если у кандидата нет hh-связки — запись всё равно создаётся, но cron
// её failednет с reason="no_hh_response_link" (известное поведение).
// Это даст HR видимость «попытка была, не вышло» в логах.

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { followUpCampaigns, followUpMessages, vacancies } from "@/lib/db/schema"

const DEFAULT_DELAY_MINUTES = 3
const DEFAULT_MESSAGE_TEXT =
  "{Имя}, спасибо! Мы получили ваши данные и ответы. В ближайшие дни рассмотрим кандидатуру и свяжемся. Хорошего дня!"

interface AnketaConfirmationConfig {
  enabled?:      boolean
  delayMinutes?: number
  messageText?:  string
}

// Гарантирует наличие follow_up_campaigns строки для вакансии — нужно
// потому что follow_up_messages.campaign_id NOT NULL ссылается на неё.
// Если строки нет — создаём с preset='off', enabled=false (чтобы не
// триггерить параллельно цепочку дожима).
async function ensureCampaign(vacancyId: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.vacancyId, vacancyId))
    .limit(1)
  if (existing) return existing.id
  const [created] = await db
    .insert(followUpCampaigns)
    .values({
      vacancyId,
      preset:              "off",
      enabled:             false,
      stopOnReply:         true,
      stopOnVacancyClosed: true,
    })
    .returning({ id: followUpCampaigns.id })
  return created?.id ?? null
}

export async function scheduleAnketaConfirmation(args: {
  candidateId: string
  vacancyId:   string
}): Promise<{ scheduled: boolean; reason?: string }> {
  try {
    // 1. Читаем конфиг из vacancy.descriptionJson.automation.anketaConfirmation.
    const [vac] = await db
      .select({ descriptionJson: vacancies.descriptionJson, title: vacancies.title })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)
    if (!vac) return { scheduled: false, reason: "vacancy_not_found" }

    const automation = (vac.descriptionJson as { automation?: Record<string, unknown> } | null)?.automation
    const cfg = (automation?.["anketaConfirmation"] as AnketaConfirmationConfig | undefined) ?? {}
    if (cfg.enabled === false) {
      return { scheduled: false, reason: "disabled" }
    }

    const delayMinutes = typeof cfg.delayMinutes === "number" && cfg.delayMinutes > 0
      ? Math.min(60, Math.round(cfg.delayMinutes))
      : DEFAULT_DELAY_MINUTES
    const messageText = typeof cfg.messageText === "string" && cfg.messageText.trim().length > 0
      ? cfg.messageText
      : DEFAULT_MESSAGE_TEXT

    // 2. Дедупликация: если уже есть pending anketa_confirmation
    //    для этого кандидата — не плодим дубликаты.
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, "anketa_confirmation"),
        eq(followUpMessages.status, "pending"),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled" }

    // 3. Гарантируем кампанию.
    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // 4. Создаём запись touch'а. scheduled_at = now + delayMinutes.
    //    chain_d0 / chain_d0_source оставляем NULL — это не цепочка дожима.
    const scheduledAt = new Date(Date.now() + delayMinutes * 60_000)
    await db.insert(followUpMessages).values({
      campaignId,
      candidateId:  args.candidateId,
      scheduledAt,
      touchNumber:  0,
      channel:      "hh",
      messageText,
      status:       "pending",
      branch:       "anketa_confirmation",
    })

    console.log("[anketa-confirmation]", JSON.stringify({
      tag:         "anketa-confirmation/schedule",
      candidateId: args.candidateId,
      vacancyId:   args.vacancyId,
      scheduledAt: scheduledAt.toISOString(),
      delayMinutes,
    }))

    return { scheduled: true }
  } catch (err) {
    console.error("[anketa-confirmation] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
