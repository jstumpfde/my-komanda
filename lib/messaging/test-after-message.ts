// Этап 2: одиночное «сообщение после теста» (postDemoSettings.testAfterMessage).
//
// Планируется в follow_up_messages с branch='test_after_message' и
// scheduled_at = now (с учётом рабочего окна вакансии). Cron /api/cron/follow-up
// подбирает и шлёт через hh-чат; renderTemplate подставляет {{name}}/{{vacancy}}
// на момент отправки (текст здесь храним «сырым», с плейсхолдерами).
//
// Когда вызывается:
//   - auto-режим: из submit-route сразу после успешной проверки (score >= passing)
//   - assisted-режим: из verdict-эндпоинта по кнопке «Принять» (НЕ при submit —
//     ждём решения HR; отдельной колонки waitingForHrApproval в БД нет)
//
// Аналог lib/messaging/anketa-auto-reply.ts (одиночный touch, не цепочка дожима).
// Дедуп по (candidate_id, branch='test_after_message', status='pending|sent').
//
// ОГРАНИЧЕНИЕ (как у всех follow_up): если у вакансии включён AI-чат-бот,
// cron отменит это сообщение (branch не в исключениях aiChatbotEnabled) — диалог
// в таком случае ведёт бот.

import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  followUpCampaigns,
  followUpMessages,
  vacancies,
} from "@/lib/db/schema"
import { adjustToWorkingWindow } from "@/lib/schedule/can-send-now"

export const TEST_AFTER_MESSAGE_BRANCH = "test_after_message"

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

export async function scheduleTestAfterMessage(args: {
  candidateId: string
  vacancyId:   string
  messageText: string   // «сырой» текст с плейсхолдерами {{name}} / {{vacancy}}
}): Promise<{ scheduled: boolean; reason?: string; scheduledAt?: string }> {
  try {
    const text = (args.messageText ?? "").trim()
    if (text.length === 0) return { scheduled: false, reason: "empty" }

    // Дедуп: не плодим если уже есть pending/sent для этого кандидата.
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, TEST_AFTER_MESSAGE_BRANCH),
        inArray(followUpMessages.status, ["pending", "sent"]),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled" }

    // Параметры рабочего расписания вакансии (для сдвига в рабочее окно).
    const [row] = await db
      .select({
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })
      .from(vacancies)
      .where(eq(vacancies.id, args.vacancyId))
      .limit(1)
    if (!row) return { scheduled: false, reason: "vacancy_not_found" }

    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // Шлём как можно раньше: scheduled_at = now, сдвинутый в рабочее окно.
    const { adjusted } = adjustToWorkingWindow(new Date(), {
      scheduleEnabled:            row.scheduleEnabled,
      scheduleStart:              row.scheduleStart,
      scheduleEnd:                row.scheduleEnd,
      scheduleTimezone:           row.scheduleTimezone,
      scheduleWorkingDays:        row.scheduleWorkingDays,
      scheduleExcludedHolidayIds: row.scheduleExcludedHolidayIds,
      scheduleCustomHolidays:     row.scheduleCustomHolidays as { from: string; to: string; label: string }[] | null,
    })

    await db.insert(followUpMessages).values({
      campaignId,
      candidateId: args.candidateId,
      scheduledAt: adjusted,
      touchNumber: 0,
      channel:     "hh",
      messageText: text,
      status:      "pending",
      branch:      TEST_AFTER_MESSAGE_BRANCH,
    })

    console.log("[test-after-message]", JSON.stringify({
      tag:         "test-after-message/schedule",
      candidateId: args.candidateId,
      vacancyId:   args.vacancyId,
      scheduledAt: adjusted.toISOString(),
    }))

    return { scheduled: true, scheduledAt: adjusted.toISOString() }
  } catch (err) {
    console.error("[test-after-message] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
