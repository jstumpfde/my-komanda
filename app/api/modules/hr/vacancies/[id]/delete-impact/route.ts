import { NextRequest } from "next/server"
import { eq, and, count, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/modules/hr/vacancies/[id]/delete-impact
// Предпросмотр для модалки «Удалить навсегда»: что именно будет удалено.
// { title, candidates, messages }. messages — best-effort (таблица follow_up_messages
// может отсутствовать в части окружений → 0).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vac] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

    const [cntRow] = await db
      .select({ c: count() })
      .from(candidates)
      .where(eq(candidates.vacancyId, id))
    const candidatesCount = cntRow?.c ?? 0

    let messagesCount = 0
    try {
      const r = await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM follow_up_messages
        WHERE candidate_id IN (SELECT id FROM candidates WHERE vacancy_id = ${id})
      `) as unknown as Array<{ c: number }>
      messagesCount = r?.[0]?.c ?? 0
    } catch {
      // таблицы нет в этом окружении — оставляем 0
    }

    return apiSuccess({
      title:      vac.title,
      candidates: candidatesCount,
      messages:   messagesCount,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
