import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { calendarEvents, calendarEventParticipants, candidates, vacancies, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and } from "drizzle-orm"
import { sendCandidateMessage } from "@/lib/prequalification/start"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { renderTemplate } from "@/lib/template-renderer"
import { DEFAULT_MEETING_LINK_MESSAGE } from "@/lib/hh/default-messages"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, user.companyId)))

    if (!event) return apiError("Событие не найдено", 404)

    // Участники-пользователи платформы (id) — чтобы модалка предзаполнила выбор
    // при редактировании (внешние участники уже лежат в колонке самого события).
    const parts = await db
      .select({ userId: calendarEventParticipants.userId })
      .from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.eventId, id))

    return apiSuccess({ ...event, participantIds: parts.map(p => p.userId) })
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json()

    const [existing] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, user.companyId)))

    if (!existing) return apiError("Событие не найдено", 404)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.type !== undefined) updateData.type = body.type
    if (body.startAt !== undefined) updateData.startAt = new Date(body.startAt)
    if (body.endAt !== undefined) updateData.endAt = new Date(body.endAt)
    if (body.allDay !== undefined) updateData.allDay = body.allDay
    if (body.roomId !== undefined) updateData.roomId = body.roomId
    if (body.color !== undefined) updateData.color = body.color
    if (body.recurrence !== undefined) updateData.recurrence = body.recurrence
    if (body.status !== undefined) updateData.status = body.status
    if (body.candidateId !== undefined) updateData.candidateId = body.candidateId
    if (body.vacancyId !== undefined) updateData.vacancyId = body.vacancyId
    if (body.interviewer !== undefined) updateData.interviewer = body.interviewer
    if (body.interviewType !== undefined) updateData.interviewType = body.interviewType
    if (body.interviewFormat !== undefined) updateData.interviewFormat = body.interviewFormat
    if (body.interviewStatus !== undefined) updateData.interviewStatus = body.interviewStatus
    if (body.location !== undefined) updateData.location = body.location
    if (body.meetingUrl !== undefined) updateData.meetingUrl = body.meetingUrl

    // Воронка v2 Фаза 2: фиксация итога интервью.
    const OUTCOME_VALUES = ["held", "no_show", "rescheduled"]
    const DECISION_VALUES = ["advance", "offer", "reject", "reserve"]
    let touchesOutcome = false
    if (body.interviewOutcome !== undefined) {
      if (body.interviewOutcome !== null && !OUTCOME_VALUES.includes(body.interviewOutcome)) {
        return apiError("Недопустимое значение interviewOutcome")
      }
      updateData.interviewOutcome = body.interviewOutcome
      touchesOutcome = true
    }
    if (body.interviewRating !== undefined) {
      if (body.interviewRating !== null) {
        const rating = Number(body.interviewRating)
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return apiError("interviewRating должен быть целым числом 1..5")
        }
        updateData.interviewRating = rating
      } else {
        updateData.interviewRating = null
      }
    }
    if (body.interviewDecision !== undefined) {
      if (body.interviewDecision !== null && !DECISION_VALUES.includes(body.interviewDecision)) {
        return apiError("Недопустимое значение interviewDecision")
      }
      updateData.interviewDecision = body.interviewDecision
      touchesOutcome = true
    }
    if (body.interviewNotes !== undefined) updateData.interviewNotes = body.interviewNotes
    if (touchesOutcome) updateData.interviewOutcomeAt = new Date()

    if (body.scope !== undefined) {
      updateData.scope = (body.scope === "hr" || body.scope === "personal") ? body.scope : "company"
    }
    if (body.externalParticipants !== undefined) {
      updateData.externalParticipants = Array.isArray(body.externalParticipants)
        ? (body.externalParticipants as unknown[]).map(String).map(s => s.trim()).filter(Boolean)
        : []
    }

    const [updated] = await db
      .update(calendarEvents)
      .set(updateData)
      .where(eq(calendarEvents.id, id))
      .returning()

    // Юрий 10.07: менеджер вставил/сменил ссылку на встречу (Zoom и т.п.) —
    // отправляем кандидату сообщение со ссылкой, просьбой подтвердить получение
    // и контактами HR (Профиль → «Контакты для кандидатов»), если заполнены.
    // Триггерится только на НЕПУСТОЕ реальное изменение и явный опт-ин с фронта
    // (notifyMeetingLink) — чтобы не слать письмо на каждый несвязанный PATCH.
    const finalCandidateId = (updated?.candidateId ?? existing.candidateId) as string | null
    const finalType = (updated?.type ?? existing.type) as string
    const newMeetingUrl = typeof updateData.meetingUrl === "string" ? updateData.meetingUrl.trim() : ""
    const meetingUrlChanged = newMeetingUrl !== "" && newMeetingUrl !== (existing.meetingUrl ?? "").trim()
    if (
      body.notifyMeetingLink === true &&
      finalType === "interview" &&
      finalCandidateId &&
      meetingUrlChanged
    ) {
      try {
        const [cand] = await db
          .select({
            shortId: candidates.shortId,
            vacancyTitle: vacancies.title,
          })
          .from(candidates)
          .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
          .where(eq(candidates.id, finalCandidateId))
          .limit(1)
        const [manager] = await db
          .select({
            contactTelegram: users.contactTelegram,
            contactMax: users.contactMax,
            contactPhone: users.contactPhone,
          })
          .from(users)
          .where(eq(users.id, existing.createdBy))
          .limit(1)
        const { firstName } = await getCandidateFirstName(finalCandidateId)

        const contactLines = [
          manager?.contactTelegram ? `Telegram: ${manager.contactTelegram}` : null,
          manager?.contactMax ? `Max: ${manager.contactMax}` : null,
          manager?.contactPhone ? `Телефон: ${manager.contactPhone}` : null,
        ].filter(Boolean) as string[]
        const contacts = contactLines.length
          ? `\n\nЕсли что-то не так — на связи:\n${contactLines.join("\n")}`
          : ""

        const template = (updated?.vacancyId
          ? (await db
              .select({ settings: vacancies.aiProcessSettings })
              .from(vacancies)
              .where(eq(vacancies.id, updated.vacancyId as string))
              .limit(1)
            ).at(0)?.settings as { meetingLinkMessage?: string } | null
          : null)?.meetingLinkMessage?.trim() || DEFAULT_MEETING_LINK_MESSAGE

        const rendered = renderTemplate(template, {
          name: firstName,
          vacancy: cand?.vacancyTitle ?? "",
          meeting_link: newMeetingUrl,
          contacts,
        })
        await sendCandidateMessage(finalCandidateId, rendered)
      } catch (notifyErr) {
        console.error("[calendar PATCH] meeting link notify failed:", notifyErr)
      }
    }

    // C4: обновляем участников (если переданы — заменяем полностью)
    if (body.participants !== undefined && Array.isArray(body.participants)) {
      await db.delete(calendarEventParticipants).where(eq(calendarEventParticipants.eventId, id))
      if (body.participants.length > 0) {
        await db.insert(calendarEventParticipants).values(
          (body.participants as string[]).map((userId) => ({ eventId: id, userId, status: "pending" }))
        )
      }
    }

    return apiSuccess(updated)
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, user.companyId)))

    if (!existing) return apiError("Событие не найдено", 404)

    await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
    return apiSuccess({ success: true })
  } catch (err: unknown) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
