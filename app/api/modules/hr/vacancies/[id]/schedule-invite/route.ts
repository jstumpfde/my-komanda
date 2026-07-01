// PUT/PATCH /api/modules/hr/vacancies/[id]/schedule-invite
// Body: { text: string }
// Сохраняет настраиваемый текст приглашения на интервью в
// vacancies.scheduleInviteText. Пусто → в scheduleInterviewInvite
// используется DEFAULT_SCHEDULE_INVITE_TEXT (без hardcoded fallback в БД).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { text?: unknown }

    const text = typeof body.text === "string" ? body.text.slice(0, 4000) : ""

    const [updated] = await db
      .update(vacancies)
      .set({
        scheduleInviteText: text,
        updatedAt:          new Date(),
      })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({
        id:   vacancies.id,
        text: vacancies.scheduleInviteText,
      })

    if (!updated) return apiError("Vacancy not found", 404)
    return apiSuccess({ ok: true, text: updated.text })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
