import { NextRequest } from "next/server"
import { eq, and, ilike, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesCompanies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const q = req.nextUrl.searchParams.get("q") || ""

    if (q.length < 1) return apiSuccess([])

    const rows = await db
      .select({
        id: salesCompanies.id,
        name: salesCompanies.name,
        inn: salesCompanies.inn,
        city: salesCompanies.city,
      })
      .from(salesCompanies)
      .where(
        and(
          eq(salesCompanies.tenantId, user.companyId),
          eq(salesCompanies.status, "active"),
          or(
            ilike(salesCompanies.name, `%${q}%`),
            ilike(salesCompanies.inn, `%${q}%`),
          ),
        ),
      )
      .limit(10)

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
