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
  const startedAt = Date.now()
  try {
    const campaign = await processCampaignTouches(now)
    const durationMs = Date.now() - startedAt
    // Одна структурированная строка для logrotate/grep'а.
    console.log(JSON.stringify({ tag: "cron/follow-up", ...campaign, durationMs, ts: now.toISOString() }))
    return NextResponse.json({ ok: true, campaign: { ...campaign, durationMs }, ts: now.toISOString() })
  } catch (err) {
    console.error("[cron/follow-up]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── Воронка дожима: обработка касаний follow_up_messages ─────────────────
// Берём до LIMIT pending-касаний (scheduled_at <= NOW()) и шлём их
// последовательно с soft-sleep между отправками. Это снижает риск бана
// со стороны hh при больших пиках (например, при возобновлении вакансии
// с пропущенными касаниями). Цель — интервал ≈ 3600/N секунд между
// отправками в час (см. п.3 задачи Сессии 4), но cap'ы [MIN, MAX] не
// дают cron'у залипнуть в одном run'е дольше RUN_BUDGET_MS.
//
// Для каждого касания: стоп-триггеры → отправка через hh negotiations
// messages → запись sentAt + status. При ошибке — status=failed +
// errorMessage. Skipped (вне окна работы) остаются pending — следующий
// cron в рабочее время подберёт.

const LIMIT          = 200
const MIN_DELAY_MS   = 2_000     // минимальная пауза между отправками
const MAX_DELAY_MS   = 30_000    // больше нет смысла — следующий cron-тик подберёт
const RUN_BUDGET_MS  = 90_000    // мягкий бюджет одного cron-call

type TouchOutcome = "sent" | "cancelled" | "failed" | "skipped"

interface TouchResult {
  outcome: TouchOutcome
  reason?: string
}

async function processCampaignTouches(now: Date) {
  const pending = await db
    .select()
    .from(followUpMessages)
    .where(and(eq(followUpMessages.status, "pending"), lte(followUpMessages.scheduledAt, now)))
    .orderBy(followUpMessages.scheduledAt)
    .limit(LIMIT)

  let touchSent = 0
  let touchCancelled = 0
  let touchFailed = 0
  let touchSkipped = 0
  const reasonBreakdown: Record<string, number> = {}

  // Расчёт интервала: 3600/N сек, но с cap'ами.
  const targetDelayMs = pending.length > 0 ? Math.floor(3_600_000 / pending.length) : MIN_DELAY_MS
  const sendDelayMs   = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, targetDelayMs))

  const runStartedAt = Date.now()
  let bailedEarly = false

  for (let i = 0; i < pending.length; i++) {
    if (Date.now() - runStartedAt > RUN_BUDGET_MS) {
      // Не успеваем за бюджет — остальное подберёт следующий cron-тик.
      bailedEarly = true
      break
    }

    const msg = pending[i]
    const result = await processOneTouch(msg, now)
    if (result.outcome === "sent")      touchSent++
    else if (result.outcome === "cancelled") touchCancelled++
    else if (result.outcome === "failed")    touchFailed++
    else                                     touchSkipped++

    if (result.reason) {
      reasonBreakdown[result.reason] = (reasonBreakdown[result.reason] ?? 0) + 1
    }

    if (i < pending.length - 1) {
      await new Promise(r => setTimeout(r, sendDelayMs))
    }
  }

  return {
    processed:  pending.length,
    sent:       touchSent,
    cancelled:  touchCancelled,
    failed:     touchFailed,
    skipped:    touchSkipped,
    sendDelayMs,
    bailedEarly,
    reasons:    reasonBreakdown,
  }
}

async function processOneTouch(
  msg: typeof followUpMessages.$inferSelect,
  now: Date,
): Promise<TouchResult> {
  // Сессия 7: для branch='anketa_confirmation' пропускаем стоп-триггеры.
  // shouldStopFollowUp среагировал бы на stage='anketa_filled' (демо
  // пройдено) и отменил бы подтверждение — но именно эти кандидаты и
  // должны его получить. Это «not a follow-up», а одиночное сообщение.
  if (msg.branch !== "anketa_confirmation") {
    // Стоп-триггеры (вакансия закрыта / демо пройдено / отказ /
    // автоматизация остановлена) — только для обычной цепочки дожима.
    const stopResult = await shouldStopFollowUp(msg.candidateId, msg.campaignId)
    if (stopResult.stop) {
      const reason = stopResult.reason ?? "stopped"
      await db.update(followUpMessages).set({
        status: "cancelled",
        errorMessage: reason,
      }).where(eq(followUpMessages.id, msg.id))
      return { outcome: "cancelled", reason }
    }
  }

  // Ищем привязанный hh-отклик и токен компании
  const [campaign] = await db
    .select({ vacancyId: followUpCampaigns.vacancyId })
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.id, msg.campaignId))
    .limit(1)
  if (!campaign) {
    await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "campaign_missing" }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "cancelled", reason: "campaign_missing" }
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
    return { outcome: "cancelled", reason: "vacancy_missing" }
  }

  // Проверка расписания: если сейчас вне окна — оставляем pending,
  // следующий cron в рабочее время подберёт. НЕ помечаем как failed.
  const check = canSendNow(vacancy, now)
  if (!check.allowed) {
    return { outcome: "skipped", reason: check.reason ?? "off_hours" }
  }

  const [hhResp] = await db
    .select({ hhResponseId: hhResponses.hhResponseId })
    .from(hhResponses)
    .where(eq(hhResponses.localCandidateId, msg.candidateId))
    .limit(1)
  if (!hhResp) {
    await db.update(followUpMessages).set({ status: "failed", errorMessage: "no_hh_response_link" }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "failed", reason: "no_hh_response_link" }
  }

  const tokenResult = await getValidToken(vacancy.companyId)
  if (!tokenResult) {
    await db.update(followUpMessages).set({ status: "failed", errorMessage: "no_hh_token" }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "failed", reason: "no_hh_token" }
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
      const reason  = `hh_${res.status}`
      await db.update(followUpMessages).set({
        status: "failed",
        errorMessage: `${reason}: ${errText.slice(0, 200)}`,
      }).where(eq(followUpMessages.id, msg.id))
      return { outcome: "failed", reason }
    }
    await db.update(followUpMessages).set({
      status: "sent",
      sentAt: new Date(),
    }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "sent" }
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "unknown"
    await db.update(followUpMessages).set({
      status: "failed",
      errorMessage: reason,
    }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "failed", reason: "exception" }
  }
}
