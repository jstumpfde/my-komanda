import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/modules/hr/vacancies/[id]/message-queue/pause
// Body: { paused: boolean }
// Ставит или снимает паузу исходящей очереди сообщений вакансии.
// Когда paused=true — cron follow-up пропускает pending-сообщения этой вакансии.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    if (typeof body.paused !== "boolean") {
      return apiError("Поле paused (boolean) обязательно", 400)
    }

    // Tenant-проверка: обновляем только если вакансия принадлежит компании
    const result = await db
      .update(vacancies)
      .set({ outboundPaused: body.paused, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })

    if (result.length === 0) {
      return apiError("Вакансия не найдена", 404)
    }

    return apiSuccess({ paused: body.paused })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[message-queue/pause POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
