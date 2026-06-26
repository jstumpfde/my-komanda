// POST /api/platform/funnel-v2-sim
//
// READ-ONLY диагностика воронки v2 (сухой прогон). Платформенный доступ по
// X-Platform-Admin-Key. Логика — в lib/funnel-v2/simulate.ts (общая с HR-эндпоинтом).
// Body: { vacancyId, companyId }.

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformKey } from "@/lib/platform/auth"
import { simulateFunnelV2 } from "@/lib/funnel-v2/simulate"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requirePlatformKey(req)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { vacancyId?: string; companyId?: string }
  if (!body.vacancyId || !body.companyId) {
    return NextResponse.json({ error: "vacancyId и companyId обязательны" }, { status: 400 })
  }

  const result = await simulateFunnelV2(body.vacancyId, body.companyId)
  if (!result.ok) return NextResponse.json(result, { status: 404 })
  return NextResponse.json(result)
}
