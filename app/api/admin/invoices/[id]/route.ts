import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { invoices, companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"
import { sendInvoiceDocument } from "@/lib/billing/send-documents"

type Params = { params: Promise<{ id: string }> }

const ALLOWED_STATUSES = ["pending", "issued", "paid", "cancelled"]

// PATCH /api/admin/invoices/[id] — cross-tenant смена статуса оплаты.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { status } = body as { status?: string }

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return apiError("Недопустимый статус", 400)
  }

  const updateData: Record<string, unknown> = { status }
  if (status === "paid") updateData.paidAt = new Date()
  if (status === "issued") updateData.issuedAt = new Date()

  const [updated] = await db
    .update(invoices)
    .set(updateData)
    .where(eq(invoices.id, id))
    .returning({ id: invoices.id, status: invoices.status, paidAt: invoices.paidAt, companyId: invoices.companyId, periodEnd: invoices.periodEnd })

  if (!updated) return apiError("Счёт не найден", 404)

  // Оплата счёта = активная подписка с известным концом периода.
  if (status === "paid" && updated.periodEnd) {
    await db.update(companies)
      .set({ currentPeriodEnd: new Date(updated.periodEnd), subscriptionStatus: "active", updatedAt: new Date() })
      .where(eq(companies.id, updated.companyId))
  }

  // Авто-отправка закрывающего акта (если включена автоматизация документов).
  if (status === "paid") {
    const [co] = await db.select({ auto: companies.autoInvoiceEnabled }).from(companies).where(eq(companies.id, updated.companyId)).limit(1)
    if (co?.auto) { try { await sendInvoiceDocument(updated.id, "act") } catch { /* не блокируем ответ */ } }
  }

  return apiSuccess({ id: updated.id, status: updated.status, paidAt: updated.paidAt })
}
