import { NextRequest, NextResponse } from "next/server"
import { eq, and, gt, lte, isNull, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents, candidates, companies, notifications, users, type CompanyHiringDefaults } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { sendManagerBotMessage } from "@/lib/telegram/manager-bot"
import { sendCandidateMessage } from "@/lib/prequalification/start"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { renderReminderText, REMINDER_LEAD_PHRASES, type ReminderKind } from "@/lib/hr/interview-reminder-texts"

// C6 + #27 + Юрий 09.07: напоминания об интервью — 4 порога, одинаковые для
// кандидата/HR-канала и для менеджера: за сутки / утром в 9:00 / за час / за 15 минут.
//
// Источник правды — записи календаря (calendar_events, type='interview'). Когда
// интервью назначено, за каждый из порогов до него:
//   1) HR/организатору: in-app (notifications) + Telegram-канал компании (если подключён).
//   2) Кандидату (если calendar_event.candidate_id заполнен): сообщение в hh-чат через
//      sendCandidateMessage. Ссылка на перезапись (/schedule/[token]).
//   3) Менеджеру-создателю события (calendar_event.created_by), ЕСЛИ он привязал
//      личный Telegram к платформенному боту @Ren_HR_bot (users.manager_reminder_chat_id,
//      см. lib/telegram/manager-bot.ts) — та же каденция. Отдельная дорожка меток
//      remind_manager_*, не пересекается с (1)/(2).
//
// Пороги (одинаковый набор для обеих дорожек):
//   • 24h      — за сутки. ГЕЙТ (Юрий 09.07): применяется, только если интервью
//                назначено больше чем за 36 часов ДО СОЗДАНИЯ события (startAt - createdAt
//                > 36ч) — иначе «через 24 часа» может быть отправлено при брони
//                впритык, когда реального 24-часового рубежа никогда не было
//                (интервью уже было ближе, чем сутки, в момент записи).
//   • morning  — утром в день встречи, локальный час ≥ 9 (не будим ночью/рано).
//   • 1h       — за час (окно ≤ ~75 мин — запас на редкий сбой тика).
//   • 15m      — за 15 минут (окно ≤20 мин — cron раз в 5 мин).
// Легаси «2h» (backward-compat) — колонка/тумблер в схеме остаются для старых
// данных, но больше не участвует в выборе kind (заменён набором выше).
//
// Идемпотентность: на событии метки remind_24h/morning/1h/15m_sent_at (кандидат/канал)
// и remind_manager_24h/morning/1h/15m_sent_at (менеджер) — повторно не шлём.
// Тумблеры companies.hiringDefaultsJson.schedule.remind24h / remindMorning / remind1h /
// remind15m (по умолчанию ВКЛ) управляют ТОЛЬКО кандидат/канал-напоминаниями; менеджерские
// шлются всегда, если бот привязан (нет отдельного тумблера — привязка бота = согласие).
//
// Расписание (crontab — раз в 5 минут, ужесточено 09.07 ради порога «за 15 минут»;
// при часовом интервале это окно почти всегда проскакивает):
//   */5 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/interview-reminders >> /var/log/interview-reminders.log 2>&1
//
// Тексты сообщений (14.07, задача editable-interview-reminder-texts):
// companies.hiringDefaultsJson.schedule.reminderTexts.{candidate|hr|manager}.
// {24h|morning|1h|15m} — редактируется в /hr/calendar?settings=1. Пусто →
// DEFAULT_REMINDER_TEXTS (lib/hr/interview-reminder-texts.ts), байт-в-байт
// как исходный хардкод. Короткая лид-фраза («через час» и т.п.) для
// notifications.title и первой строки Telegram-сообщений — REMINDER_LEAD_PHRASES,
// сознательно осталась в коде (см. комментарий в lib/hr/interview-reminder-texts.ts).
//
// Protected by X-Cron-Secret header.

const H = 60 * 60 * 1000
const APP_ORIGIN = getAppBaseUrl()
const ELIGIBLE_24H_NOTICE_MS = 36 * H // Юрий 09.07: бронь должна быть сделана больше чем за 36ч до интервью

// Локальный час (0-23) даты в заданной TZ.
function localHour(d: Date, tz: string): number {
  try {
    const v = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(d)
    return parseInt(v, 10) || 0
  } catch { return d.getUTCHours() }
}

// Локальный YYYY-MM-DD даты в заданной TZ (для сравнения «тот же день»).
function localYMD(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(d)
  } catch { return d.toISOString().slice(0, 10) }
}

// Юрий 10.07: явная метка часового пояса рядом с каждым временем в тексте
// кандидату — без неё «18:00» читается как локальное время получателя,
// что приводило к путанице («по московскому времени у вас указано?»).
function tzLabel(tz: string): string {
  return tz === "Europe/Moscow" ? "МСК" : tz
}

function fmt(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz,
    }).format(d) + ` (${tzLabel(tz)})`
  } catch {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
    }).format(d) + " (МСК)"
  }
}

async function run(): Promise<{ scanned: number; sent24h: number; sentMorning: number; sent1h: number; sent15m: number; skipped: number; sentManager: number }> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * H)
  const in1h15 = new Date(now.getTime() + 75 * 60 * 1000) // окно «за час» с запасом на редкий сбой тика
  const in15m  = new Date(now.getTime() + 20 * 60 * 1000) // окно «за 15 минут» — cron раз в 5 мин

  // Кандидаты на напоминание: будущие незавершённые интервью, которым ещё
  // не слали хотя бы одно из напоминаний (кандидату/каналу ИЛИ менеджеру)
  // и которые уже попали в окно (≤24ч).
  const rows = await db
    .select({
      id:                  calendarEvents.id,
      companyId:           calendarEvents.companyId,
      title:               calendarEvents.title,
      startAt:             calendarEvents.startAt,
      createdAt:           calendarEvents.createdAt,
      createdBy:           calendarEvents.createdBy,
      remind24hSentAt:     calendarEvents.remind24hSentAt,
      remindMorningSentAt: calendarEvents.remindMorningSentAt,
      remind1hSentAt:      calendarEvents.remind1hSentAt,
      remind15mSentAt:     calendarEvents.remind15mSentAt,
      remindManager24hSentAt:     calendarEvents.remindManager24hSentAt,
      remindManagerMorningSentAt: calendarEvents.remindManagerMorningSentAt,
      remindManager1hSentAt:      calendarEvents.remindManager1hSentAt,
      remindManager15mSentAt:     calendarEvents.remindManager15mSentAt,
      interviewFormat:     calendarEvents.interviewFormat,
      location:            calendarEvents.location,
      meetingUrl:          calendarEvents.meetingUrl,
      hiringDefaults:      companies.hiringDefaultsJson,
      candidateId:         calendarEvents.candidateId,
      candShortId:         candidates.shortId,
      candToken:           candidates.token,
      managerChatId:       users.managerReminderChatId,
    })
    .from(calendarEvents)
    .innerJoin(companies, eq(calendarEvents.companyId, companies.id))
    .leftJoin(candidates, eq(calendarEvents.candidateId, candidates.id))
    .leftJoin(users, eq(calendarEvents.createdBy, users.id))
    .where(
      and(
        eq(calendarEvents.type, "interview"),
        ne(calendarEvents.status, "cancelled"),
        gt(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, in24h),
        or(
          isNull(calendarEvents.remind24hSentAt),
          isNull(calendarEvents.remindMorningSentAt),
          isNull(calendarEvents.remind1hSentAt),
          isNull(calendarEvents.remind15mSentAt),
          isNull(calendarEvents.remindManager24hSentAt),
          isNull(calendarEvents.remindManagerMorningSentAt),
          isNull(calendarEvents.remindManager1hSentAt),
          isNull(calendarEvents.remindManager15mSentAt),
        ),
      ),
    )

  let sent24h = 0, sentMorning = 0, sent1h = 0, sent15m = 0, skipped = 0, sentManager = 0

  for (const ev of rows) {
    const sched   = (ev.hiringDefaults as CompanyHiringDefaults | null)?.schedule ?? {}
    const tz      = sched.timezone || "Europe/Moscow"
    const startAt = new Date(ev.startAt!)
    const when    = fmt(startAt, tz)

    // #14: адрес/ссылка — общая для всех трёх каналов (кандидат/HR/менеджер).
    const locationLine = ev.interviewFormat === "Офис" && ev.location
      ? `\n📍 ${ev.location}`
      : ev.interviewFormat === "Онлайн" && ev.meetingUrl
        ? `\n🔗 ${ev.meetingUrl}`
        : ""
    // #27: ссылка на перезапись — тем же токеном, что и приглашение (short_id → token).
    // Используется только в кандидатском тексте, но считаем один раз на событие.
    const tokenForUrl = ev.candShortId ?? ev.candToken ?? null
    const rescheduleLine = tokenForUrl
      ? `\n\nНе получается в это время? Выберите другое: ${APP_ORIGIN}/schedule/${tokenForUrl}`
      : ""
    // Плейсхолдеры для reminderTexts (lib/hr/interview-reminder-texts.ts) —
    // одинаковый набор для всех каналов, неиспользуемые в конкретном
    // шаблоне ключи просто не встречаются в тексте.
    const vars: Record<string, string> = {
      event_title:     ev.title,
      interview_at:    when,
      location:        locationLine,
      reschedule_link: rescheduleLine,
    }

    const within1h      = startAt <= in1h15
    const within15m     = startAt <= in15m
    const sameLocalDay  = localYMD(startAt, tz) === localYMD(now, tz)
    const isMorningNow  = localHour(now, tz) >= 9   // «утром в 9:00» (Юрий 09.07) — не будим раньше
    // Гейт «за 24 часа»: применяется только если бронь сделана больше чем за 36ч
    // до интервью — иначе рубежа «ровно сутки осталось» никогда не было.
    const createdAt = ev.createdAt ? new Date(ev.createdAt) : startAt
    const eligible24h = (startAt.getTime() - createdAt.getTime()) > ELIGIBLE_24H_NOTICE_MS

    // Выбираем ОДНО, самое актуальное напоминание на этот тик (ближайший порог
    // впереди). Приоритет: 15m → 1h → morning → 24h.
    let kind: ReminderKind | null = null
    if (within15m && !ev.remind15mSentAt) kind = "15m"
    else if (within1h && !ev.remind1hSentAt) kind = "1h"
    else if (sameLocalDay && isMorningNow && !ev.remindMorningSentAt) kind = "morning"
    else if (eligible24h && !ev.remind24hSentAt) kind = "24h"

    // Отдельная дорожка для менеджера — тот же набор порогов, своя идемпотентность,
    // не зависит от того, что уже отправлено кандидату/каналу выше.
    let managerKind: ReminderKind | null = null
    if (ev.managerChatId) {
      if (within15m && !ev.remindManager15mSentAt) managerKind = "15m"
      else if (within1h && !ev.remindManager1hSentAt) managerKind = "1h"
      else if (sameLocalDay && isMorningNow && !ev.remindManagerMorningSentAt) managerKind = "morning"
      else if (eligible24h && !ev.remindManager24hSentAt) managerKind = "24h"
    }

    if (!kind && !managerKind) { skipped++; continue }

    const markField =
      !kind ? {}
      : kind === "15m"     ? { remind15mSentAt: now }
      : kind === "1h"      ? { remind1hSentAt: now }
      : kind === "morning" ? { remindMorningSentAt: now }
      : { remind24hSentAt: now }

    const managerMarkField =
      !managerKind ? {}
      : managerKind === "15m"     ? { remindManager15mSentAt: now }
      : managerKind === "1h"      ? { remindManager1hSentAt: now }
      : managerKind === "morning" ? { remindManagerMorningSentAt: now }
      : { remindManager24hSentAt: now }

    // 0) Напоминание менеджеру — не зависит от тумблеров companies.hiringDefaultsJson
    // (те гейтят только кандидата/канал); привязка бота = согласие получать все 4 порога.
    if (managerKind) {
      const managerText = renderReminderText("manager", managerKind, sched.reminderTexts, vars)
      await sendManagerBotMessage(ev.managerChatId!, managerText).catch(() => {})
      await db.update(calendarEvents).set(managerMarkField).where(eq(calendarEvents.id, ev.id))
      sentManager++
    }

    if (!kind) { skipped++; continue }

    const toggleOn =
      kind === "24h"     ? (sched.remind24h !== false)
      : kind === "morning" ? (sched.remindMorning !== false)
      : kind === "15m"   ? (sched.remind15m !== false)
      : (sched.remind1h !== false) // 1h

    if (!toggleOn) {
      // Тип напоминания выключен компанией — помечаем как «обработано»,
      // чтобы cron не перебирал это событие на каждом тике.
      await db.update(calendarEvents).set(markField).where(eq(calendarEvents.id, ev.id))
      skipped++
      continue
    }

    // Короткая лид-фраза заголовка (НЕ редактируется через reminderTexts —
    // см. комментарий в lib/hr/interview-reminder-texts.ts); само сообщение
    // (body) — полностью редактируемо через reminderTexts.hr.
    const title = `Интервью ${REMINDER_LEAD_PHRASES[kind]}`
    const body  = renderReminderText("hr", kind, sched.reminderTexts, vars)

    // 1) In-app уведомление организатору (или всем HR тенанта, если автор неизвестен).
    await db.insert(notifications).values({
      tenantId:   ev.companyId,
      userId:     ev.createdBy ?? null,
      type:       "interview_reminder",
      title,
      body,
      severity:   "info",
      sourceType: "calendar_event",
      sourceId:   ev.id,
      href:       "/hr/interviews?tab=calendar",
    })

    // 2) Telegram-канал компании (если подключён — иначе тихо пропускается).
    await sendToCompanyChannel(ev.companyId, `⏰ <b>${title}</b>\n${body}`, { parseMode: "HTML" }).catch(() => {})

    // 3) Сообщение кандидату в hh-чат (если событие привязано к кандидату).
    if (ev.candidateId) {
      const candidateText = renderReminderText("candidate", kind, sched.reminderTexts, vars)
      await sendCandidateMessage(ev.candidateId, candidateText).catch(() => {})
    }

    // 4) Метка отправки — против повторов.
    await db.update(calendarEvents).set(markField).where(eq(calendarEvents.id, ev.id))

    if (kind === "24h") sent24h++
    else if (kind === "morning") sentMorning++
    else if (kind === "15m") sent15m++
    else sent1h++
  }

  return { scanned: rows.length, sent24h, sentMorning, sent1h, sent15m, skipped, sentManager }
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const { id } = await startCronRun("interview-reminders")
  try {
    const result = await run()
    await finishCronRun(id, "ok", result)
    console.log(JSON.stringify({ tag: "cron/interview-reminders", ...result, ts: new Date().toISOString() }))
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishCronRun(id, "error", null, msg)
    console.error("[cron/interview-reminders]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest) { return handle(req) }
