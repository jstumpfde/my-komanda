import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies, invoices, plans, subscriptionHistory } from "@/lib/db/schema"
import { and, eq, gte, lte, isNotNull, count, desc } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { sendInvoiceDocument } from "@/lib/billing/send-documents"

// POST /api/cron/auto-invoices — за 7 календарных дней до конца оплаченного
// периода формирует счёт на продление для компаний с auto_invoice_enabled.
// ПИСЬМО НЕ ШЛЁТ (отправка — отдельный шаг). Per-company флаг = безопасный гейт.
// Расписание (раз в сутки):
//   0 6 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/auto-invoices >> /var/log/auto-invoices.log 2>&1

function monthsFromPeriod(start: string | null, end: string | null): number {
  if (!start || !end) return 1
  const d = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  return d > 300 ? 12 : d > 75 ? 3 : 1
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const due = await db
    .select({
      id: companies.id,
      currentPlanId: companies.currentPlanId,
      planId: companies.planId,
      currentPeriodEnd: companies.currentPeriodEnd,
    })
    .from(companies)
    .where(and(
      eq(companies.autoInvoiceEnabled, true),
      eq(companies.subscriptionStatus, "active"),
      isNotNull(companies.currentPeriodEnd),
      gte(companies.currentPeriodEnd, now),
      lte(companies.currentPeriodEnd, in7),
    ))

  const results: Array<Record<string, unknown>> = []

  for (const c of due) {
    const planId = c.currentPlanId ?? c.planId
    if (!planId || !c.currentPeriodEnd) { results.push({ company: c.id, skipped: "нет тарифа/периода" }); continue }

    const nextStart = c.currentPeriodEnd.toISOString().split("T")[0]

    // Уже есть счёт на следующий период?
    const existing = await db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.companyId, c.id), gte(invoices.periodStart, nextStart)))
      .limit(1)
    if (existing.length) { results.push({ company: c.id, skipped: "счёт на продление уже есть" }); continue }

    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    if (!plan) { results.push({ company: c.id, skipped: "тариф не найден" }); continue }

    const [last] = await db.select({ ps: invoices.periodStart, pe: invoices.periodEnd })
      .from(invoices)
      .where(and(eq(invoices.companyId, c.id), eq(invoices.status, "paid")))
      .orderBy(desc(invoices.createdAt)).limit(1)
    const months = monthsFromPeriod(last?.ps ?? null, last?.pe ?? null)

    const newEnd = new Date(c.currentPeriodEnd)
    newEnd.setMonth(newEnd.getMonth() + months)
    const amount = (plan.price ?? 0) * months

    const [{ value: cnt }] = await db.select({ value: count() }).from(invoices)
    const number = `MK-${now.getFullYear()}-${String(Number(cnt) + 1).padStart(5, "0")}`
    const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const [inv] = await db.insert(invoices).values({
      companyId: c.id,
      invoiceNumber: number,
      planId,
      amountKopecks: amount,
      amount,
      status: "issued",
      issuedAt: now,
      dueDate,
      periodStart: nextStart,
      periodEnd: newEnd.toISOString().split("T")[0],
      notes: "Автосчёт на продление",
    }).returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })

    await db.insert(subscriptionHistory).values({
      companyId: c.id, planId, event: "auto_invoice_created",
      details: { invoiceId: inv.id, months, periodStart: nextStart },
    })

    // Отправка счёта на email (на стейджинге/деве реально не уходит).
    let emailed = false, emailReason: string | undefined
    try {
      const r = await sendInvoiceDocument(inv.id, "invoice")
      emailed = r.sent; emailReason = r.reason
    } catch (e) { emailReason = e instanceof Error ? e.message : String(e) }

    results.push({ company: c.id, created: inv.invoiceNumber, months, emailed, emailReason })
  }

  const created = results.filter(r => r.created).length
  console.log(`[auto-invoices] due=${due.length} created=${created}`)
  return NextResponse.json({ at: now.toISOString(), due: due.length, created, results })
}
