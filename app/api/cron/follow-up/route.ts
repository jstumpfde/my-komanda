import { NextRequest, NextResponse } from "next/server"
import { eq, and, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, followUpMessages, followUpCampaigns, hhResponses } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { shouldStopFollowUp } from "@/lib/followup/should-stop"
import { canSendNow } from "@/lib/schedule/can-send-now"
import { checkCronAuth } from "@/lib/cron/auth"

// POST /api/cron/follow-up
// Отправляет очередную порцию касаний из follow_up_messages кандидатам
// в hh-чат. Protected by X-Cron-Secret header.
//
// Старый email-блок (48-часовое напоминание через sendMail) удалён —
// теперь дожим идёт только через цепочку касаний follow_up_messages.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = new Date()
  try {
    const campaign = await processCampaignTouches(now)
    return NextResponse.json({ ok: true, campaign, ts: now.toISOString() })
  } catch (err) {
    console.error("[cron/follow-up]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── Воронка дожима: обработка касаний follow_up_messages ─────────────────
// Берём до 50 pending-касаний, у которых scheduled_at <= NOW().
// Для каждого: проверяем стоп-триггеры → отправляем через hh negotiations
// messages → пишем sentAt + status. При ошибке — status=failed + errorMessage.

async function processCampaignTouches(now: Date) {
  const pending = await db
    .select()
    .from(followUpMessages)
    .where(and(eq(followUpMessages.status, "pending"), lte(followUpMessages.scheduledAt, now)))
    .limit(50)

  let touchSent = 0
  let touchCancelled = 0
  let touchFailed = 0

  for (const msg of pending) {
    // Стоп-триггеры (вакансия закрыта / демо пройдено / отказ / автоматизация остановлена)
    const stopResult = await shouldStopFollowUp(msg.candidateId, msg.campaignId)
    if (stopResult.stop) {
      await db.update(followUpMessages).set({
        status: "cancelled",
        errorMessage: stopResult.reason ?? "stopped",
      }).where(eq(followUpMessages.id, msg.id))
      touchCancelled++
      continue
    }

    // Ищем привязанный hh-отклик и токен компании
    const [campaign] = await db
      .select({ vacancyId: followUpCampaigns.vacancyId })
      .from(followUpCampaigns)
      .where(eq(followUpCampaigns.id, msg.campaignId))
      .limit(1)
    if (!campaign) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "campaign_missing" }).where(eq(followUpMessages.id, msg.id))
      touchCancelled++
      continue
    }

    const [vacancy] = await db
      .select({
        companyId:                  vacancies.companyId,
        title:                      vacancies.title,
        scheduleEnabled:            vacancies.scheduleEnabled,
        scheduleStart:              vacancies.scheduleStart,
        scheduleEnd:                vacancies.scheduleEnd,
        scheduleTimezone:           vacancies.scheduleTimezone,
        scheduleWorkingDays:        vacancies.scheduleWorkingDays,
        scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
        scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      })
      .from(vacancies)
      .where(eq(vacancies.id, campaign.vacancyId))
      .limit(1)
    if (!vacancy) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "vacancy_missing" }).where(eq(followUpMessages.id, msg.id))
      touchCancelled++
      continue
    }

    // Проверка расписания: если сейчас вне окна — оставляем pending,
    // следующий cron в рабочее время подберёт. НЕ помечаем как failed.
    if (!canSendNow(vacancy, now).allowed) {
      continue
    }

    const [hhResp] = await db
      .select({ hhResponseId: hhResponses.hhResponseId })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, msg.candidateId))
      .limit(1)
    if (!hhResp) {
      await db.update(followUpMessages).set({ status: "failed", errorMessage: "no_hh_response_link" }).where(eq(followUpMessages.id, msg.id))
      touchFailed++
      continue
    }

    const tokenResult = await getValidToken(vacancy.companyId)
    if (!tokenResult) {
      await db.update(followUpMessages).set({ status: "failed", errorMessage: "no_hh_token" }).where(eq(followUpMessages.id, msg.id))
      touchFailed++
      continue
    }

    // Подставляем переменные в текст касания (имя из кандидата, должность, ссылка)
    const [cand] = await db
      .select({ name: candidates.name, shortId: candidates.shortId, token: candidates.token })
      .from(candidates)
      .where(eq(candidates.id, msg.candidateId))
      .limit(1)
    const firstName = (cand?.name ?? "").trim().split(/\s+/)[0] || "Здравствуйте"
    const tokenForUrl = cand?.shortId ?? cand?.token ?? msg.candidateId
    const demoUrl = `https://company24.pro/demo/${tokenForUrl}`
    const finalText = msg.messageText
      .replaceAll("{Имя}", firstName).replaceAll("{имя}", firstName)
      .replaceAll("[Имя]", firstName).replaceAll("[имя]", firstName)
      .replaceAll("{должность}", vacancy.title || "").replaceAll("[должность]", vacancy.title || "")
      .replaceAll("{компания}", "Company24").replaceAll("[компания]", "Company24")
      .replaceAll("{ссылка}", demoUrl).replaceAll("[ссылка]", demoUrl)

    try {
      const form = new URLSearchParams()
      form.set("message", finalText)
      const res = await fetch(`https://api.hh.ru/negotiations/${hhResp.hhResponseId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "User-Agent": "Company24.pro/1.0",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      })
      if (!res.ok) {
        const errText = await res.text()
        await db.update(followUpMessages).set({
          status: "failed",
          errorMessage: `hh_${res.status}: ${errText.slice(0, 200)}`,
        }).where(eq(followUpMessages.id, msg.id))
        touchFailed++
        continue
      }
      await db.update(followUpMessages).set({
        status: "sent",
        sentAt: new Date(),
      }).where(eq(followUpMessages.id, msg.id))
      touchSent++
    } catch (err) {
      await db.update(followUpMessages).set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      }).where(eq(followUpMessages.id, msg.id))
      touchFailed++
    }
  }

  return { processed: pending.length, sent: touchSent, cancelled: touchCancelled, failed: touchFailed }
}
