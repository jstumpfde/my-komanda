// GET /api/modules/ai-rop/dashboard-share/views — сводка просмотров публичного
// дашборда/отчёта компании (для попапа «Поделиться»). Доступ: requireRopManage.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getViewStats } from "@/lib/ai-rop/report-views"

export async function GET() {
  try {
    const user = await requireRopManage()
    const stats = await getViewStats(user.companyId)
    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/dashboard-share/views] error:", err)
    return apiError("Internal server error", 500)
  }
}
