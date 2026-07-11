// Platform Admin → AI-РОП → Рефералы: простой список + создание rop_referrals.
import { NextRequest, NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropReferrals, companies } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

interface ReferralBody {
  code?: string
  name?: string | null
  tenantId?: string | null
  maxUses?: number | null
  discountPct?: number
  expiresAt?: string | null
}

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const rows = await db
      .select({
        id: ropReferrals.id,
        code: ropReferrals.code,
        name: ropReferrals.name,
        tenantId: ropReferrals.tenantId,
        tenantName: companies.name,
        usesCount: ropReferrals.usesCount,
        maxUses: ropReferrals.maxUses,
        discountPct: ropReferrals.discountPct,
        expiresAt: ropReferrals.expiresAt,
        createdAt: ropReferrals.createdAt,
      })
      .from(ropReferrals)
      .leftJoin(companies, eq(companies.id, ropReferrals.tenantId))
      .orderBy(desc(ropReferrals.createdAt))
    return NextResponse.json({ referrals: rows })
  } catch (err) {
    console.error("[platform/ai-rop/referrals GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const body = (await req.json().catch(() => ({}))) as ReferralBody
    const code = String(body.code ?? "").trim()
    if (!code || code.length > 64) return NextResponse.json({ error: "Код обязателен, до 64 символов" }, { status: 400 })
    const discount = Number(body.discountPct ?? 0)
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return NextResponse.json({ error: "Скидка: 0..100%" }, { status: 400 })
    }
    const maxUses = body.maxUses != null ? Number(body.maxUses) : null
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
      return NextResponse.json({ error: "Лимит использований должен быть положительным" }, { status: 400 })
    }

    const [row] = await db
      .insert(ropReferrals)
      .values({
        code,
        name: body.name ? String(body.name).trim() : null,
        tenantId: body.tenantId || null,
        maxUses: maxUses != null ? Math.trunc(maxUses) : null,
        discountPct: Math.trunc(discount),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning()
    return NextResponse.json({ referral: row }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500
    console.error("[platform/ai-rop/referrals POST]", err)
    return NextResponse.json({ error: status === 409 ? "Такой код уже существует" : "internal" }, { status })
  }
}
