// GET /api/modules/ai-rop/tokens/status — статус токен-баланса компании (для
// баннера портала). Доступ: директор/head/rop_view_team; рядовому менеджеру
// биллинг не показываем — { show: false }.
import { NextResponse } from "next/server"
import { apiError, requireCompany } from "@/lib/api-helpers"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { getBillingStatus } from "@/lib/ai-rop/tokens"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await requireCompany()
    if (!ropCanViewTeam(user)) return NextResponse.json({ ok: true, show: false })
    const status = await getBillingStatus(user.companyId)
    return NextResponse.json({ ok: true, show: true, ...status })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/tokens/status] error:", err)
    return apiError("Internal server error", 500)
  }
}
