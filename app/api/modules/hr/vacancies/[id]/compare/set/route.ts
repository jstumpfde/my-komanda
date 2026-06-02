// POST /api/modules/hr/vacancies/[id]/compare/set { ids: string[] }
// Создаёт внутренний «набор сравнения» и возвращает короткий { token } для
// ссылки /hr/vacancies/[id]/compare?set=<token>. Без срока жизни, не публично
// (читается только в HR-роуте сравнения под авторизацией компании).
import { randomBytes } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, compareSets } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const MAX_COMPARE = 50

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX_COMPARE)
      : []
    if (ids.length === 0) return apiError("ids required", 400)

    const [vac] = await db
      .select({ companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)
    if (vac.companyId !== user.companyId) return apiError("Forbidden", 403)

    // Короткий токен (9 байт → 12 символов base64url).
    const token = randomBytes(9).toString("base64url")
    await db.insert(compareSets).values({
      token,
      companyId: user.companyId,
      vacancyId,
      candidateIds: ids,
      createdBy: user.id ?? null,
    })

    return apiSuccess({ token })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
