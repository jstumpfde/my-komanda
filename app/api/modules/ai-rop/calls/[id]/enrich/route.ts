// POST /api/modules/ai-rop/calls/[id]/enrich — подтянуть названия сделки/лида/контакта
// из Bitrix (best-effort, каждый вызов в своём try/catch).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient, formatContactName } from "@/lib/ai-rop/bitrix"

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const [row] = await db
      .select({
        bitrixDealId: ropCalls.bitrixDealId,
        bitrixLeadId: ropCalls.bitrixLeadId,
        bitrixContactId: ropCalls.bitrixContactId,
      })
      .from(ropCalls)
      .where(and(eq(ropCalls.id, id), eq(ropCalls.tenantId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Звонок не найден", 404)

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)
    const portalUrl = client.getPortalUrl()

    let dealTitle: string | null = null
    let leadTitle: string | null = null
    let contactName: string | null = null
    const errors: string[] = []

    if (row.bitrixDealId) {
      try {
        const d = await client.crmDealGet(row.bitrixDealId)
        dealTitle = d?.TITLE ?? null
      } catch (e) {
        errors.push(`deal: ${(e as Error).message}`)
      }
    }
    if (row.bitrixLeadId) {
      try {
        const l = await client.crmLeadGet(row.bitrixLeadId)
        leadTitle = l ? l.TITLE || [l.NAME, l.LAST_NAME].filter(Boolean).join(" ") || null : null
      } catch (e) {
        errors.push(`lead: ${(e as Error).message}`)
      }
    }
    if (row.bitrixContactId) {
      try {
        const c = await client.crmContactGet(row.bitrixContactId)
        if (c) contactName = formatContactName(c)
      } catch (e) {
        errors.push(`contact: ${(e as Error).message}`)
      }
    }

    await db
      .update(ropCalls)
      .set({ bitrixDealTitle: dealTitle, bitrixLeadTitle: leadTitle, bitrixContactName: contactName, bitrixPortalUrl: portalUrl })
      .where(and(eq(ropCalls.id, id), eq(ropCalls.tenantId, user.companyId)))

    return NextResponse.json({
      ok: errors.length === 0,
      updated: { dealTitle, leadTitle, contactName, portalUrl },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/:id/enrich] error:", err)
    return apiError("Internal server error", 500)
  }
}
