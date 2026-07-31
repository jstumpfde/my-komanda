// POST /api/modules/ai-rop/trial/request — «Оставить заявку на подключение»
// из баннера триала. Пишет лид (см. lib/salesradar/trial.ts::submitTrialRequest)
// + Telegram-алерт владельцу платформы. Гейт — requireRopManage.
import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { submitTrialRequest } from "@/lib/salesradar/trial"

export async function POST(req: NextRequest) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { contact?: string; comment?: string }
    await submitTrialRequest(user.companyId, { contact: body.contact, comment: body.comment })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/trial/request] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
