import { NextRequest } from "next/server"
import { and, eq, ilike, or, sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { outreachCompanies, outreachContacts } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireOutreachAccess } from "@/lib/outreach/access"

// GET ?q=&limit=&offset= — страница единой базы компаний + агрегаты.
export async function GET(req: NextRequest) {
  try {
    const user = await requireOutreachAccess()
    const sp = req.nextUrl.searchParams
    const q = (sp.get("q") || "").trim()
    const innFilter = (sp.get("inn") || "").trim()
    const regionFilter = (sp.get("region") || "").trim()
    const limit = Math.min(Number(sp.get("limit") || 50), 200)
    const offset = Math.max(Number(sp.get("offset") || 0), 0)

    const base = eq(outreachCompanies.companyId, user.companyId)
    // and() игнорирует undefined-условия → собираем фильтры по наличию.
    const where = and(
      base,
      q ? or(ilike(outreachCompanies.name, `%${q}%`), ilike(outreachCompanies.inn, `%${q}%`)) : undefined,
      innFilter ? ilike(outreachCompanies.inn, `%${innFilter}%`) : undefined,
      regionFilter ? ilike(outreachCompanies.region, `%${regionFilter}%`) : undefined,
    )

    const items = await db
      .select({
        id: outreachCompanies.id,
        inn: outreachCompanies.inn,
        name: outreachCompanies.name,
        region: outreachCompanies.region,
        website: outreachCompanies.website,
        segment: outreachCompanies.segment,
        status: outreachCompanies.status,
        enriched: outreachCompanies.enriched,
        updatedAt: outreachCompanies.updatedAt,
        contactsCount: sql<number>`(select count(*)::int from outreach_contacts c where c.target_id = ${outreachCompanies.id})`,
      })
      .from(outreachCompanies)
      .where(where)
      .orderBy(desc(outreachCompanies.updatedAt))
      .limit(limit)
      .offset(offset)

    const totalRow = await db.select({ n: sql<number>`count(*)::int` }).from(outreachCompanies).where(where)
    const statsRow = await db
      .select({
        companies: sql<number>`count(*)::int`,
        withInn: sql<number>`count(${outreachCompanies.innNorm})::int`,
      })
      .from(outreachCompanies)
      .where(base)
    const contactsRow = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(outreachContacts)
      .where(eq(outreachContacts.companyId, user.companyId))

    return apiSuccess({
      items,
      total: totalRow[0]?.n ?? 0,
      stats: {
        companies: statsRow[0]?.companies ?? 0,
        withInn: statsRow[0]?.withInn ?? 0,
        contacts: contactsRow[0]?.n ?? 0,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[email-marketing/companies]", err)
    return apiError("Ошибка загрузки базы", 500)
  }
}
