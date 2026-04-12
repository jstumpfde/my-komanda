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

  try {
    const body = await req.json().catch(() => ({}))
    const { planId, period } = body as {
      planId?: string
      period?: "month" | "quarter" | "year"
    }

    if (!planId) return apiError("planId обязателен", 400)

    const rows = await db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1)
    const plan = rows[0] ?? null

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
    const dueDateVal = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const dueDateStr = dueDateVal.toISOString().split("T")[0]

    const periodMonths =
      period === "year" ? 12 : period === "quarter" ? 3 : 1
    const periodStartStr = now.toISOString().split("T")[0]
    const periodEndDate = new Date(now)
    periodEndDate.setMonth(periodEndDate.getMonth() + periodMonths)
    const periodEndStr = periodEndDate.toISOString().split("T")[0]

    const multipliedAmount = (plan.price ?? 0) * periodMonths

    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId: user.companyId,
        invoiceNumber: number,
        planId: planId ?? null,
        amountKopecks: multipliedAmount,
        amount: multipliedAmount,
        status: "issued",
        issuedAt: now,
        dueDate: dueDateStr,
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
      })
      .returning()

    // Create subscription_history entry
    await db.insert(subscriptionHistory).values({
      companyId: user.companyId,
      planId: planId ?? null,
      event: "invoice_created",
      details: { invoiceId: invoice.id, amount: multipliedAmount, period },
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (err) {
    console.error("[billing/invoices POST]", err)
    return apiError("Ошибка создания счёта", 500)
  }
}
