import { NextRequest, NextResponse } from "next/server"
import { eq, and, lte, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, followUpMessages, followUpCampaigns, hhResponses, companies } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { shouldStopFollowUp } from "@/lib/followup/should-stop"
import { canSendNow } from "@/lib/schedule/can-send-now"
import { checkCronAuth } from "@/lib/cron/auth"
import { renderTemplate } from "@/lib/template-renderer"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"

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
const RUN_BUDGET_MS  = 90_000    // мягкий бюджет одного cron-call

// Задержка между отправками — per-company (companies.follow_up_send_delay_seconds).
// Дефолт и нижняя граница дублируют API (app/api/modules/hr/company/send-delay):
// если в БД null или меньше минимума — берём дефолт 31 сек.
const DEFAULT_SEND_DELAY_SECONDS = 31
const MIN_SEND_DELAY_SECONDS     = 21

// 00:00 сегодняшнего дня по Москве (UTC+3, фиксированный — РФ без DST с 2014)
// как UTC-инстант. Используется для rate-limit «1 дожим в день кандидату».
function startOfTodayMsk(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00"
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+03:00`)
}

type TouchOutcome = "sent" | "cancelled" | "failed" | "skipped"

interface TouchResult {
  outcome: TouchOutcome
  reason?: string
  // Задержка компании-отправителя (мс), которую нужно выждать перед следующей
  // отправкой. Задаётся только когда реально дошли до отправки в hh
  // (sent / hh-ошибка / исключение) — иначе спать незачем.
  delayMs?: number
}

// Резолвер per-company задержки с кэшем на один cron-run (одна и та же
// компания встречается в очереди многократно — не дёргаем БД каждый раз).
async function resolveCompanyDelayMs(
  companyId: string,
  cache: Map<string, number>,
): Promise<number> {
  const cached = cache.get(companyId)
  if (cached !== undefined) return cached
  const [row] = await db
    .select({ seconds: companies.followUpSendDelaySeconds })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  const secs = row?.seconds
  const safeSeconds =
    typeof secs === "number" && secs >= MIN_SEND_DELAY_SECONDS ? secs : DEFAULT_SEND_DELAY_SECONDS
  const ms = safeSeconds * 1000
  cache.set(companyId, ms)
  return ms
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

  // Кэш per-company задержек на этот run.
  const delayCache = new Map<string, number>()

  const runStartedAt = Date.now()
  let bailedEarly = false
  let lastDelayMs = 0   // для логов: последняя применённая задержка

  for (let i = 0; i < pending.length; i++) {
    if (Date.now() - runStartedAt > RUN_BUDGET_MS) {
      // Не успеваем за бюджет — остальное подберёт следующий cron-тик.
      bailedEarly = true
      break
    }

    const msg = pending[i]
    const result = await processOneTouch(msg, now, delayCache)
    if (result.outcome === "sent")      touchSent++
    else if (result.outcome === "cancelled") touchCancelled++
    else if (result.outcome === "failed")    touchFailed++
    else                                     touchSkipped++

    if (result.reason) {
      reasonBreakdown[result.reason] = (reasonBreakdown[result.reason] ?? 0) + 1
    }

    // Спим ТОЛЬКО после реальной отправки в hh (result.delayMs задан). Отмены,
    // skip'ы и pre-send ошибки не трогают hh-аккаунт — задержка им не нужна.
    if (result.delayMs && i < pending.length - 1) {
      lastDelayMs = result.delayMs
      const remaining = RUN_BUDGET_MS - (Date.now() - runStartedAt)
      // Если полная задержка не влезает в остаток бюджета — НЕ отправляем
      // следующее сообщение раньше времени, а выходим: остаток подберёт
      // следующий cron-тик. Так задержка между отправками всегда >= настройки
      // компании и cron-call не зависает на минуты при больших значениях.
      if (result.delayMs >= remaining) {
        bailedEarly = true
        break
      }
      await new Promise(r => setTimeout(r, result.delayMs))
    }
  }

  return {
    processed:  pending.length,
    sent:       touchSent,
    cancelled:  touchCancelled,
    failed:     touchFailed,
    skipped:    touchSkipped,
    lastDelayMs,
    bailedEarly,
    reasons:    reasonBreakdown,
  }
}

async function processOneTouch(
  msg: typeof followUpMessages.$inferSelect,
  now: Date,
  delayCache: Map<string, number>,
): Promise<TouchResult> {
  // Сессия 7: для branch='anketa_confirmation' пропускаем стоп-триггеры.
  // shouldStopFollowUp среагировал бы на stage='anketa_filled' (демо
  // пройдено) и отменил бы подтверждение — но именно эти кандидаты и
  // должны его получить. Это «not a follow-up», а одиночное сообщение.
  //
  // ТЗ-3 Ч.1: то же исключение для branch='anketa_auto_reply' (автоответ
  // с предложением тестового задания) — отправляем именно тем, кто только
  // что попал в anketa_filled.
  //
  // #21: branch='first_msg_2'/'first_msg_3' — Сообщения 2 и 3 серии
  // первых сообщений. Стоп-триггеры пропускаем (это не дожим), но
  // дополнительно проверяем что демо ещё не открыто — иначе
  // дальнейшие приветственные сообщения теряют смысл.
  const isChainStep = msg.branch === "first_msg_2" || msg.branch === "first_msg_3"
  // Off-hours: мягкое Сообщение 1, запланированное при отклике вне рабочих
  // часов (producer — lib/messaging/first-messages-chain.ts,
  // OFF_HOURS_FIRST_BRANCH). Одиночное, не дожим: стоп-триггеры пропускаем,
  // но проверяем demo_opened/терминальную стадию, и (главное) шлём даже вне
  // рабочего окна — в этом весь смысл off-hours-сообщения.
  const isOffHoursFirst = msg.branch === "first_msg_offhours"
  // Этап 2: branch='test_after_message' — одиночное сообщение после теста
  // (auto: при проверке; assisted: по кнопке «Принять»). Как и anketa_auto_reply,
  // это не дожим: пропускаем стоп-триггеры и дневной rate-limit.
  const isTestAfterMessage = msg.branch === "test_after_message"
  const isOneOffPostAnketa =
    msg.branch === "anketa_confirmation" || msg.branch === "anketa_auto_reply"
    || isChainStep || isOffHoursFirst || isTestAfterMessage
  if (!isOneOffPostAnketa) {
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

    // Rate-limit: не более 1 ОТПРАВЛЕННОГО сообщения в день одному кандидату
    // (TZ Europe/Moscow). Применяется только к обычному дожиму (мы внутри
    // !isOneOffPostAnketa) — серия первых сообщений / off-hours / anketa-
    // автоответы НЕ ограничиваются (намеренные одиночные/быстрые серии).
    // Считаем ВСЕ sent-касания за сегодня (включая серию) — чтобы дожим не
    // ложился вторым/третьим сообщением поверх уже отправленного сегодня.
    // Если сегодня уже что-то ушло — оставляем pending (status/scheduled_at
    // НЕ трогаем), следующий день подберёт.
    const [sentToday] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(followUpMessages)
      .where(and(
        eq(followUpMessages.candidateId, msg.candidateId),
        eq(followUpMessages.status, "sent"),
        gte(followUpMessages.sentAt, startOfTodayMsk()),
      ))
    if ((sentToday?.count ?? 0) > 0) {
      return { outcome: "skipped", reason: "rate_limit_one_per_day" }
    }
  }

  // #21: для chain-сообщений (first_msg_2/first_msg_3) и off-hours-сообщения:
  // если кандидат уже открыл демо — приветственное теряет смысл, отменяем.
  // Также проверяем rejected/hired стадии — туда тоже не шлём.
  if (isChainStep || isOffHoursFirst) {
    const [cand] = await db
      .select({ stage: candidates.stage, demoOpenedAt: candidates.demoOpenedAt, autoStopped: candidates.autoProcessingStopped })
      .from(candidates)
      .where(eq(candidates.id, msg.candidateId))
      .limit(1)
    if (!cand) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "candidate_missing" }).where(eq(followUpMessages.id, msg.id))
      return { outcome: "cancelled", reason: "candidate_missing" }
    }
    if (cand.demoOpenedAt) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "demo_opened" }).where(eq(followUpMessages.id, msg.id))
      return { outcome: "cancelled", reason: "demo_opened" }
    }
    if (cand.stage === "rejected" || cand.stage === "hired" || cand.autoStopped) {
      await db.update(followUpMessages).set({ status: "cancelled", errorMessage: "stage_terminal" }).where(eq(followUpMessages.id, msg.id))
      return { outcome: "cancelled", reason: "stage_terminal" }
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
      aiChatbotEnabled:           vacancies.aiChatbotEnabled,
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

  // #15 phase 5/6: если у вакансии включён AI-чат-бот — он сам ведёт диалог,
  // дожимные касания не нужны. Cancel оставшиеся pending, не отправляем.
  if (vacancy.aiChatbotEnabled === true) {
    await db.update(followUpMessages).set({
      status: "cancelled",
      errorMessage: "ai_chatbot_active",
    }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "cancelled", reason: "ai_chatbot_active" }
  }

  // Проверка расписания: если сейчас вне окна — оставляем pending,
  // следующий cron в рабочее время подберёт. НЕ помечаем как failed.
  // Исключение: off-hours-сообщение (isOffHoursFirst) специально шлётся вне
  // рабочего окна — для него проверку расписания пропускаем.
  const check = canSendNow(vacancy, now)
  if (!check.allowed && !isOffHoursFirst) {
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

  // Подставляем переменные в текст касания (имя из кандидата, должность, ссылка).
  // Имя берём централизованным хелпером (hh first_name → fallback), shortId/token
  // нужны для demo-ссылки.
  const [cand] = await db
    .select({ shortId: candidates.shortId, token: candidates.token })
    .from(candidates)
    .where(eq(candidates.id, msg.candidateId))
    .limit(1)
  const { firstName } = await getCandidateFirstName(msg.candidateId)
  const tokenForUrl = cand?.shortId ?? cand?.token ?? msg.candidateId
  const demoUrl = `https://company24.pro/demo/${tokenForUrl}`
  const finalText = renderTemplate(msg.messageText, {
    name:      firstName,
    vacancy:   vacancy.title || "",
    company:   "Company24",
    demo_link: demoUrl,
  })

  // Реально отправляем в hh → выдержать per-company задержку перед следующей
  // отправкой. Возвращаем delayMs во всех исходах ниже (sent / hh-ошибка /
  // исключение), чтобы вызывающий цикл выждал нужную паузу.
  const delayMs = await resolveCompanyDelayMs(vacancy.companyId, delayCache)

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
      return { outcome: "failed", reason, delayMs }
    }
    await db.update(followUpMessages).set({
      status: "sent",
      sentAt: new Date(),
    }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "sent", delayMs }
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "unknown"
    await db.update(followUpMessages).set({
      status: "failed",
      errorMessage: reason,
    }).where(eq(followUpMessages.id, msg.id))
    return { outcome: "failed", reason: "exception", delayMs }
  }
}
