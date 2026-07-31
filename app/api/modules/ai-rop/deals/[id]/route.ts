// GET /api/modules/ai-rop/deals/[id] — карточка сделки-нити (см.
// /ai-rop/deals/[id]): шапка, лента сообщений нити, факты по сделке.
// Доступ: requireRopTeam. companyId из сессии — getDealThreadDetail
// company-scoped, чужая сделка даёт 404, не утечку.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getDealThreadDetail } from "@/lib/salesradar/deals-feed"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await params

    const deal = await getDealThreadDetail(user.companyId, id)
    if (!deal) return apiError("Сделка не найдена", 404)

    return NextResponse.json({ ok: true, data: deal })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/deals/[id]] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
