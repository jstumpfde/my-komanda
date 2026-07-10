// Создаёт Zoom-встречу от имени ТЕКУЩЕГО пользователя (его собственный Zoom,
// Юрий 10.07) и возвращает join_url — фронт подставляет его в meetingUrl.
// Саму встречу в calendar_events не пишет — это делает обычный PATCH/POST
// события с уже готовой ссылкой (см. components/calendar/event-modal.tsx).

import { NextRequest } from "next/server"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getValidZoomToken } from "@/lib/zoom/get-valid-token"
import { createZoomMeeting } from "@/lib/zoom/client"

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as {
      title?: unknown
      startAt?: unknown
      endAt?: unknown
    }

    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Интервью"
    const startAt = typeof body.startAt === "string" ? new Date(body.startAt) : null
    const endAt = typeof body.endAt === "string" ? new Date(body.endAt) : null
    if (!startAt || isNaN(startAt.getTime()) || !endAt || isNaN(endAt.getTime())) {
      return apiError("Некорректное время встречи", 400)
    }

    const accessToken = await getValidZoomToken(user.id)
    if (!accessToken) {
      return apiError("Zoom не подключён — подключите его в Профиле", 409)
    }

    const meeting = await createZoomMeeting(accessToken, { topic: title, startAt, endAt })
    return apiSuccess({ joinUrl: meeting.joinUrl })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[calendar/zoom/create-meeting]", err)
    return apiError("Не удалось создать встречу в Zoom", 500)
  }
}
