/**
 * «2-я часть демо» (Путь менеджера) после прохождения анкеты.
 *
 * Когда кандидат отвечает на task-вопросы демо (answer-route), мы считаем
 * ДЕТЕРМИНИРОВАННЫЙ балл по вопросам-выбора (lib/demo/objective-gate). Если в
 * Портрете включён spec.anketaPassInvite и балл >= passThreshold — выставляем
 * кандидату override-блок «Путь менеджера» (его покажет /demo/[token]) и ставим
 * в очередь follow_up_messages приглашение (branch='second_demo_invite').
 * Cron /api/cron/follow-up подберёт и отправит через hh-чат с {{demo_link}},
 * указывающим уже на 2-ю часть.
 *
 * OFF by default: при anketaPassInvite.enabled !== true ничего не делает.
 * Дедуп: один кандидат не получит приглашение дважды (override уже стоит ИЛИ
 * есть pending/sent касание этой ветки).
 *
 * Паттерн скопирован с lib/messaging/anketa-auto-reply.ts (ensureCampaign +
 * insert в follow_up_messages с respectSchedule).
 */

import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  candidates,
  demos,
  followUpCampaigns,
  followUpMessages,
  vacancies,
} from "@/lib/db/schema"
import { getSpec } from "@/lib/core/spec/store"
import { computeObjectiveGateScore } from "@/lib/demo/objective-gate"
import { adjustToWorkingWindow } from "@/lib/schedule/can-send-now"

const DEFAULT_TEXT =
  "{{name}}, отлично — вы прошли анкету! Приглашаем вас на следующий этап: {{demo_link}}"

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

export async function maybeScheduleSecondDemoInvite(args: {
  candidateId: string
  vacancyId:   string
}): Promise<{ scheduled: boolean; reason?: string; score?: number; scheduledAt?: string }> {
  try {
    // 1. Конфиг из Портрета. Защищаемся от undefined (getSpec не применяет
    //    дефолты схемы — см. инцидент 30.06).
    const spec = await getSpec(args.vacancyId)
    const ap = spec?.anketaPassInvite
    if (!ap || ap.enabled !== true) return { scheduled: false, reason: "disabled" }

    // 2. Дедуп: override уже стоит → кандидат уже приглашён.
    const [cand] = await db
      .select({
        overrideContentBlockId: candidates.overrideContentBlockId,
        secondDemoInvitedAt:    candidates.secondDemoInvitedAt,
      })
      .from(candidates)
      .where(and(eq(candidates.id, args.candidateId), eq(candidates.vacancyId, args.vacancyId)))
      .limit(1)
    if (!cand) return { scheduled: false, reason: "candidate_missing" }
    if (cand.overrideContentBlockId || cand.secondDemoInvitedAt) {
      return { scheduled: false, reason: "already_invited" }
    }

    // 3. Целевой блок «Путь менеджера» обязателен (иначе ссылка вела бы на боевое демо).
    const blockId = ap.contentBlockId
    if (!blockId) return { scheduled: false, reason: "no_content_block" }
    // Блок должен существовать у этой вакансии.
    const [blockRow] = await db
      .select({ id: demos.id })
      .from(demos)
      .where(and(eq(demos.vacancyId, args.vacancyId), eq(demos.id, blockId)))
      .limit(1)
    if (!blockRow) return { scheduled: false, reason: "content_block_not_found" }

    // 4. Детерминированный балл по выбору. Гейт срабатывает только при наличии
    //    оцениваемых вопросов-выбора (иначе null → не шлём).
    const result = await computeObjectiveGateScore(args.candidateId, args.vacancyId)
    if (!result) return { scheduled: false, reason: "no_objective_questions" }
    if (result.score < ap.passThreshold) {
      return { scheduled: false, reason: "below_threshold", score: result.score }
    }

    // 5. Гарантируем кампанию (follow_up_messages.campaign_id NOT NULL).
    const campaignId = await ensureCampaign(args.vacancyId)
    if (!campaignId) return { scheduled: false, reason: "campaign_upsert_failed" }

    // 6. Дедуп по очереди (страховка от гонки параллельных ответов).
    const [existing] = await db
      .select({ id: followUpMessages.id })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, args.candidateId),
        eq(followUpMessages.branch, "second_demo_invite"),
        inArray(followUpMessages.status, ["pending", "sending", "sent"]),
      ))
      .limit(1)
    if (existing) return { scheduled: false, reason: "already_scheduled", score: result.score }

    // 7. Расписание вакансии (сдвигаем отправку в рабочее окно).
    const [vac] = await db
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

    let scheduledAt = new Date(Date.now() + Math.max(0, ap.delaySeconds) * 1000)
    if (vac) {
      const { adjusted } = adjustToWorkingWindow(scheduledAt, {
        scheduleEnabled:            vac.scheduleEnabled,
        scheduleStart:              vac.scheduleStart,
        scheduleEnd:                vac.scheduleEnd,
        scheduleTimezone:           vac.scheduleTimezone,
        scheduleWorkingDays:        vac.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vac.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vac.scheduleCustomHolidays as { from: string; to: string; label: string }[] | null,
      })
      scheduledAt = adjusted
    }

    const messageText = ap.messageText && ap.messageText.trim().length > 0
      ? ap.messageText.trim()
      : DEFAULT_TEXT

    // 8. Выставляем override (ссылка {{demo_link}} теперь ведёт на 2-ю часть) и
    //    ставим приглашение в очередь. Override + invitedAt = дедуп-флаг.
    await db.update(candidates)
      .set({ overrideContentBlockId: blockId, secondDemoInvitedAt: new Date() })
      .where(eq(candidates.id, args.candidateId))

    await db.insert(followUpMessages).values({
      campaignId,
      candidateId: args.candidateId,
      scheduledAt,
      touchNumber: 0,
      channel:     "hh",
      messageText,
      status:      "pending",
      branch:      "second_demo_invite",
    })

    console.log("[second-demo-invite]", JSON.stringify({
      tag:         "second-demo-invite/schedule",
      candidateId: args.candidateId,
      vacancyId:   args.vacancyId,
      score:       result.score,
      threshold:   ap.passThreshold,
      blockId,
      scheduledAt: scheduledAt.toISOString(),
    }))

    return { scheduled: true, score: result.score, scheduledAt: scheduledAt.toISOString() }
  } catch (err) {
    console.error("[second-demo-invite] schedule failed:", err instanceof Error ? err.message : err)
    return { scheduled: false, reason: "exception" }
  }
}
