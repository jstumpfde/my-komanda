// POST /api/modules/ai-rop/objections/recluster — пересчитать AI-кластеризацию
// возражений компании (батчами по фиксированной таксономии). Платный AI-вызов —
// доступ requireRopManage (директор), запускается по кнопке.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { computeClusterMap } from "@/lib/ai-rop/objection-clusters"

export const maxDuration = 120

export async function POST() {
  try {
    const user = await requireRopManage()
    const result = await computeClusterMap(user.companyId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/objections/recluster] error:", err)
    return apiError("Internal server error", 500)
  }
}
