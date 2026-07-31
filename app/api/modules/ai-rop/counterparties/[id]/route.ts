// GET /api/modules/ai-rop/counterparties/[id] — карточка контрагента (см.
// /ai-rop/counterparties/[id]): единая лента касаний по всем каналам +
// «Разложено по сделкам». Доступ: requireRopTeam, companyId из сессии —
// getCounterpartyDetail company-scoped, чужой контрагент даёт 404.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getCounterpartyDetail } from "@/lib/salesradar/counterparties-feed"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await params

    const cp = await getCounterpartyDetail(user.companyId, id)
    if (!cp) return apiError("Контрагент не найден", 404)

    return NextResponse.json({ ok: true, data: cp })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/counterparties/[id]] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
