import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropPromos } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../../_lib/guard"

export const dynamic = "force-dynamic"

interface PromoPatchBody {
  description?: string | null
  discountPct?: number
  bonusCalls?: number
  bonusTokens?: number
  maxUses?: number | null
  expiresAt?: string | null
  active?: boolean
}

// PATCH — редактирование промокода (в т.ч. переключатель active). Код и счётчик
// использований (usesCount) через этот роут не меняются — usesCount растёт
// только через applyPromoTokens при реальном применении.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as PromoPatchBody

    const patch: Record<string, unknown> = {}
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null
    if (body.discountPct !== undefined) {
      const v = Number(body.discountPct)
      if (!Number.isFinite(v) || v < 0 || v > 100) return NextResponse.json({ error: "Скидка: 0..100%" }, { status: 400 })
      patch.discountPct = Math.trunc(v)
    }
    if (body.bonusCalls !== undefined) {
      const v = Number(body.bonusCalls)
      if (!Number.isFinite(v) || v < 0 || v > 100_000) return NextResponse.json({ error: "Бонус звонков: 0..100000" }, { status: 400 })
      patch.bonusCalls = Math.trunc(v)
    }
    if (body.bonusTokens !== undefined) {
      const v = Number(body.bonusTokens)
      if (!Number.isFinite(v) || v < 0 || v > 10_000_000) return NextResponse.json({ error: "Бонус токенов: 0..10 000 000" }, { status: 400 })
      patch.bonusTokens = Math.trunc(v)
    }
    if (body.maxUses !== undefined) {
      const v = body.maxUses != null ? Number(body.maxUses) : null
      if (v !== null && (!Number.isFinite(v) || v < 1)) return NextResponse.json({ error: "Лимит использований должен быть положительным" }, { status: 400 })
      patch.maxUses = v != null ? Math.trunc(v) : null
    }
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    if (body.active !== undefined) patch.active = !!body.active

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 })
    }

    const [row] = await db.update(ropPromos).set(patch).where(eq(ropPromos.id, id)).returning()
    if (!row) return NextResponse.json({ error: "Промокод не найден" }, { status: 404 })
    return NextResponse.json({ promo: row })
  } catch (err) {
    console.error("[platform/ai-rop/promos/[id] PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
