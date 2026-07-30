// GET /api/modules/ai-rop/bitrix-activities — метка последнего забора email/чатов
// (rop_settings.settings.activitiesLastFetchedAt).
// POST — ручной запуск забора встреч/email/Open Lines-чатов (fetchEmailAndChats),
// без since — тянет всю доступную историю (ограничено лимитом за прогон).
// Доступ: requireRopManage (директор).
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, getSettingsJson, patchSettingsJson, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { fetchEmailAndChats, resolveActivitiesSince } from "@/lib/ai-rop/bitrix-activities"
import { toLegacySaveInteractionFn } from "@/lib/ai-rop/interaction-source"

export const maxDuration = 300

export async function GET() {
  try {
    const user = await requireRopManage()
    const row = await getRopSettings(user.companyId)
    const json = getSettingsJson(row)
    return NextResponse.json({ ok: true, lastFetchedAt: json.activitiesLastFetchedAt ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/bitrix-activities] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { since?: string | null; limit?: number }

    const settingsRow = await getRopSettings(user.companyId)
    const bitrixConfig = toBitrixConfig(settingsRow)
    if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
    const client = createBitrixClient(bitrixConfig)

    // Явный since от пользователя (ручной запуск с конкретной даты) уходит как есть —
    // overlap/reset-защита нужна только для автоматически сохранённого курсора.
    const since = body.since !== undefined
      ? body.since
      : resolveActivitiesSince(getSettingsJson(settingsRow).activitiesLastFetchedAt ?? null)

    const result = await fetchEmailAndChats(
      client,
      { tenantId: 1, since, limit: body.limit ?? 200 },
      toLegacySaveInteractionFn(user.companyId),
    )
    await patchSettingsJson(user.companyId, { activitiesLastFetchedAt: new Date().toISOString() })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/bitrix-activities] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
