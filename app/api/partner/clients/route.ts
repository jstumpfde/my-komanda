// GET /api/partner/clients — список клиентов текущего партнёра (только своих).
import { requirePartner } from "@/lib/partner/access"
import { getPartnerSummary } from "@/lib/partner/clients"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { integrator } = await requirePartner()
    const { clients } = await getPartnerSummary(integrator)
    return apiSuccess({ clients })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/clients]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
