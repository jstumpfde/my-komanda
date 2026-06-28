import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// F8: «скрыть у себя» в чате — серверное хранение id скрытых сообщений.
// Косметическое, на нашей стороне (у кандидата в hh сообщение остаётся).
// Body: { ids: string[] } — полный набор скрытых id для этого кандидата.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 5000)
      : []

    // Проверка владения через join вакансии.
    const [row] = await db
      .select({ candidateId: candidates.id })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Candidate not found", 404)

    await db
      .update(candidates)
      .set({ hiddenChatMsgIds: ids, updatedAt: new Date() })
      .where(eq(candidates.id, id))

    return apiSuccess({ ids })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
