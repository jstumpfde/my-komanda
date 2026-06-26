// POST /api/modules/hr/vacancies/[id]/funnel-v2-sim
//
// READ-ONLY «сухой прогон» воронки v2 для HR — доступен всем авторизованным
// пользователям платформы на СВОИХ вакансиях (проверка тенанта внутри
// simulateFunnelV2 по companyId). Ничего не пишет в БД.

import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { simulateFunnelV2 } from "@/lib/funnel-v2/simulate"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCompany()
    const { id } = await ctx.params
    const result = await simulateFunnelV2(id, c.companyId)
    if (!result.ok) return NextResponse.json(result, { status: 404 })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }
}
