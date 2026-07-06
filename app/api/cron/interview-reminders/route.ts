import { NextRequest, NextResponse } from "next/server"
import { eq, and, gt, lte, isNull, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents, candidates, companies, notifications, type CompanyHiringDefaults } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { sendCandidateMessage } from "@/lib/prequalification/start"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// C6 + #27: напоминания об интервью (за сутки / утром в день встречи / за 2 ч / за час).
//
// Источник правды — записи календаря (calendar_events, type='interview').
// Когда интервью назначено, за каждый из порогов до него:
//   1) HR/организатору: in-app (notifications) + Telegram-канал компании (если подключён).
//   2) Кандидату (если calendar_event.candidate_id заполнен): сообщение в hh-чат через
//      sendCandidateMessage. Это OUTWARD — активировано явным решением (привязка кандидата).
//      В сообщении кандидату — ссылка на перезапись (/schedule/[token]).
//
// Пороги (kind):
//   • 24h      — за сутки (окно 2ч..24ч);
//   • morning  — утром в день встречи (тот же локальный день, локальный час ≥ 7, встреча ещё впереди);
//   • 2h       — за 2 часа (окно 1ч..2ч, backward-compat);
//   • 1h       — за час (окно ≤ ~75 мин).
//
// Идемпотентность: на событии метки remind_24h/2h/morning/1h_sent_at — повторно не шлём.
// Тумблеры companies.hiringDefaultsJson.schedule.remind24h / remindMorning / remind2h /
// remind1h (по умолчанию ВКЛ) могут отключить каждый тип.
//
// Расписание (crontab, раз в час — НЕ добавлено автоматически, активирует Юрий):
//   0 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/interview-reminders >> /var/log/interview-reminders.log 2>&1
//
// Protected by X-Cron-Secret header.

const H = 60 * 60 * 1000
const APP_ORIGIN = getAppBaseUrl()

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

function fmt(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz,
    }).format(d)
  } catch {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
    }).format(d)
  }
}

type ReminderKind = "24h" | "morning" | "2h" | "1h"

async function run(): Promise<{ scanned: number; sent24h: number; sentMorning: number; sent2h: number; sent1h: number; skipped: number }> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * H)
  const in2h  = new Date(now.getTime() + 2 * H)
  const in1h15 = new Date(now.getTime() + 75 * 60 * 1000) // окно «за час» с запасом на часовой cron

  // Кандидаты на напоминание: будущие незавершённые интервью, которым ещё
  // не слали хотя бы одно из напоминаний и которые уже попали в окно (≤24ч).
  const rows = await db
    .select({
      id:                  calendarEvents.id,
      companyId:           calendarEvents.companyId,
      title:               calendarEvents.title,
      startAt:             calendarEvents.startAt,
      createdBy:           calendarEvents.createdBy,
      remind24hSentAt:     calendarEvents.remind24hSentAt,
      remind2hSentAt:      calendarEvents.remind2hSentAt,
      remindMorningSentAt: calendarEvents.remindMorningSentAt,
      remind1hSentAt:      calendarEvents.remind1hSentAt,
      interviewFormat:     calendarEvents.interviewFormat,
      location:            calendarEvents.location,
      meetingUrl:          calendarEvents.meetingUrl,
      hiringDefaults:      companies.hiringDefaultsJson,
      candidateId:         calendarEvents.candidateId,
      candShortId:         candidates.shortId,
      candToken:           candidates.token,
    })
    .from(calendarEvents)
    .innerJoin(companies, eq(calendarEvents.companyId, companies.id))
    .leftJoin(candidates, eq(calendarEvents.candidateId, candidates.id))
    .where(
      and(
        eq(calendarEvents.type, "interview"),
        ne(calendarEvents.status, "cancelled"),
        gt(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, in24h),
        or(
          isNull(calendarEvents.remind24hSentAt),
          isNull(calendarEvents.remind2hSentAt),
          isNull(calendarEvents.remindMorningSentAt),
          isNull(calendarEvents.remind1hSentAt),
        ),
      ),
    )

  let sent24h = 0, sentMorning = 0, sent2h = 0, sent1h = 0, skipped = 0

  for (const ev of rows) {
    const sched   = (ev.hiringDefaults as CompanyHiringDefaults | null)?.schedule ?? {}
    const tz      = sched.timezone || "Europe/Moscow"
    const startAt = new Date(ev.startAt!)
    const when    = fmt(startAt, tz)

    // Выбираем ОДНО, самое актуальное напоминание на этот тик (ближайший порог
    // впереди). Порядок приоритета: 1h → 2h → morning → 24h.
    const within1h      = startAt <= in1h15
    const within2h      = startAt <= in2h
    const sameLocalDay  = localYMD(startAt, tz) === localYMD(now, tz)
    const isMorningNow  = localHour(now, tz) >= 7   // утро — не будим ночью

    let kind: ReminderKind | null = null
    if (within1h && !ev.remind1hSentAt) kind = "1h"
    else if (within2h && !ev.remind2hSentAt) kind = "2h"
    else if (sameLocalDay && isMorningNow && !ev.remindMorningSentAt) kind = "morning"
    else if (!ev.remind24hSentAt) kind = "24h"

    if (!kind) { skipped++; continue }

    const markField =
      kind === "1h"      ? { remind1hSentAt: now }
      : kind === "2h"    ? { remind2hSentAt: now }
      : kind === "morning" ? { remindMorningSentAt: now }
      : { remind24hSentAt: now }

    const toggleOn =
      kind === "24h"     ? (sched.remind24h !== false)
      : kind === "morning" ? (sched.remindMorning !== false)
      : kind === "2h"    ? (sched.remind2h !== false)
      : (sched.remind1h !== false) // 1h

    if (!toggleOn) {
      // Тип напоминания выключен компанией — помечаем как «обработано»,
      // чтобы cron не перебирал это событие каждый час.
      await db.update(calendarEvents).set(markField).where(eq(calendarEvents.id, ev.id))
      skipped++
      continue
    }

    const lead =
      kind === "24h"     ? "через 24 часа"
      : kind === "morning" ? "сегодня"
      : kind === "2h"    ? "через 2 часа"
      : "через час"
    const title = `Интервью ${lead}`
    // #14: добавляем адрес или ссылку к тексту напоминания
    const locationLine = ev.interviewFormat === "Офис" && ev.location
      ? `\n📍 ${ev.location}`
      : ev.interviewFormat === "Онлайн" && ev.meetingUrl
        ? `\n🔗 ${ev.meetingUrl}`
        : ""
    const body = `«${ev.title}» — ${when}${locationLine}`

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
      const candidateLead =
        kind === "24h"     ? "завтра"
        : kind === "morning" ? "сегодня"
        : kind === "2h"    ? "через 2 часа"
        : "через час"
      const candidateLocation = ev.interviewFormat === "Офис" && ev.location
        ? `\n📍 ${ev.location}`
        : ev.interviewFormat === "Онлайн" && ev.meetingUrl
          ? `\n🔗 ${ev.meetingUrl}`
          : ""
      // #27: ссылка на перезапись — тем же токеном, что и приглашение (short_id → token).
      const tokenForUrl = ev.candShortId ?? ev.candToken ?? null
      const rescheduleLine = tokenForUrl
        ? `\n\nНе получается в это время? Выберите другое: ${APP_ORIGIN}/schedule/${tokenForUrl}`
        : ""
      const candidateText =
        `Здравствуйте! Напоминаем, что ${candidateLead} в ${when} запланировано собеседование.${candidateLocation}${rescheduleLine}`
      await sendCandidateMessage(ev.candidateId, candidateText).catch(() => {})
    }

    // 4) Метка отправки — против повторов.
    await db.update(calendarEvents).set(markField).where(eq(calendarEvents.id, ev.id))

    if (kind === "24h") sent24h++
    else if (kind === "morning") sentMorning++
    else if (kind === "2h") sent2h++
    else sent1h++
  }

  return { scanned: rows.length, sent24h, sentMorning, sent2h, sent1h, skipped }
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
