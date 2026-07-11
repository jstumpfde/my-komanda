// Platform Admin → AI-РОП → Промокоды: список + создание rop_promos.
// Списание бонуса и счётчик usesCount — через applyPromoTokens (lib/ai-rop/tokens.ts),
// вызывается из карточки компании (companies/[companyId] POST action=promo).
import { NextRequest, NextResponse } from "next/server"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropPromos } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

interface PromoBody {
  code?: string
  description?: string | null
  discountPct?: number
  bonusCalls?: number
  bonusTokens?: number
  maxUses?: number | null
  expiresAt?: string | null
  active?: boolean
}

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const rows = await db.select().from(ropPromos).orderBy(desc(ropPromos.createdAt))
    return NextResponse.json({ promos: rows })
  } catch (err) {
    console.error("[platform/ai-rop/promos GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const body = (await req.json().catch(() => ({}))) as PromoBody
    const code = String(body.code ?? "").trim()
    const discount = Number(body.discountPct ?? 0)
    const bonusCalls = Number(body.bonusCalls ?? 0)
    const bonusTokens = Number(body.bonusTokens ?? 0)
    const maxUses = body.maxUses != null ? Number(body.maxUses) : null

    if (!code || code.length > 64) return NextResponse.json({ error: "Код обязателен, до 64 символов" }, { status: 400 })
    if (body.description && String(body.description).length > 1000) {
      return NextResponse.json({ error: "Описание до 1000 символов" }, { status: 400 })
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return NextResponse.json({ error: "Скидка: 0..100%" }, { status: 400 })
    }
    if (!Number.isFinite(bonusCalls) || bonusCalls < 0 || bonusCalls > 100_000) {
      return NextResponse.json({ error: "Бонус звонков: 0..100000" }, { status: 400 })
    }
    if (!Number.isFinite(bonusTokens) || bonusTokens < 0 || bonusTokens > 10_000_000) {
      return NextResponse.json({ error: "Бонус токенов: 0..10 000 000" }, { status: 400 })
    }
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
      return NextResponse.json({ error: "Лимит использований должен быть положительным" }, { status: 400 })
    }

    const [row] = await db
      .insert(ropPromos)
      .values({
        code,
        description: body.description ? String(body.description).trim() : null,
        discountPct: Math.trunc(discount),
        bonusCalls: Math.trunc(bonusCalls),
        bonusTokens: Math.trunc(bonusTokens),
        maxUses: maxUses != null ? Math.trunc(maxUses) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        active: body.active !== false,
      })
      .returning()
    return NextResponse.json({ promo: row }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500
    console.error("[platform/ai-rop/promos POST]", err)
    return NextResponse.json({ error: status === 409 ? "Такой код уже существует" : "internal" }, { status })
  }
}
