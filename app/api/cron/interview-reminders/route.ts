import { NextRequest, NextResponse } from "next/server"
import { eq, and, gt, lte, isNull, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents, companies, notifications, type CompanyHiringDefaults } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"

// C6: напоминания об интервью (24ч/2ч до начала).
//
// Источник правды — записи календаря (calendar_events, type='interview').
// Если интервью назначено — за 24 часа и за 2 часа до него HR/организатору
// уходит напоминание: in-app (таблица notifications) + Telegram-канал компании
// (если подключён). Это ВНУТРЕННЕЕ уведомление сотрудника — НЕ сообщение
// кандидату (не outward).
//
// Идемпотентность: на самом событии метки remind_24h_sent_at / remind_2h_sent_at
// (миграция 0172) — повторно не шлём. Тумблеры companies.hiringDefaultsJson
// .schedule.remind24h / remind2h (по умолчанию ВКЛ) могут отключить каждый тип.
//
// Расписание (crontab, раз в час — НЕ добавлено автоматически, активирует Юрий):
//   0 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/interview-reminders >> /var/log/interview-reminders.log 2>&1
//
// Protected by X-Cron-Secret header.

const H = 60 * 60 * 1000

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

async function run(): Promise<{ scanned: number; sent24h: number; sent2h: number; skipped: number }> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * H)
  const in2h = new Date(now.getTime() + 2 * H)

  // Кандидаты на напоминание: будущие незавершённые интервью, которым ещё
  // не слали хотя бы одно из напоминаний и которые уже попали в окно.
  const rows = await db
    .select({
      id:              calendarEvents.id,
      companyId:       calendarEvents.companyId,
      title:           calendarEvents.title,
      startAt:         calendarEvents.startAt,
      createdBy:       calendarEvents.createdBy,
      remind24hSentAt: calendarEvents.remind24hSentAt,
      remind2hSentAt:  calendarEvents.remind2hSentAt,
      interviewFormat: calendarEvents.interviewFormat,
      location:        calendarEvents.location,
      meetingUrl:      calendarEvents.meetingUrl,
      hiringDefaults:  companies.hiringDefaultsJson,
    })
    .from(calendarEvents)
    .innerJoin(companies, eq(calendarEvents.companyId, companies.id))
    .where(
      and(
        eq(calendarEvents.type, "interview"),
        ne(calendarEvents.status, "cancelled"),
        gt(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, in24h),
        or(isNull(calendarEvents.remind24hSentAt), isNull(calendarEvents.remind2hSentAt)),
      ),
    )

  let sent24h = 0, sent2h = 0, skipped = 0

  for (const ev of rows) {
    const sched = (ev.hiringDefaults as CompanyHiringDefaults | null)?.schedule ?? {}
    const tz = sched.timezone || "Europe/Moscow"
    const when = fmt(new Date(ev.startAt!), tz)

    // Какое напоминание актуально для этого события прямо сейчас.
    //  • ≤2ч до начала  → 2ч-напоминание (и гасим 24ч-метку, чтобы не слать поздно);
    //  • 2ч..24ч        → 24ч-напоминание.
    const within2h = new Date(ev.startAt!) <= in2h
    const kind: "24h" | "2h" | null =
      within2h && !ev.remind2hSentAt ? "2h"
      : !within2h && !ev.remind24hSentAt ? "24h"
      : null

    if (!kind) { skipped++; continue }

    const toggleOn = kind === "24h" ? (sched.remind24h !== false) : (sched.remind2h !== false)

    if (!toggleOn) {
      // Тип напоминания выключен компанией — помечаем как «обработано»,
      // чтобы cron не перебирал это событие каждый час.
      await db.update(calendarEvents)
        .set(kind === "24h" ? { remind24hSentAt: now } : { remind2hSentAt: now })
        .where(eq(calendarEvents.id, ev.id))
      skipped++
      continue
    }

    const lead = kind === "24h" ? "через 24 часа" : "через 2 часа"
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
      href:       "/hr/calendar",
    })

    // 2) Telegram-канал компании (если подключён — иначе тихо пропускается).
    await sendToCompanyChannel(ev.companyId, `⏰ <b>${title}</b>\n${body}`, { parseMode: "HTML" }).catch(() => {})

    // 3) Метка отправки — против повторов. Если ≤2ч, гасим и 24ч-метку.
    await db.update(calendarEvents)
      .set(kind === "2h" ? { remind2hSentAt: now, remind24hSentAt: ev.remind24hSentAt ?? now } : { remind24hSentAt: now })
      .where(eq(calendarEvents.id, ev.id))

    if (kind === "24h") sent24h++; else sent2h++
  }

  return { scanned: rows.length, sent24h, sent2h, skipped }
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
