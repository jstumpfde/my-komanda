// GET /api/public/compare/[token] — публичное (без логина) чтение сравнения
// по share-токену. Проверяет срок и отзыв. Только перечисленные кандидаты.
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { compareShares, vacancies } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { buildComparison } from "@/lib/compare/build-comparison"
import { checkRateLimit } from "@/lib/rate-limit"

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    if (!checkRateLimit(`compare-share:${ip}`, 30, 60000)) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await ctx.params
    if (!token) return apiError("token required", 400)

    const [share] = await db
      .select({
        vacancyId: compareShares.vacancyId,
        candidateIds: compareShares.candidateIds,
        expiresAt: compareShares.expiresAt,
        revokedAt: compareShares.revokedAt,
      })
      .from(compareShares)
      .where(eq(compareShares.token, token))
      .limit(1)
    if (!share) return apiError("Ссылка не найдена", 404)
    if (share.revokedAt) return apiError("Ссылка отозвана", 410)
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      return apiError("Срок действия ссылки истёк", 410)
    }

    const ids = Array.isArray(share.candidateIds)
      ? (share.candidateIds as unknown[]).filter((x): x is string => typeof x === "string")
      : []
    const [vac] = await db
      .select({ title: vacancies.title })
      .from(vacancies)
      .where(eq(vacancies.id, share.vacancyId))
      .limit(1)

    const result = await buildComparison(share.vacancyId, ids)
    return apiSuccess({ ...result, vacancyTitle: vac?.title ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
