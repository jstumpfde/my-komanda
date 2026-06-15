// Карточка клиента у партнёра:
// GET    — название + список продуктов с флагом включения.
// PATCH  — задать набор включённых продуктов { moduleSlugs }.
// DELETE — отвязать клиента (integrator_clients.status='cancelled').
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, integratorClients } from "@/lib/db/schema"
import { requirePartner, assertPartnerOwnsClient } from "@/lib/partner/access"
import { getClientProducts, setClientModules } from "@/lib/partner/clients"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { integrator } = await requirePartner()
    const { companyId } = await params
    await assertPartnerOwnsClient(integrator.id, companyId)
    const [company] = await db.select({ name: companies.name, brandName: companies.brandName }).from(companies).where(eq(companies.id, companyId)).limit(1)
    const products = await getClientProducts(companyId)
    return apiSuccess({ name: (company?.brandName || company?.name || "").trim(), products })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/client GET]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { integrator } = await requirePartner()
    const { companyId } = await params
    await assertPartnerOwnsClient(integrator.id, companyId)
    const body = (await req.json().catch(() => ({}))) as { moduleSlugs?: unknown }
    const slugs = Array.isArray(body.moduleSlugs) ? body.moduleSlugs.filter((s): s is string => typeof s === "string") : []
    await setClientModules(companyId, slugs)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/client PATCH]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const { integrator } = await requirePartner()
    const { companyId } = await params
    await assertPartnerOwnsClient(integrator.id, companyId)
    await db.update(integratorClients)
      .set({ status: "cancelled" })
      .where(and(eq(integratorClients.integratorId, integrator.id), eq(integratorClients.clientCompanyId, companyId)))
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/client DELETE]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
