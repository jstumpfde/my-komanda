import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { invoices, companies } from "@/lib/db/schema"
import { ilike, or, eq, ne, count, desc, and, inArray } from "drizzle-orm"
import { requirePlatformAdmin, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/invoices — cross-tenant список счетов платформы.
// Query params:
//   ?search=    — поиск по номеру счёта или названию компании
//   ?companyId= — фильтр по компании
//   ?status=pending|issued|paid|cancelled — фильтр по статусу оплаты
//   ?page=1&limit=20 — пагинация
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get("search")?.trim() ?? ""
  const companyId = searchParams.get("companyId")?.trim() ?? ""
  const status = searchParams.get("status")?.trim() ?? ""
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  const offset = (page - 1) * limit

  // Поиск по названию компании → ищем подходящие companyId
  let companyIdsFromName: string[] = []
  if (search) {
    const matches = await db
      .select({ id: companies.id })
      .from(companies)
      .where(ilike(companies.name, `%${search}%`))
    companyIdsFromName = matches.map(r => r.id)
  }

  const conditions = []
  if (search) {
    const cond = or(
      ilike(invoices.invoiceNumber, `%${search}%`),
      ...(companyIdsFromName.length > 0 ? [inArray(invoices.companyId, companyIdsFromName)] : []),
    )
    if (cond) conditions.push(cond)
  }
  if (companyId) conditions.push(eq(invoices.companyId, companyId))
  if (status) conditions.push(eq(invoices.status, status))

  // Корзина счетов = аннулированные. Активные — всё, кроме cancelled.
  const trashed = searchParams.get("trashed") === "true"
  conditions.push(trashed ? eq(invoices.status, "cancelled") : ne(invoices.status, "cancelled"))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [{ total }] = await db
    .select({ total: count() })
    .from(invoices)
    .where(whereClause)

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      companyId: invoices.companyId,
      amountKopecks: invoices.amountKopecks,
      amount: invoices.amount,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      status: invoices.status,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      issuedAt: invoices.issuedAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(whereClause)
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset)

  const companyIds = [...new Set(rows.map(r => r.companyId))]
  const companyRows = companyIds.length > 0
    ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds))
    : []
  const companyMap = new Map(companyRows.map(c => [c.id, c.name]))

  const data = rows.map(r => ({
    ...r,
    // Сумма в рублях: amount_kopecks приоритетнее (в копейках), иначе amount (в рублях)
    amountRub: r.amountKopecks != null ? Math.round(r.amountKopecks / 100) : (r.amount ?? null),
    companyName: companyMap.get(r.companyId) ?? null,
  }))

  return apiSuccess({
    data,
    total: Number(total),
    page,
    totalPages: Math.ceil(Number(total) / limit),
  })
}
