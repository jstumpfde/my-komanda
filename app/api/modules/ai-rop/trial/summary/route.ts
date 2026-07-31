// GET /api/modules/ai-rop/trial/summary — сводка «Что мы нашли» для шага 3
// мастера подключения (app/(modules)/ai-rop/onboarding). Гейт — requireRopManage.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getTrialSummary } from "@/lib/salesradar/trial"

export async function GET() {
  try {
    const user = await requireRopManage()
    const summary = await getTrialSummary(user.companyId)
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/trial/summary] GET error:", err)
    return apiError("Internal server error", 500)
  }
}
