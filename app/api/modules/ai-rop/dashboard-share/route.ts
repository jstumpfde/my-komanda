// Управление публичной ссылкой на дашборд AI-РОП (/rop-report/[token]).
//   GET    — текущий активный токен компании (или null)
//   POST   — сгенерировать/перегенерировать (отзывает старый активный)
//   DELETE — отозвать активный токен
// Доступ: requireRopManage (директор) — публикация метрик компании наружу.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getActiveShareToken, regenerateShareToken, revokeShareToken } from "@/lib/ai-rop/dashboard-share"

export async function GET() {
  try {
    const user = await requireRopManage()
    const token = await getActiveShareToken(user.companyId)
    return NextResponse.json({ ok: true, token })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/dashboard-share] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST() {
  try {
    const user = await requireRopManage()
    const token = await regenerateShareToken(user.companyId, user.id ?? null)
    return NextResponse.json({ ok: true, token })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/dashboard-share] POST error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE() {
  try {
    const user = await requireRopManage()
    await revokeShareToken(user.companyId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/dashboard-share] DELETE error:", err)
    return apiError("Internal server error", 500)
  }
}
