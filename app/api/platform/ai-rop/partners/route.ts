// Platform Admin → AI-РОП → Партнёры: простой список + создание rop_partners.
// Без глубокой логики начисления комиссий (в оригинале call-agent тоже тонко) —
// commissionPct/clientsCount/revenueTotal завести вручную/по мере роста.
import { NextRequest, NextResponse } from "next/server"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropPartners } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

interface PartnerBody {
  name?: string
  email?: string | null
  contact?: string | null
  commissionPct?: number
  refCode?: string | null
  notes?: string | null
}

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const rows = await db.select().from(ropPartners).orderBy(desc(ropPartners.createdAt))
    return NextResponse.json({ partners: rows })
  } catch (err) {
    console.error("[platform/ai-rop/partners GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate
  try {
    const body = (await req.json().catch(() => ({}))) as PartnerBody
    const name = String(body.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "Название/имя обязательно" }, { status: 400 })
    const commission = body.commissionPct != null ? Number(body.commissionPct) : 10
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      return NextResponse.json({ error: "Комиссия: 0..100%" }, { status: 400 })
    }

    const [row] = await db
      .insert(ropPartners)
      .values({
        name,
        email: body.email ? String(body.email).trim() : null,
        contact: body.contact ? String(body.contact).trim() : null,
        commissionPct: Math.trunc(commission),
        refCode: body.refCode ? String(body.refCode).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
      })
      .returning()
    return NextResponse.json({ partner: row }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500
    console.error("[platform/ai-rop/partners POST]", err)
    return NextResponse.json({ error: status === 409 ? "Такой ref_code уже занят" : "internal" }, { status })
  }
}
