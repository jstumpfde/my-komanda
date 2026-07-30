import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropPlans } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../../_lib/guard"

export const dynamic = "force-dynamic"

interface PlanPatchBody {
  name?: string
  priceMonthly?: number
  priceAnnual?: number | null
  callsLimit?: number
  managersLimit?: number | null
  tokensIncluded?: number | null
  active?: boolean
}

function normInt(v: unknown): number | null {
  if (v === null || v === undefined || v === ("" as unknown)) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(10_000_000, Math.trunc(n))
}

// PATCH — точечное обновление тарифа (в т.ч. переключатель active).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as PlanPatchBody

    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) {
      if (!String(body.name).trim() || String(body.name).length > 100) {
        return NextResponse.json({ error: "Название обязательно, до 100 символов" }, { status: 400 })
      }
      patch.name = String(body.name).trim()
    }
    if (body.priceMonthly !== undefined) {
      const price = Number(body.priceMonthly)
      if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
        return NextResponse.json({ error: "Цена в месяц: 0..10 000 000" }, { status: 400 })
      }
      patch.priceMonthly = Math.trunc(price)
    }
    if (body.priceAnnual !== undefined) patch.priceAnnual = normInt(body.priceAnnual)
    if (body.callsLimit !== undefined) {
      const calls = Number(body.callsLimit)
      if (!Number.isFinite(calls) || calls < 0 || calls > 1_000_000) {
        return NextResponse.json({ error: "Лимит звонков: 0..1 000 000" }, { status: 400 })
      }
      patch.callsLimit = Math.trunc(calls)
    }
    if (body.managersLimit !== undefined) patch.managersLimit = normInt(body.managersLimit)
    if (body.tokensIncluded !== undefined) patch.tokensIncluded = normInt(body.tokensIncluded)
    if (body.active !== undefined) patch.active = !!body.active

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 })
    }

    const [row] = await db.update(ropPlans).set(patch).where(eq(ropPlans.id, id)).returning()
    if (!row) return NextResponse.json({ error: "Тариф не найден" }, { status: 404 })
    return NextResponse.json({ plan: row })
  } catch (err) {
    console.error("[platform/ai-rop/plans/[id] PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
