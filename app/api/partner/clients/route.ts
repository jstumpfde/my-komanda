// GET  /api/partner/clients — список клиентов текущего партнёра (только своих).
// POST /api/partner/clients — партнёр сам создаёт клиента (компания + директор + продукты).
import { NextRequest } from "next/server"
import { requirePartner, assertPartnerCanManage } from "@/lib/partner/access"
import { getPartnerSummary } from "@/lib/partner/clients"
import { createClientForPartner, type OnboardInput } from "@/lib/partner/onboard"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET() {
  try {
    const { integrator } = await requirePartner()
    const { clients } = await getPartnerSummary(integrator)
    return apiSuccess({ clients })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/clients GET]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, integrator } = await requirePartner()
    assertPartnerCanManage(integrator.kind) // реферал не онбордит клиентов
    const body = (await req.json().catch(() => ({}))) as Partial<OnboardInput>
    const result = await createClientForPartner(integrator, user.id, {
      companyName: body.companyName ?? "",
      directorEmail: body.directorEmail ?? "",
      directorName: body.directorName,
      moduleSlugs: Array.isArray(body.moduleSlugs) ? body.moduleSlugs : [],
    })
    return apiSuccess(result, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[partner/clients POST]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
