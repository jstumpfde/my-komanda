// POST /api/modules/ai-rop/discrepancies/[id]/resolve
// Body: { action: "accepted" | "rejected" }
//
// Права: директор/head/rop_view_team — любое расхождение компании; обычный
// менеджер — только своё (routedToUserId === свой id).
//
// action='accepted' → applyDiscrepancyToBitrix() ДО обновления статуса (сама
// функция учитывает dry-run и идемпотентность); если Bitrix не подтвердил —
// статус НЕ меняем. Атомарный UPDATE ... WHERE status='pending' защищает от
// повторного резолва гонкой двух запросов.
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropDiscrepancies } from "@/lib/db/schema"
import { apiError, requireCompany } from "@/lib/api-helpers"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { applyDiscrepancyToBitrix } from "@/lib/ai-rop/discrepancy-detector"

export const maxDuration = 30

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const action = body.action
    if (action !== "accepted" && action !== "rejected") {
      return apiError("action должен быть 'accepted' или 'rejected'", 400)
    }

    const [row] = await db
      .select()
      .from(ropDiscrepancies)
      .where(and(eq(ropDiscrepancies.id, id), eq(ropDiscrepancies.tenantId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Расхождение не найдено", 404)

    const isPrivileged = ropCanViewTeam(user)
    if (!isPrivileged && row.routedToUserId !== user.id) {
      return apiError("Доступ запрещён", 403)
    }

    if (action === "accepted") {
      const settingsRow = await getRopSettings(user.companyId)
      const bitrixConfig = toBitrixConfig(settingsRow)
      if (bitrixConfig) {
        try {
          const client = createBitrixClient(bitrixConfig)
          await applyDiscrepancyToBitrix(row, client, bitrixConfig)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(`[ai-rop/discrepancies/:id/resolve] applyDiscrepancyToBitrix #${id}:`, msg)
          return apiError(`Не удалось записать в Bitrix: ${msg}`, 502)
        }
      }
    }

    const updated = await db
      .update(ropDiscrepancies)
      .set({ status: action, resolvedAt: new Date(), resolvedByUserId: user.id })
      .where(and(eq(ropDiscrepancies.id, id), eq(ropDiscrepancies.tenantId, user.companyId), eq(ropDiscrepancies.status, "pending")))
      .returning({ id: ropDiscrepancies.id })

    if (updated.length === 0) return NextResponse.json({ ok: true, alreadyResolved: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/discrepancies/:id/resolve] error:", err)
    return apiError("Internal server error", 500)
  }
}
