// POST /api/modules/ai-rop/import/bitrix — исторический импорт звонков из Bitrix.
// Body: { fromDate: "YYYY-MM-DD", toDate?, managerIds?: string[], includeServiceCalls?: boolean }
// После вставки cron ai-rop-process подхватит их из pending.
// Доступ: requireRopManage (директор).
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { importCallsFromBitrix } from "@/lib/ai-rop/importer"

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as {
      fromDate?: string
      toDate?: string
      managerIds?: string[]
      includeServiceCalls?: boolean
    }
    if (!body.fromDate) return apiError("fromDate обязателен (YYYY-MM-DD)", 400)

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const result = await importCallsFromBitrix(client, user.companyId, {
      fromDate: body.fromDate,
      toDate: body.toDate,
      managerIds: body.managerIds,
      includeServiceCalls: body.includeServiceCalls,
    })

    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/import/bitrix] error:", err)
    return apiError("Internal server error", 500)
  }
}
