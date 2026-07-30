// Platform Admin → AI-РОП → Тарифы: CRUD rop_plans (без DELETE — только
// active=false, как в оригинале call-agent; тариф может быть привязан к
// компании через rop_settings.settings.tokenBilling.planId).
import { NextRequest, NextResponse } from "next/server"
import { asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropPlans } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

interface PlanBody {
  name?: string
  priceMonthly?: number
  priceAnnual?: number | null
  callsLimit?: number
  managersLimit?: number | null
  tokensIncluded?: number | null
  active?: boolean
}

function validatePlan(b: PlanBody): string | null {
  if (!b.name || !String(b.name).trim() || String(b.name).length > 100) return "Название обязательно, до 100 символов"
  const price = Number(b.priceMonthly)
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return "Цена в месяц: 0..10 000 000"
  const calls = Number(b.callsLimit)
  if (!Number.isFinite(calls) || calls < 0 || calls > 1_000_000) return "Лимит звонков: 0..1 000 000"
  return null
}

function normInt(v: unknown): number | null {
  if (v === null || v === undefined || v === ("" as unknown)) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(10_000_000, Math.trunc(n))
}

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const rows = await db.select().from(ropPlans).orderBy(asc(ropPlans.priceMonthly))
    return NextResponse.json({ plans: rows })
  } catch (err) {
    console.error("[platform/ai-rop/plans GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const body = (await req.json().catch(() => ({}))) as PlanBody
    const err = validatePlan(body)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const [row] = await db
      .insert(ropPlans)
      .values({
        name: String(body.name).trim(),
        priceMonthly: Math.trunc(Number(body.priceMonthly)),
        priceAnnual: normInt(body.priceAnnual),
        callsLimit: Math.trunc(Number(body.callsLimit)),
        managersLimit: normInt(body.managersLimit),
        tokensIncluded: normInt(body.tokensIncluded),
        active: body.active !== false,
      })
      .returning()
    return NextResponse.json({ plan: row }, { status: 201 })
  } catch (err) {
    console.error("[platform/ai-rop/plans POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
