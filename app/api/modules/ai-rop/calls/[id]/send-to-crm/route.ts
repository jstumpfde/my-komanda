// POST /api/modules/ai-rop/calls/[id]/send-to-crm — вручную повторить запись
// разбора звонка в Bitrix (комментарии в Timeline + обновление Activity).
// Поведение зависит от rop_settings.dryRunCrm/dryRunMessages: dry — payload
// формируется и логируется в rop_crm_write_log, наружу ничего не уходит.
// Доступ: requireRopTeam (директор/head/rop_view_team — не рядовой менеджер).
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { sendCallToBitrix, type AnalysisForCrm, type CallForCrm } from "@/lib/ai-rop/bitrix-write"
import { alreadySentLive, logCrmWrite } from "@/lib/ai-rop/crm-log"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

export const maxDuration = 60

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRopTeam()
    const { id } = await ctx.params
    if (!id) return apiError("id обязателен", 400)

    const [row] = await db
      .select({ call: ropCalls, analysis: ropAnalyses })
      .from(ropCalls)
      .leftJoin(ropAnalyses, eq(ropAnalyses.callId, ropCalls.id))
      .where(and(eq(ropCalls.id, id), eq(ropCalls.tenantId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Звонок не найден", 404)

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const call = row.call
    const analysis = row.analysis
    const callForCrm = {
      id: call.id,
      tenantId: call.tenantId,
      bitrixDealId: call.bitrixDealId,
      bitrixLeadId: call.bitrixLeadId,
      bitrixContactId: call.bitrixContactId,
      bitrixActivityId: call.bitrixActivityId,
      clientPhone: call.clientPhone,
      startedAt: call.startedAt ? call.startedAt.toISOString() : null,
      durationSec: call.durationSec,
      direction: call.direction as "in" | "out" | null,
    } as unknown as CallForCrm
    const analysisForCrm: AnalysisForCrm = {
      summary: analysis?.summary ?? null,
      sentiment: analysis?.sentiment ?? null,
      managerScore: analysis?.managerScore ?? null,
      scriptCompliance: analysis?.scriptCompliance ?? null,
      nextAction: analysis?.nextAction ?? null,
      clientName: analysis?.clientName ?? null,
      detectedProduct: call.detectedProduct ?? null,
      objectionsJson: JSON.stringify(analysis?.objectionsJson ?? []),
      topicsJson: JSON.stringify(analysis?.topicsJson ?? []),
    }

    try {
      const dashboardUrl = `${getAppBaseUrl()}/ai-rop/calls/${id}`
      const results = await sendCallToBitrix({
        client,
        config: bitrixConfig,
        call: callForCrm,
        analysis: analysisForCrm,
        dashboardUrl,
        logWrite: logCrmWrite,
        alreadySent: alreadySentLive,
      })
      return NextResponse.json({ ok: true, results })
    } catch (e) {
      const msg = (e as Error).message
      const safeMsg = msg.includes("Invalid URL") || msg.includes("webhook") ? "Внутренняя ошибка конфигурации" : msg
      return apiError(safeMsg, 500)
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/calls/:id/send-to-crm] error:", err)
    return apiError("Internal server error", 500)
  }
}
