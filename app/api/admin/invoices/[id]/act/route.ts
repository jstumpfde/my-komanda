import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { invoices, plans, companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { apiError, requirePlatformAdmin } from "@/lib/api-helpers"
import { renderActHtml } from "@/lib/billing/act-pdf-html"

// GET /api/admin/invoices/[id]/act — закрывающий акт по счёту (cross-tenant, админ).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  const invoice = rows[0]
  if (!invoice) return apiError("Счёт не найден", 404)

  let planName = "—"
  if (invoice.planId) {
    const planRows = await db.select().from(plans).where(eq(plans.id, invoice.planId)).limit(1)
    if (planRows[0]) planName = planRows[0].name
  }

  const companyRows = await db.select().from(companies).where(eq(companies.id, invoice.companyId)).limit(1)
  const company = companyRows[0]

  const html = renderActHtml(invoice, { name: company?.name, inn: company?.inn, kpp: company?.kpp }, planName)
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
