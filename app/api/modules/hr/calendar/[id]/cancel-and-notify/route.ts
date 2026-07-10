import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { calendarEvents, candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { sendCandidateMessage } from "@/lib/prequalification/start"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { renderTemplate } from "@/lib/template-renderer"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// POST /api/modules/hr/calendar/[id]/cancel-and-notify — менеджер отменяет
// назначенное интервью И одновременно шлёт кандидату сообщение (Юрий 10.07:
// «должно и сообщение уйти к кандидату, что ваша запись отменена»).
// Текст пришёл из диалога предпросмотра С НЕРАСКРЫТЫМИ {{name}}/{{vacancy}}/
// {{schedule_link}} (тот же принцип, что и у остальных веток stage-message-preview) —
// сервер рендерит их прямо перед отправкой, гвард «кандидату не уходит литерал {{...}}».
//
// Отдельно от «Отказать» (стадия → rejected, PUT /candidates/[id]/stage
// с messageOverride) — здесь кандидат НЕ отклоняется, только освобождается
// слот, чтобы он мог сам записаться на новое время.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { message?: unknown }

    const rawMessage = typeof body.message === "string" ? body.message.trim() : ""
    if (!rawMessage) return apiError("Текст сообщения обязателен", 400)
    if (rawMessage.length > 2000) return apiError("Слишком длинное сообщение", 400)

    const [event] = await db
      .select({
        id: calendarEvents.id,
        status: calendarEvents.status,
        candidateId: calendarEvents.candidateId,
        type: calendarEvents.type,
      })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, user.companyId)))
      .limit(1)

    if (!event) return apiError("Событие не найдено", 404)
    if (event.type !== "interview") return apiError("Не является интервью", 400)
    if (event.status === "cancelled") return apiError("Уже отменено", 409)

    await db
      .update(calendarEvents)
      .set({ status: "cancelled", interviewStatus: "Отменено", updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))

    let messageSent = false
    if (event.candidateId) {
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
      const rendered = renderTemplate(rawMessage, {
        name: firstName,
        vacancy: cand?.vacancyTitle ?? "",
        schedule_link: scheduleLink,
      })
      messageSent = await sendCandidateMessage(event.candidateId, rendered).catch(() => false)
    }

    return apiSuccess({ cancelled: true, messageSent })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[calendar cancel-and-notify]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
