import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invoices } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { apiError, requireAuth, requireCompany } from "@/lib/api-helpers"

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
  const isAdmin = user.role === "platform_admin" || user.role === "admin" || user.role === "platform_manager"

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
  return NextResponse.json(updated)
}
