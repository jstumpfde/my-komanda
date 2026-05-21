// ТЗ-3 Ч.1: планирование автоответа после заполнения финальной анкеты.
//
// Когда кандидат переходит в стадию `anketa_filled`, apply-route вызывает
// этот helper. Если у вакансии включён `anketaAutoReply` в
// demos.post_demo_settings — создаём follow_up_messages запись с
// branch='anketa_auto_reply' и scheduled_at = now + delayMinutes (с учётом
// рабочего расписания вакансии, если respectSchedule=true). Cron
// /api/cron/follow-up подберёт и отправит через hh-чат.
//
// Отличие от lib/messaging/anketa-confirmation.ts:
//   - конфиг в demos.post_demo_settings.anketaAutoReply (не в descriptionJson)
//   - дефолтная задержка 60 минут (не 3)
//   - дефолтный текст про тестовое задание
//   - может содержать опциональную ссылку testTaskUrl, дописывается в конец
//   - может корректироваться под рабочее окно вакансии
//
// Один и тот же кандидат не получит автоответ дважды — дедупликация по
// (candidate_id, branch='anketa_auto_reply', status='pending|sent').

import { eq, and, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  demos,
  followUpCampaigns,
  followUpMessages,
  vacancies,
  type AnketaAutoReplySettings,
  type PostDemoSettings,
} from "@/lib/db/schema"
import { adjustToWorkingWindow } from "@/lib/schedule/can-send-now"

const ALLOWED_DELAYS = new Set<number>([5, 15, 30, 60, 240, 1440])
const DEFAULT_DELAY_MINUTES = 60
const DEFAULT_TEXT =
  "{{name}}, рассмотрели вашу анкету. Ваша кандидатура нам интересна. Предлагаем тестовое задание."

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

function buildMessageText(cfg: AnketaAutoReplySettings): string {
  const base = (cfg.text && cfg.text.trim().length > 0) ? cfg.text.trim() : DEFAULT_TEXT
  const url = (cfg.testTaskUrl && cfg.testTaskUrl.trim().length > 0) ? cfg.testTaskUrl.trim() : null
  return url ? `${base}\n\n${url}` : base
}

export async function scheduleAnketaAutoReply(args: {
  candidateId: string
  vacancyId:   string
}): Promise<{ scheduled: boolean; reason?: string; scheduledAt?: string }> {
  try {
    // 1. Читаем настройки последнего demo и параметры расписания вакансии.
    const [row] = await db
      .select({
        postDemoSettings:           demos.postDemoSettings,
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })
      .from(demos)
      .innerJoin(vacancies, eq(demos.vacancyId, vacancies.id))
      .where(eq(demos.vacancyId, args.vacancyId))
      .orderBy(sql`${demos.updatedAt} DESC`)
      .limit(1)

    if (!row) return { scheduled: false, reason: "demo_not_found" }

    const settings = (row.postDemoSettings as PostDemoSettings | null) ?? {}
    const cfg = settings.anketaAutoReply
    if (!cfg || cfg.enabled !== true) {
      return { scheduled: false, reason: "disabled" }
    }

    const delayMinutes = typeof cfg.delayMinutes === "number" && ALLOWED_DELAYS.has(cfg.delayMinutes)
      ? cfg.delayMinutes
      : DEFAULT_DELAY_MINUTES

    // 2. Дедупликация: не плодим если уже есть pending или sent для этого
    //    кандидата. Если HR пересохранил настройки — повторно слать не будем.
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, "anketa_auto_reply"),
        inArray(followUpMessages.status, ["pending", "sent"]),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled" }

    // 3. Гарантируем кампанию (follow_up_messages.campaign_id NOT NULL).
    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // 4. Считаем scheduled_at. База: now + delay. Если respectSchedule —
    //    сдвигаем вперёд до ближайшего рабочего слота в окне вакансии.
    let scheduledAt = new Date(Date.now() + delayMinutes * 60_000)
    if (cfg.respectSchedule !== false) {
      const { adjusted } = adjustToWorkingWindow(scheduledAt, {
        scheduleEnabled:            row.scheduleEnabled,
        scheduleStart:              row.scheduleStart,
        scheduleEnd:                row.scheduleEnd,
        scheduleTimezone:           row.scheduleTimezone,
        scheduleWorkingDays:        row.scheduleWorkingDays,
        scheduleExcludedHolidayIds: row.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     row.scheduleCustomHolidays as { from: string; to: string; label: string }[] | null,
      })
      scheduledAt = adjusted
    }

    const messageText = buildMessageText(cfg)

    await db.insert(followUpMessages).values({
      campaignId,
      candidateId:  args.candidateId,
      scheduledAt,
      touchNumber:  0,
      channel:      "hh",
      messageText,
      status:       "pending",
      branch:       "anketa_auto_reply",
    })

    console.log("[anketa-auto-reply]", JSON.stringify({
      tag:             "anketa-auto-reply/schedule",
      candidateId:     args.candidateId,
      vacancyId:       args.vacancyId,
      scheduledAt:     scheduledAt.toISOString(),
      delayMinutes,
      respectSchedule: cfg.respectSchedule !== false,
      hasTestTaskUrl:  !!cfg.testTaskUrl,
    }))

    return { scheduled: true, scheduledAt: scheduledAt.toISOString() }
  } catch (err) {
    console.error("[anketa-auto-reply] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
