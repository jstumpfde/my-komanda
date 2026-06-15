// GET /api/partner/overview — сводка партнёрского кабинета: число клиентов,
// суммарный MRR, моя комиссия (% и ₽), тип партнёра, режим биллинга.
import { requirePartner } from "@/lib/partner/access"
import { getPartnerClients, getPartnerCommissionPercent } from "@/lib/partner/clients"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { integrator } = await requirePartner()
    const [clients, commissionPercent] = await Promise.all([
      getPartnerClients(integrator),
      getPartnerCommissionPercent(integrator),
    ])
    const totalMrrRub = clients.reduce((s, c) => s + c.mrrRub, 0)
    const totalEarningsRub = clients.reduce((s, c) => s + c.earningsRub, 0)
    return apiSuccess({
      kind: integrator.kind,
      billingMode: integrator.billingMode,
      commissionPercent,
      totalClients: clients.length,
      activeClients: clients.filter((c) => c.subscriptionStatus === "active").length,
      totalMrrRub,
      totalEarningsRub,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/overview]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
