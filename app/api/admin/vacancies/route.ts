// Платформенный обзор ВСЕХ вакансий всех компаний (Юрий 27.06).
// GET /api/admin/vacancies?status=all|active|draft|trash&q=...
// Только платформ-админ. Активные/черновики/корзина + компания + авто-разбор + hh-статус.
import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, ilike, isNull, isNotNull, or, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies, hhVacancies } from "@/lib/db/schema"
import { requirePlatformAdmin } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin()
    const sp = req.nextUrl.searchParams
    const status = sp.get("status") ?? "all"   // all | active | draft | trash
    const q = (sp.get("q") ?? "").trim()

    const conds: (SQL | undefined)[] = []
    if (status === "trash") conds.push(isNotNull(vacancies.deletedAt))
    else {
      conds.push(isNull(vacancies.deletedAt))
      if (status === "active") conds.push(or(eq(vacancies.status, "active"), eq(vacancies.status, "published"), eq(vacancies.status, "paused")))
      else if (status === "draft") conds.push(eq(vacancies.status, "draft"))
    }
    if (q) conds.push(or(ilike(vacancies.title, `%${q}%`), ilike(companies.name, `%${q}%`)) as SQL)

    const rows = await db
      .select({
        id:        vacancies.id,
        title:     vacancies.title,
        status:    vacancies.status,
        deletedAt: vacancies.deletedAt,
        auto:      vacancies.autoProcessingEnabled,
        createdAt: vacancies.createdAt,
        companyId: vacancies.companyId,
        company:   companies.name,
        hhStatus:  hhVacancies.status,
        hhLinked:  vacancies.hhVacancyId,
      })
      .from(vacancies)
      .innerJoin(companies, eq(companies.id, vacancies.companyId))
      .leftJoin(hhVacancies, and(eq(hhVacancies.hhVacancyId, vacancies.hhVacancyId), eq(hhVacancies.companyId, vacancies.companyId)))
      .where(and(...conds.filter(Boolean)))
      .orderBy(desc(vacancies.createdAt))
      .limit(500)

    return NextResponse.json({
      items: rows.map(r => ({
        id: r.id, title: r.title, companyId: r.companyId, company: r.company,
        status: r.deletedAt ? "trash" : (r.status ?? "draft"),
        rawStatus: r.status, auto: r.auto, hhStatus: r.hhStatus,
        hhLinked: !!r.hhLinked, createdAt: r.createdAt,
      })),
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
