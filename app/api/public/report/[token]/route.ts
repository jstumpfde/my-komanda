// GET /api/public/report/[token] — публичное (без логина) чтение «Отчёта по найму»
// по share-токену. Период/вакансия — через query (?period=&vacancyId=).
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { reportShares } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { buildReport, parsePeriod } from "@/lib/hr/build-report"

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params
    if (!token) return apiError("token required", 400)

    const [share] = await db
      .select({ companyId: reportShares.companyId, revokedAt: reportShares.revokedAt })
      .from(reportShares)
      .where(and(eq(reportShares.token, token), isNull(reportShares.revokedAt)))
      .limit(1)
    if (!share) return apiError("Ссылка не найдена или отозвана", 404)

    const url = new URL(req.url)
    const period = parsePeriod(url.searchParams.get("period"))
    const vacancyId = url.searchParams.get("vacancyId")

    const data = await buildReport(share.companyId, { period, vacancyId })
    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[public/report] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
