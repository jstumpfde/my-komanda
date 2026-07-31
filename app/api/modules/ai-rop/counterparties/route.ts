// GET /api/modules/ai-rop/counterparties — список контрагентов (см.
// /ai-rop/counterparties). Query: q (поиск), kind.
// Доступ: requireRopTeam. companyId ВСЕГДА из сессии.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { listCounterparties } from "@/lib/salesradar/counterparties-feed"

export async function GET(req: Request) {
  try {
    const user = await requireRopTeam()
    const { searchParams } = new URL(req.url)

    const counterparties = await listCounterparties({
      companyId: user.companyId,
      search: searchParams.get("q") || undefined,
      kind: searchParams.get("kind") || undefined,
    })

    return NextResponse.json({ ok: true, data: counterparties })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/counterparties] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
