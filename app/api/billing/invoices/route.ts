import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invoices, subscriptionHistory, companies, plans } from "@/lib/db/schema"
import { eq, count } from "drizzle-orm"
import { apiError, requireCompany } from "@/lib/api-helpers"

export async function GET() {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.companyId, user.companyId))
    .orderBy(invoices.createdAt)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const body = await req.json().catch(() => ({}))
  const { planId } = body as { planId?: string }

  // Get plan info for amount
  let plan = null
  if (planId) {
    const rows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    plan = rows[0] ?? null
  }

  if (!plan) {
    return apiError("Тариф не найден", 404)
  }

  // Generate invoice number MK-{year}-{ZZZZZ}
  const year = new Date().getFullYear()
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(invoices)

  const num = String(Number(existingCount) + 1).padStart(5, "0")
  const number = `MK-${year}-${num}`

  const now = new Date()
  const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId:     user.companyId,
      invoiceNumber: number,
      planId:        planId ?? null,
      amountKopecks: plan.price,
      status:        "issued",
      issuedAt:      now,
      dueDate,
    })
    .returning()

  // Create subscription_history entry
  await db.insert(subscriptionHistory).values({
    companyId: user.companyId,
    planId:    planId ?? null,
    status:    "invoiced",
    startedAt: now,
  })

  return NextResponse.json(invoice, { status: 201 })
}
