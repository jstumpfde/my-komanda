// GET /api/modules/ai-rop/attention — данные экрана «Точки внимания» (см.
// lib/ai-rop/attention.ts). Query: from/to (YYYY-MM-DD), manager_id.
// Доступ: requireRopTeam (директор/head/rop_view_team) — командный экран,
// рядовому менеджеру своей ленты (/ai-rop/my) достаточно.
// tenantId ВСЕГДА берётся из сессии (requireRopTeam), не из query — иначе
// компания могла бы запросить точки внимания чужого тенанта.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { loadAttentionData } from "@/lib/ai-rop/attention"

export async function GET(req: Request) {
  try {
    const user = await requireRopTeam()
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") || undefined
    const to = searchParams.get("to") || undefined
    const managerId = searchParams.get("manager_id") || undefined

    const data = await loadAttentionData({
      tenantId: user.companyId,
      from,
      to,
      managerId,
    })

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/attention] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
