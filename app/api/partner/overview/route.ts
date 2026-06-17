// GET /api/partner/overview — сводка партнёрского кабинета: число клиентов,
// суммарный MRR, моя комиссия (% по ступени или override, ₽), тип, режим биллинга.
import { requirePartner } from "@/lib/partner/access"
import { getPartnerSummary } from "@/lib/partner/clients"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { integrator } = await requirePartner()
    const s = await getPartnerSummary(integrator)
    return apiSuccess({
      kind: integrator.kind,
      billingMode: integrator.billingMode,
      commissionPercent: s.effectivePercent,
      isOverride: s.isOverride,
      totalClients: s.clients.length,
      activeClients: s.activeClients,
      totalMrrRub: s.totalMrrRub,
      totalEarningsRub: s.totalEarningsRub,
      // Мини-админка: суммарно вакансий/кандидатов по всем клиентам партнёра.
      totalVacancies: s.totalVacancies,
      totalCandidates: s.totalCandidates,
      // Прогресс по уровням (виджет в кабинете).
      currentTierName: s.currentTierName,
      currentTierMinMrrRub: s.currentTierMinMrrRub,
      nextTierName: s.nextTierName,
      nextTierMinMrrRub: s.nextTierMinMrrRub,
      nextTierCommissionPercent: s.nextTierCommissionPercent,
      progressToNextPercent: s.progressToNextPercent,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/overview]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
