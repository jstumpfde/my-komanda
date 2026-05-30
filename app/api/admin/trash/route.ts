import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { companies, users, invoices } from "@/lib/db/schema"
import { eq, isNotNull, desc, inArray } from "drizzle-orm"
import { requirePlatformAdmin, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/trash — единая корзина платформы.
// Собирает в одном месте всё удалённое: компании (deleted_at), пользователи
// (deleted_at) и аннулированные счета (status='cancelled'). Восстановление —
// через существующие роуты /api/admin/{clients,users,invoices}/[id].
export async function GET(_req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const trashedCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      inn: companies.inn,
      deletedAt: companies.deletedAt,
    })
    .from(companies)
    .where(isNotNull(companies.deletedAt))
    .orderBy(desc(companies.deletedAt))

  const trashedUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      companyId: users.companyId,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(isNotNull(users.deletedAt))
    .orderBy(desc(users.deletedAt))

  const trashedInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      companyId: invoices.companyId,
      amountKopecks: invoices.amountKopecks,
      amount: invoices.amount,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.status, "cancelled"))
    .orderBy(desc(invoices.createdAt))

  // Названия компаний для пользователей и счетов
  const companyIds = [
    ...new Set([
      ...trashedUsers.map((u) => u.companyId),
      ...trashedInvoices.map((i) => i.companyId),
    ].filter((id): id is string => !!id)),
  ]
  const companyRows =
    companyIds.length > 0
      ? await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(inArray(companies.id, companyIds))
      : []
  const companyMap = new Map(companyRows.map((c) => [c.id, c.name]))

  return apiSuccess({
    companies: trashedCompanies,
    users: trashedUsers.map((u) => ({
      ...u,
      companyName: u.companyId ? companyMap.get(u.companyId) ?? null : null,
    })),
    invoices: trashedInvoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      companyId: i.companyId,
      companyName: i.companyId ? companyMap.get(i.companyId) ?? null : null,
      amountRub:
        i.amountKopecks != null ? Math.round(i.amountKopecks / 100) : i.amount ?? null,
      createdAt: i.createdAt,
    })),
    counts: {
      companies: trashedCompanies.length,
      users: trashedUsers.length,
      invoices: trashedInvoices.length,
      total:
        trashedCompanies.length + trashedUsers.length + trashedInvoices.length,
    },
  })
}
