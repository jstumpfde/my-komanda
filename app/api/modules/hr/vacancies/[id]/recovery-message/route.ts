// PUT/PATCH /api/modules/hr/vacancies/[id]/recovery-message
// Body: { enabled: boolean, text: string }
// Сохраняет в vacancies.recoveryMessageEnabled / recoveryMessageText (#46).

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
    const body = await req.json().catch(() => ({})) as { enabled?: unknown; text?: unknown }

    const enabled = body.enabled === true
    const text = typeof body.text === "string" ? body.text.slice(0, 2000) : ""

    const [updated] = await db
      .update(vacancies)
      .set({
        recoveryMessageEnabled: enabled,
        recoveryMessageText:    text,
        updatedAt:              new Date(),
      })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({
        id:      vacancies.id,
        enabled: vacancies.recoveryMessageEnabled,
        text:    vacancies.recoveryMessageText,
      })

    if (!updated) return apiError("Vacancy not found", 404)
    return apiSuccess({ ok: true, enabled: updated.enabled, text: updated.text })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
