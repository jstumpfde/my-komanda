// Platform Admin → AI-РОП → Платежи: журнал rop_payments + ручное добавление.
// Реального платёжного шлюза нет (как в оригинале call-agent) — учёт ручной.
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropPayments, companies } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

interface PaymentBody {
  companyId?: string | null
  tenantName?: string | null
  amount?: number
  currency?: string
  plan?: string | null
  status?: string
  paymentMethod?: string | null
  periodFrom?: string | null
  periodTo?: string | null
  notes?: string | null
}

const STATUSES = new Set(["pending", "paid", "failed", "refunded"])

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const rows = await db
      .select({
        id: ropPayments.id,
        tenantId: ropPayments.tenantId,
        tenantName: ropPayments.tenantName,
        companyName: companies.name,
        amount: ropPayments.amount,
        currency: ropPayments.currency,
        plan: ropPayments.plan,
        status: ropPayments.status,
        paymentMethod: ropPayments.paymentMethod,
        periodFrom: ropPayments.periodFrom,
        periodTo: ropPayments.periodTo,
        notes: ropPayments.notes,
        createdAt: ropPayments.createdAt,
      })
      .from(ropPayments)
      .leftJoin(companies, eq(companies.id, ropPayments.tenantId))
      .orderBy(desc(ropPayments.createdAt))
      .limit(300)
    return NextResponse.json({ payments: rows })
  } catch (err) {
    console.error("[platform/ai-rop/payments GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const body = (await req.json().catch(() => ({}))) as PaymentBody
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      return NextResponse.json({ error: "Сумма обязательна: 1..100 000 000" }, { status: 400 })
    }
    const status = body.status && STATUSES.has(body.status) ? body.status : "pending"

    const [row] = await db
      .insert(ropPayments)
      .values({
        tenantId: body.companyId || null,
        tenantName: body.tenantName ? String(body.tenantName).trim() : null,
        amount: Math.trunc(amount),
        currency: body.currency ? String(body.currency).trim().toUpperCase() : "RUB",
        plan: body.plan ? String(body.plan).trim() : null,
        status,
        paymentMethod: body.paymentMethod ? String(body.paymentMethod).trim() : null,
        periodFrom: body.periodFrom || null,
        periodTo: body.periodTo || null,
        notes: body.notes ? String(body.notes).trim() : null,
      })
      .returning()
    return NextResponse.json({ payment: row }, { status: 201 })
  } catch (err) {
    console.error("[platform/ai-rop/payments POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
