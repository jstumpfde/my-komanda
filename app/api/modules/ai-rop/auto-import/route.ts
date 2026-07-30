// GET /api/modules/ai-rop/auto-import — статус автоимпорта (включён/последний запуск).
// POST { enabled?: boolean, runNow?: boolean } — переключить и/или запустить руками.
// runNow игнорирует lastImportAt и всегда тянет последние сутки (см. auto-importer.ts).
// Доступ: requireRopManage (директор).
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { isAutoImportEnabled, setAutoImportEnabled, getLastAutoImport, runAutoImport } from "@/lib/ai-rop/auto-importer"

export const maxDuration = 300

export async function GET() {
  try {
    const user = await requireRopManage()
    const [enabled, last] = await Promise.all([isAutoImportEnabled(user.companyId), getLastAutoImport(user.companyId)])
    return NextResponse.json({ ok: true, enabled, last })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/auto-import] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; runNow?: boolean }

    if (typeof body.enabled === "boolean") {
      await setAutoImportEnabled(user.companyId, body.enabled)
    }

    let runResult = null
    if (body.runNow) {
      const settingsRow = await getRopSettings(user.companyId)
      const bitrixConfig = toBitrixConfig(settingsRow)
      if (!bitrixConfig) return apiError("Bitrix не подключён", 400)
      const client = createBitrixClient(bitrixConfig)
      runResult = await runAutoImport(client, user.companyId, { manual: true })
    }

    const [enabled, last] = await Promise.all([isAutoImportEnabled(user.companyId), getLastAutoImport(user.companyId)])
    return NextResponse.json({ ok: true, enabled, last, runResult })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/auto-import] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
