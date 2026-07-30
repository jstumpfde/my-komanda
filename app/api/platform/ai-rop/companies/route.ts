// Platform Admin → AI-РОП → Токены: список компаний с балансом токенов.
// getAllBalances() в оригинале call-agent жил в lib/tokens.ts — здесь НЕ
// добавляем его в lib/ai-rop/tokens.ts (зона агента "libs-db", только импорт),
// поэтому баланс считаем прямым groupBy по rop_token_ledger.
import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, ropTokenLedger, ropPlans } from "@/lib/db/schema"
import { requireAiRopAdmin, isGateResponse } from "../_lib/guard"

export const dynamic = "force-dynamic"

export async function GET() {
  const gate = await requireAiRopAdmin()
  if (isGateResponse(gate)) return gate

  try {
    const [balanceRows, companyRows, plans] = await Promise.all([
      db
        .select({
          companyId: ropTokenLedger.tenantId,
          balance: sql<number>`COALESCE(SUM(${ropTokenLedger.delta}), 0)::int`,
        })
        .from(ropTokenLedger)
        .groupBy(ropTokenLedger.tenantId),
      db
        .select({ id: companies.id, name: companies.name, enabledModules: companies.enabledModules })
        .from(companies)
        .orderBy(companies.name),
      db.select().from(ropPlans).orderBy(ropPlans.priceMonthly),
    ])

    const balanceByCompany = new Map(balanceRows.map((r) => [r.companyId, Number(r.balance)]))
    const list = companyRows.map((c) => ({
      id: c.id,
      name: c.name,
      aiRopEnabled: Array.isArray(c.enabledModules) && c.enabledModules.includes("ai_rop"),
      balance: balanceByCompany.get(c.id) ?? 0,
    }))

    return NextResponse.json({ companies: list, plans })
  } catch (err) {
    console.error("[platform/ai-rop/companies GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
