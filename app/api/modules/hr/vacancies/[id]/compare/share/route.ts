// POST /api/modules/hr/vacancies/[id]/compare/share { ids: string[] }
// Создаёт публичную ссылку на сравнение (срок 7 дней). Возвращает { token }.
import { randomBytes } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, compareShares } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const MAX_COMPARE = 50
const TTL_MS = 7 * 24 * 60 * 60 * 1000

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

    const token = randomBytes(18).toString("base64url")
    const expiresAt = new Date(Date.now() + TTL_MS)
    await db.insert(compareShares).values({
      token,
      companyId: user.companyId,
      vacancyId,
      candidateIds: ids,
      createdBy: user.id ?? null,
      expiresAt,
    })

    return apiSuccess({ token, expiresAt: expiresAt.toISOString() })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
