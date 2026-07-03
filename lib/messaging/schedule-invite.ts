// Задача #3.1 — авто-отправка ссылки /schedule/[token] кандидату.
//
// Когда кандидат доходит до этапа интервью/назначения (stage = interview /
// scheduled), отправляем ему персональную ссылку на страницу выбора времени.
//
// Канал: hh-чат через очередь follow_up_messages (branch='schedule_invite'),
// как и остальные одиночные сообщения (anketa_confirmation / test_invite).
// Cron /api/cron/follow-up подберёт запись, отрендерит {{schedule_link}} в
// персональную ссылку и отправит в рабочее окно. Стоп-триггеры для этой ветки
// пропускаются (см. isOneOffPostAnketa в cron follow-up).
//
// Если у кандидата нет hh-связки — запись всё равно создаётся, но cron её
// failed'нет с reason="no_hh_response_link" (известное поведение, видимость в логах).
//
// Идемпотентность: повторный вызов не плодит дублей — проверяем pending|sent
// schedule_invite по candidateId.

import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { followUpCampaigns, followUpMessages, vacancies } from "@/lib/db/schema"

export const SCHEDULE_INVITE_BRANCH = "schedule_invite"

const DEFAULT_DELAY_MINUTES = 1
export const DEFAULT_SCHEDULE_INVITE_TEXT =
  "{{name}}, рады пригласить вас на интервью по вакансии «{{vacancy}}»!\n" +
  "Выберите удобное время: {{schedule_link}}\n" +
  "До встречи!"

// Гарантирует наличие follow_up_campaigns строки для вакансии — нужно потому,
// что follow_up_messages.campaign_id NOT NULL ссылается на неё.
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

export interface ScheduleInviteResult {
  scheduled: boolean
  reason?: string
}

/**
 * Ставит в очередь приглашение записаться на интервью (ссылка /schedule/[token]).
 * @param messageText — кастомный текст с плейсхолдером {{schedule_link}};
 *        если не задан — DEFAULT_SCHEDULE_INVITE_TEXT.
 */
export async function scheduleInterviewInvite(args: {
  candidateId: string
  vacancyId:   string
  messageText?: string
}): Promise<ScheduleInviteResult> {
  try {
    // 1. Проверяем, что вакансия существует, и заодно читаем настроенный HR-ом
    //    текст приглашения на интервью (vacancies.schedule_invite_text).
    const [vac] = await db
      .select({ id: vacancies.id, scheduleInviteText: vacancies.scheduleInviteText })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)
    if (!vac) return { scheduled: false, reason: "vacancy_not_found" }

    // 2. Дедуп: уже есть pending|sent schedule_invite для этого кандидата.
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, SCHEDULE_INVITE_BRANCH),
        inArray(followUpMessages.status, ["pending", "sent"]),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled" }

    // 3. Кампания (FK).
    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // 4. Создаём запись касания. scheduled_at = now + delay.
    //    Приоритет текста: явный override (messageText, разовое переопределение
    //    из карточки кандидата) > настроенный per-вакансия текст
    //    (vacancies.schedule_invite_text) > дефолт DEFAULT_SCHEDULE_INVITE_TEXT.
    const configuredText =
      typeof vac.scheduleInviteText === "string" && vac.scheduleInviteText.trim().length > 0
        ? vac.scheduleInviteText.trim()
        : DEFAULT_SCHEDULE_INVITE_TEXT
    const text = args.messageText && args.messageText.trim().length > 0
      ? args.messageText.trim()
      : configuredText
    const scheduledAt = new Date(Date.now() + DEFAULT_DELAY_MINUTES * 60_000)

    await db.insert(followUpMessages).values({
      campaignId,
      candidateId: args.candidateId,
      scheduledAt,
      touchNumber: 0,
      channel:     "hh",
      messageText: text,
      status:      "pending",
      branch:      SCHEDULE_INVITE_BRANCH,
    })

    console.log("[schedule-invite]", JSON.stringify({
      tag:         "schedule-invite/schedule",
      candidateId: args.candidateId,
      vacancyId:   args.vacancyId,
      scheduledAt: scheduledAt.toISOString(),
    }))

    return { scheduled: true }
  } catch (err) {
    console.error("[schedule-invite] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
