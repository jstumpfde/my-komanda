import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { invoices } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

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
    .returning({ id: invoices.id, status: invoices.status, paidAt: invoices.paidAt })

  if (!updated) return apiError("Счёт не найден", 404)

  return apiSuccess(updated)
}
