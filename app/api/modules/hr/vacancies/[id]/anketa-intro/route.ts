import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// PATCH /api/modules/hr/vacancies/[id]/anketa-intro
// Body: { title?: string; description?: string }
// Сохраняется в vacancies.description_json.anketaIntro (Ф5 2026-05-10).
// Применяется на публичной странице демо (app/(public)/demo/[token]/demo-client.tsx)
// для текст-обёртки финальной анкеты.
export { PATCH as PUT }

const MAX_LEN = 2000

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!existing) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => ({})) as { title?: unknown; description?: unknown }

    const dj = (existing.descriptionJson as Record<string, unknown> | null) ?? {}
    const currentIntro = (dj.anketaIntro && typeof dj.anketaIntro === "object")
      ? dj.anketaIntro as Record<string, unknown>
      : {}

    const next: Record<string, string> = {
      title: typeof currentIntro.title === "string" ? currentIntro.title : "",
      description: typeof currentIntro.description === "string" ? currentIntro.description : "",
    }
    if (typeof body.title === "string") next.title = body.title.slice(0, MAX_LEN)
    if (typeof body.description === "string") next.description = body.description.slice(0, MAX_LEN)

    const newDj = { ...dj, anketaIntro: next }

    await db
      .update(vacancies)
      .set({ descriptionJson: newDj, updatedAt: new Date() })
      .where(eq(vacancies.id, id))

    return apiSuccess({ ok: true, anketaIntro: next })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
