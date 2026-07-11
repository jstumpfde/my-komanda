// GET /api/modules/ai-rop/flags — текущие значения dry-run флагов компании.
// POST { dry_run: boolean, kind?: "crm" | "messages" } — переключить. Без kind
// переключает оба (совместимость с простым UI-тумблером «песочница/бой»).
// Доступ: requireRopManage (директор) — системная настройка, влияющая на
// реальные записи в CRM клиента.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, updateRopSettings } from "@/lib/ai-rop/settings"

function summary(row: { dryRunCrm: boolean; dryRunMessages: boolean }) {
  return { dryRunCrm: row.dryRunCrm, dryRunMessages: row.dryRunMessages }
}

export async function GET() {
  try {
    const user = await requireRopManage()
    const row = await getRopSettings(user.companyId)
    return NextResponse.json({ ok: true, ...summary(row) })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/flags] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean; kind?: string }
    if (typeof body.dry_run !== "boolean") return apiError("dry_run (boolean) обязателен", 400)

    const kind = body.kind === "crm" || body.kind === "messages" ? body.kind : undefined
    const patch: { dryRunCrm?: boolean; dryRunMessages?: boolean } = {}
    if (!kind || kind === "crm") patch.dryRunCrm = body.dry_run
    if (!kind || kind === "messages") patch.dryRunMessages = body.dry_run

    const updated = await updateRopSettings(user.companyId, patch)
    return NextResponse.json({ ok: true, ...summary(updated) })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/flags] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
