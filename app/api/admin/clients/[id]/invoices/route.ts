import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { invoices, plans } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/clients/[id]/invoices — история счетов компании
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  try {
    const rows = await db
      .select({
        id:            invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amountKopecks: invoices.amountKopecks,
        amount:        invoices.amount,
        periodStart:   invoices.periodStart,
        periodEnd:     invoices.periodEnd,
        status:        invoices.status,
        dueDate:       invoices.dueDate,
        paidAt:        invoices.paidAt,
        issuedAt:      invoices.issuedAt,
        paymentMethod: invoices.paymentMethod,
        planId:        invoices.planId,
        planName:      plans.name,
        createdAt:     invoices.createdAt,
      })
      .from(invoices)
      .leftJoin(plans, eq(plans.id, invoices.planId))
      .where(eq(invoices.companyId, id))
      .orderBy(desc(invoices.createdAt))
      .limit(100)

    const data = rows.map(r => ({
      ...r,
      amountRub: r.amountKopecks != null
        ? Math.round(r.amountKopecks / 100)
        : r.amount != null
          ? r.amount
          : null,
    }))

    return apiSuccess(data)
  } catch (err) {
    console.error("[admin/clients/invoices GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
