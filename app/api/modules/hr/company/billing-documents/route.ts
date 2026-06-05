import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

// Настройки документооборота компании: email для счетов/актов, бумажные
// оригиналы (флаг + адрес), задел под ЭДО, авто-создание счёта за 7 дней.
// GET   — текущие значения.
// PATCH — частичное сохранение переданных полей.

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({
        billingEmail:          companies.billingEmail,
        paperInvoicesRequired: companies.paperInvoicesRequired,
        paperInvoiceAddress:   companies.paperInvoiceAddress,
        paperInvoiceIndex:     companies.paperInvoiceIndex,
        paperInvoiceCity:      companies.paperInvoiceCity,
        paperInvoiceRecipient: companies.paperInvoiceRecipient,
        autoInvoiceEnabled:    companies.autoInvoiceEnabled,
        edoEnabled:            companies.edoEnabled,
        edoProvider:           companies.edoProvider,
        edoOperatorId:         companies.edoOperatorId,
        // Для кнопок «подтянуть из адреса компании»:
        postalAddress:         companies.postalAddress,
        legalAddress:          companies.legalAddress,
        city:                  companies.city,
        postalCode:            companies.postalCode,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    if (!row) return apiError("Company not found", 404)
    return apiSuccess(row)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const updates: Record<string, unknown> = {}
    if (typeof body.billingEmail === "string")          updates.billingEmail = body.billingEmail.trim() || null
    if (typeof body.paperInvoicesRequired === "boolean") updates.paperInvoicesRequired = body.paperInvoicesRequired
    if (typeof body.paperInvoiceAddress === "string")    updates.paperInvoiceAddress = body.paperInvoiceAddress.trim() || null
    if (typeof body.paperInvoiceIndex === "string")      updates.paperInvoiceIndex = body.paperInvoiceIndex.trim() || null
    if (typeof body.paperInvoiceCity === "string")       updates.paperInvoiceCity = body.paperInvoiceCity.trim() || null
    if (typeof body.paperInvoiceRecipient === "string")  updates.paperInvoiceRecipient = body.paperInvoiceRecipient.trim() || null
    if (typeof body.autoInvoiceEnabled === "boolean")    updates.autoInvoiceEnabled = body.autoInvoiceEnabled
    if (typeof body.edoEnabled === "boolean")            updates.edoEnabled = body.edoEnabled
    if (typeof body.edoProvider === "string")            updates.edoProvider = body.edoProvider.trim() || null
    if (typeof body.edoOperatorId === "string")          updates.edoOperatorId = body.edoOperatorId.trim() || null

    if (Object.keys(updates).length === 0) return apiError("Нет полей для обновления", 400)

    updates.updatedAt = new Date()
    const [r] = await db.update(companies)
      .set(updates)
      .where(eq(companies.id, user.companyId))
      .returning({ id: companies.id })
    if (!r) return apiError("Company not found", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PATCH /company/billing-documents]", err)
    return apiError("Internal server error", 500)
  }
}
