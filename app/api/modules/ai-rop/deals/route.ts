// GET /api/modules/ai-rop/deals — список сделок-нитей (см. /ai-rop/deals).
// Query: status, counterparty_id, channel, shadow=1.
// Доступ: requireRopTeam. companyId ВСЕГДА из сессии — иначе компания могла
// бы запросить сделки чужого тенанта.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { listDealThreads } from "@/lib/salesradar/deals-feed"

export async function GET(req: Request) {
  try {
    const user = await requireRopTeam()
    const { searchParams } = new URL(req.url)

    const deals = await listDealThreads({
      companyId: user.companyId,
      status: searchParams.get("status") || undefined,
      counterpartyId: searchParams.get("counterparty_id") || undefined,
      channel: searchParams.get("channel") || undefined,
      shadowOnly: searchParams.get("shadow") === "1",
      search: searchParams.get("q") || undefined,
    })

    return NextResponse.json({ ok: true, data: deals })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/deals] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
