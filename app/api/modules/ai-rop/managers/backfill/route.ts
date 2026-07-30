// POST /api/modules/ai-rop/managers/backfill?force=true — подтянуть имена
// менеджеров из Bitrix для звонков компании, у которых managerName ещё пуст
// (force=true — перезаписать везде). Доступ: requireRopManage (директор).
import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { backfillManagerNames } from "@/lib/ai-rop/managers"

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const user = await requireRopManage()
    const forceAll = req.nextUrl.searchParams.get("force") === "true"

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    const result = await backfillManagerNames(client, user.companyId, { forceAll })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/managers/backfill] error:", err)
    return apiError("Internal server error", 500)
  }
}
