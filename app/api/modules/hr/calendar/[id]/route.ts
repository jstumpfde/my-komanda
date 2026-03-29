import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { calendarEvents } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { eq, and } from "drizzle-orm"

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
    return apiSuccess(event)
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

    const [updated] = await db
      .update(calendarEvents)
      .set(updateData)
      .where(eq(calendarEvents.id, id))
      .returning()

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
