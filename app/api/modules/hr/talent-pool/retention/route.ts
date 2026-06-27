// Резерв: срок хранения архивных записей до авто-перемещения в Корзину.
// GET   → { retentionMonths } (дефолт 5; 0 = «никогда не удалять»).
// PATCH { retentionMonths } — сохранить в companies.hiring_defaults_json.
// Cron talent-pool-cleanup использует это значение.
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

const DEFAULT_MONTHS = 5

export async function GET() {
  try {
    const user = await requireCompany()
    const [co] = await db.select({ defaults: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, user.companyId))
    const m = co?.defaults?.reserveRetentionMonths
    return NextResponse.json({ retentionMonths: m === undefined || m === null ? DEFAULT_MONTHS : m })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const { retentionMonths } = (await req.json().catch(() => ({}))) as { retentionMonths?: number }
    const m = Math.max(0, Math.min(60, Math.round(Number(retentionMonths) || 0)))
    const [co] = await db.select({ defaults: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, user.companyId))
    const defaults = { ...(co?.defaults ?? {}), reserveRetentionMonths: m }
    await db.update(companies).set({ hiringDefaultsJson: defaults }).where(eq(companies.id, user.companyId))
    return NextResponse.json({ ok: true, retentionMonths: m })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
