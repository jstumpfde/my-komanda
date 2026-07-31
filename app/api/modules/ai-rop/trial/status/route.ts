// GET /api/modules/ai-rop/trial/status — состояние пробного периода
// SalesRadar для баннера (см. app/(modules)/ai-rop/_components/trial-banner.tsx)
// и шага 1 мастера подключения. Гейт — requireRopManage: триал/заявка —
// решение директора, как и остальные настройки модуля.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getTrialState, computeEffectiveStatus, daysLeft } from "@/lib/salesradar/trial"

export async function GET() {
  try {
    const user = await requireRopManage()
    const trial = await getTrialState(user.companyId)
    const status = computeEffectiveStatus(trial)
    return NextResponse.json({
      ok: true,
      trial: {
        ...trial,
        status,
        daysLeft: daysLeft(trial),
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/trial/status] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
