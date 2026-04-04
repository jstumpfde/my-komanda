import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, vacancyUtmLinks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const user = await requireCompany()
    const { id, linkId } = await params

    // Verify vacancy ownership
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Vacancy not found", 404)

    // Delete link (verify it belongs to this vacancy)
    const deleted = await db
      .delete(vacancyUtmLinks)
      .where(and(eq(vacancyUtmLinks.id, linkId), eq(vacancyUtmLinks.vacancyId, id)))
      .returning()

    if (deleted.length === 0) return apiError("Link not found", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
