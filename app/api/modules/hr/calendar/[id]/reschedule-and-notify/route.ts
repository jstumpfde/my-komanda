import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents, candidates, vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { sendCandidateMessage } from "@/lib/prequalification/start"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { renderTemplate } from "@/lib/template-renderer"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// POST /api/modules/hr/calendar/[id]/reschedule-and-notify — менеджер перенёс
// интервью (drag времени/дня в списке или календаре) И шлёт кандидату сообщение
// с новым временем (11.07: честная замена легаси-диалога, чей «Да, уведомить»
// показывал тост об отправке, ничего не отправляя).
//
// Текст пришёл из диалога предпросмотра С НЕРАСКРЫТЫМИ {{name}}/{{vacancy}}/
// {{new_date}}/{{new_time}}/{{schedule_link}} — сервер рендерит их прямо перед
// отправкой (тот же принцип, что и cancel-and-notify).
//
// startAt/endAt пишутся здесь же, хотя drag уже отправил их фоновым PATCH из
// updateInterview: тот PATCH — fire-and-forget с проглоченной ошибкой, и если
// он не дошёл, кандидат получил бы время, которого нет в календаре. Повторная
// запись тех же значений идемпотентна и гарантирует «сообщение = сохранённое
// время». {{new_date}}/{{new_time}} рендерятся из этих значений в таймзоне
// расписания компании (hiringDefaultsJson.schedule.timezone) — той же, в
// которой кандидат видит слоты на странице записи.

const MONTH_GENITIVE_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
]
const DAY_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]

// Локальные части UTC-даты в таймзоне (Intl, без пакетов) — как в
// app/api/public/schedule/[token]/route.ts (getLocalParts).
function getLocalParts(utcDate: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(utcDate)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as {
      message?: unknown; startAt?: unknown; endAt?: unknown
    }

    const rawMessage = typeof body.message === "string" ? body.message.trim() : ""
    if (!rawMessage) return apiError("Текст сообщения обязателен", 400)
    if (rawMessage.length > 2000) return apiError("Слишком длинное сообщение", 400)

    const startAt = typeof body.startAt === "string" ? new Date(body.startAt) : null
    const endAt = typeof body.endAt === "string" ? new Date(body.endAt) : null
    if (!startAt || !endAt || isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return apiError("startAt и endAt обязательны", 400)
    }
    if (endAt.getTime() <= startAt.getTime()) {
      return apiError("endAt должен быть позже startAt", 400)
    }

    const [event] = await db
      .select({
        id: calendarEvents.id,
        type: calendarEvents.type,
        candidateId: calendarEvents.candidateId,
      })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, user.companyId)))
      .limit(1)

    if (!event) return apiError("Событие не найдено", 404)
    if (event.type !== "interview") return apiError("Не является интервью", 400)
    if (!event.candidateId) return apiError("К записи не привязан кандидат", 400)

    await db
      .update(calendarEvents)
      .set({ startAt, endAt, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))

    const [cand] = await db
      .select({
        shortId: candidates.shortId,
        token: candidates.token,
        vacancyTitle: vacancies.title,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(candidates.id, event.candidateId))
      .limit(1)
    const { firstName } = await getCandidateFirstName(event.candidateId)
    const tokenForUrl = cand?.shortId ?? cand?.token ?? ""
    const scheduleLink = tokenForUrl ? `${getAppBaseUrl()}/schedule/${tokenForUrl}` : ""

    // Таймзона расписания компании — та же, в которой кандидат видел слоты.
    const [companyRow] = await db
      .select({ hiringDefaults: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    let tz = companyRow?.hiringDefaults?.schedule?.timezone || "Europe/Moscow"
    try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }) } catch { tz = "Europe/Moscow" }
    const { year, month, day, hour, minute } = getLocalParts(startAt, tz)
    const weekday = DAY_SHORT_RU[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? ""
    const newDate = `${weekday}, ${day} ${MONTH_GENITIVE_RU[month - 1] ?? ""}`
    const tzLabel = tz === "Europe/Moscow" ? "МСК" : tz
    const newTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${tzLabel})`

    const rendered = renderTemplate(rawMessage, {
      name: firstName,
      vacancy: cand?.vacancyTitle ?? "",
      schedule_link: scheduleLink,
      new_date: newDate,
      new_time: newTime,
    })
    const messageSent = await sendCandidateMessage(event.candidateId, rendered).catch(() => false)

    return apiSuccess({ rescheduled: true, messageSent })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[calendar reschedule-and-notify]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
