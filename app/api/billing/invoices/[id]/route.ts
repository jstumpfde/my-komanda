import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invoices, companies } from "@/lib/db/schema"
import { sendInvoiceDocument } from "@/lib/billing/send-documents"
import { eq, and } from "drizzle-orm"
import { apiError, requireAuth, requireCompany, requireDirector } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const { id } = await params
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, user.companyId)))
    .limit(1)

  if (!rows[0]) return apiError("Счёт не найден", 404)
  return NextResponse.json(rows[0])
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: Awaited<ReturnType<typeof requireAuth>>
  try {
    user = await requireAuth()
  } catch (e) {
    return e as NextResponse
  }

  // Only platform admins/managers can update invoice status to 'paid'
  const role = user.role as string
  const isAdmin = role === "platform_admin" || role === "admin" || role === "platform_manager"

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { status } = body as { status?: string }

  if (status === "paid" && !isAdmin) {
    return apiError("Forbidden", 403)
  }

  const updateData: Record<string, unknown> = {}
  if (status) updateData.status = status
  if (status === "paid") updateData.paidAt = new Date()

  const [updated] = await db
    .update(invoices)
    .set(updateData)
    .where(eq(invoices.id, id))
    .returning()

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

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireDirector()
  } catch (e) {
    return e as NextResponse
  }

  const { id } = await params
  const [deleted] = await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, user.companyId)))
    .returning({ id: invoices.id })

  if (!deleted) return apiError("Счёт не найден", 404)
  return NextResponse.json({ ok: true })
}
