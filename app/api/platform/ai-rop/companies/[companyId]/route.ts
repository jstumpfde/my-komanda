// Platform Admin → AI-РОП → Токены → карточка компании.
// GET   — баланс + история (леджер) + сводка периода + настройки биллинга.
// POST  — операция с токенами: topup | adjust | promo | grant_plan.
// PATCH — настройки биллинга компании (enforce/lowThreshold/periodEnd/planId/autoRenew/notify).
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import {
  getBalance, getLedger, getPeriodSummary, addTokens, applyPromoTokens,
  grantPlanTokens, getTokenSettings, setTokenSettings,
} from "@/lib/ai-rop/tokens"
import { requireAiRopAdmin, isGateResponse } from "../../_lib/guard"

export const dynamic = "force-dynamic"

async function loadCompanyName(companyId: string): Promise<string | null> {
  const [row] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1)
  return row?.name ?? null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate

  try {
    const { companyId } = await params
    const companyName = await loadCompanyName(companyId)
    if (!companyName) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })

    const sp = req.nextUrl.searchParams
    const from = sp.get("from") ? new Date(sp.get("from")!) : undefined
    const to = sp.get("to") ? new Date(sp.get("to")!) : undefined

    const [balance, ledger, summary, settings] = await Promise.all([
      getBalance(companyId),
      getLedger(companyId, { from, to, limit: 300 }),
      getPeriodSummary(companyId, from, to),
      getTokenSettings(companyId),
    ])

    return NextResponse.json({ companyId, companyName, balance, ledger, summary, settings })
  } catch (err) {
    console.error("[platform/ai-rop/companies/[id] GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

interface TokenActionBody {
  action?: string
  amount?: number
  delta?: number
  note?: string
  code?: string
  planId?: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate

  try {
    const { companyId } = await params
    const companyName = await loadCompanyName(companyId)
    if (!companyName) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as TokenActionBody
    const note = typeof body.note === "string" ? body.note.slice(0, 300) : undefined

    if (body.action === "topup") {
      const amount = Math.trunc(Number(body.amount))
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
        return NextResponse.json({ error: "amount должен быть 1..10000000" }, { status: 400 })
      }
      await addTokens(companyId, amount, "topup", { note: note ?? `Ручное пополнение +${amount}` })
    } else if (body.action === "adjust") {
      const delta = Math.trunc(Number(body.delta))
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 10_000_000) {
        return NextResponse.json({ error: "delta должен быть ненулевым, |delta| ≤ 10000000" }, { status: 400 })
      }
      await addTokens(companyId, delta, "manual", { note: note ?? `Ручная корректировка ${delta > 0 ? "+" : ""}${delta}` })
    } else if (body.action === "promo") {
      const code = String(body.code ?? "").trim()
      if (!code) return NextResponse.json({ error: "Введите код промокода" }, { status: 400 })
      const res = await applyPromoTokens(companyId, code)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    } else if (body.action === "grant_plan") {
      const planId = String(body.planId ?? "")
      if (!planId) return NextResponse.json({ error: "Выберите тариф" }, { status: 400 })
      const res = await grantPlanTokens(companyId, planId, note)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    } else {
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 })
    }

    const balance = await getBalance(companyId)
    return NextResponse.json({ companyId, balance })
  } catch (err) {
    console.error("[platform/ai-rop/companies/[id] POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

interface BillingPatchBody {
  enforce?: boolean
  lowThreshold?: number
  periodEnd?: string | null
  notifyEnabled?: boolean
  notifyEmails?: string[]
  planId?: string | null
  autoRenew?: boolean
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate

  try {
    const { companyId } = await params
    const companyName = await loadCompanyName(companyId)
    if (!companyName) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as BillingPatchBody
    const next = await setTokenSettings(companyId, {
      enforce: typeof body.enforce === "boolean" ? body.enforce : undefined,
      lowThreshold: body.lowThreshold != null ? Number(body.lowThreshold) : undefined,
      periodEnd: body.periodEnd !== undefined ? body.periodEnd : undefined,
      notifyEnabled: typeof body.notifyEnabled === "boolean" ? body.notifyEnabled : undefined,
      notifyEmails: Array.isArray(body.notifyEmails) ? body.notifyEmails : undefined,
      planId: body.planId !== undefined ? body.planId : undefined,
      autoRenew: typeof body.autoRenew === "boolean" ? body.autoRenew : undefined,
    })
    const balance = await getBalance(companyId)
    return NextResponse.json({ companyId, balance, settings: next })
  } catch (err) {
    console.error("[platform/ai-rop/companies/[id] PATCH]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
