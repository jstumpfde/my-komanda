// GET/POST /api/modules/ai-rop/settings — профиль настроек AI-РОП компании:
// Bitrix-подключение (webhook/inbound-токен — секреты, отдаём только хвост),
// глоссарий, модель анализа, настройки «Сравнения с CRM-карточкой», порог
// «контактного» звонка (contactThresholdSeconds) и токен-биллинг (тариф/
// автопродление/пороги). dry-run флаги — отдельный роут /flags (частый
// переключатель, не хотим гонять весь профиль ради одного тумблера).
//
// Доступ: requireRopManage (директор) — и на чтение, и на запись: тут секреты
// (webhook, inbound-токен), рядовому менеджеру их видеть незачем.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, getSettingsJson, updateRopSettings } from "@/lib/ai-rop/settings"
import { getTokenSettings, setTokenSettings, type RopTokenBillingSettings } from "@/lib/ai-rop/tokens"

type RecipientMode = "manager" | "admins"
type ActionMode = "manual" | "auto_approve"
type Severity = "low" | "medium" | "high"
const RECIPIENT_MODES: RecipientMode[] = ["manager", "admins"]
const ACTION_MODES: ActionMode[] = ["manual", "auto_approve"]
const SEVERITIES: Severity[] = ["low", "medium", "high"]

/** Секрет → «…хвост» (последние 6 символов), null если пусто. */
function maskSecret(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  if (!v) return null
  if (v.length <= 6) return "…" + v
  return "…" + v.slice(-6)
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export async function GET() {
  try {
    const user = await requireRopManage()
    const row = await getRopSettings(user.companyId)
    const json = getSettingsJson(row)
    const tokenSettings = await getTokenSettings(user.companyId)

    return NextResponse.json({
      ok: true,
      settings: {
        bitrixWebhookConfigured: !!row.bitrixWebhookUrl?.trim(),
        bitrixWebhookUrlTail: maskSecret(row.bitrixWebhookUrl),
        bitrixInboundTokenConfigured: !!row.bitrixInboundToken?.trim(),
        bitrixInboundTokenTail: maskSecret(row.bitrixInboundToken),
        glossary: row.glossary ?? "",
        analysisModel: row.analysisModel ?? null,
        contactThresholdSeconds:
          typeof json.contactThresholdSeconds === "number" ? json.contactThresholdSeconds : 15,
        discrepancy: {
          enabled: row.discrepancyEnabled === true,
          recipientMode: (row.discrepancyRecipientMode as RecipientMode) ?? "manager",
          adminUserIds: parseJsonArray(row.discrepancyAdminUserIds),
          actionMode: (row.discrepancyActionMode as ActionMode) ?? "manual",
          customFields: row.discrepancyCustomFields ? parseJsonArray(row.discrepancyCustomFields) : null,
          severityMin: (row.discrepancySeverityMin as Severity) ?? "medium",
        },
        tokenBilling: tokenSettings,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/settings] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as {
      bitrixWebhookUrl?: string | null
      bitrixInboundToken?: string | null
      glossary?: string | null
      analysisModel?: string | null
      contactThresholdSeconds?: number | null
      discrepancy?: {
        enabled?: boolean
        recipientMode?: RecipientMode
        adminUserIds?: string[]
        actionMode?: ActionMode
        customFields?: string[] | null
        severityMin?: Severity
      }
      tokenBilling?: Partial<RopTokenBillingSettings>
    }

    const patch: Record<string, unknown> = {}
    if (body.bitrixWebhookUrl !== undefined) patch.bitrixWebhookUrl = body.bitrixWebhookUrl?.trim() || null
    if (body.bitrixInboundToken !== undefined) patch.bitrixInboundToken = body.bitrixInboundToken?.trim() || null
    if (body.glossary !== undefined) patch.glossary = body.glossary ?? null
    if (body.analysisModel !== undefined) patch.analysisModel = body.analysisModel?.trim() || null

    if (body.discrepancy) {
      const d = body.discrepancy
      if (d.enabled !== undefined) patch.discrepancyEnabled = !!d.enabled
      if (d.recipientMode !== undefined) {
        if (!RECIPIENT_MODES.includes(d.recipientMode)) return apiError("recipientMode должен быть 'manager' или 'admins'", 400)
        patch.discrepancyRecipientMode = d.recipientMode
      }
      if (d.adminUserIds !== undefined) {
        patch.discrepancyAdminUserIds = JSON.stringify(
          Array.isArray(d.adminUserIds) ? d.adminUserIds.filter((x) => typeof x === "string" && x) : [],
        )
      }
      if (d.actionMode !== undefined) {
        if (!ACTION_MODES.includes(d.actionMode)) return apiError("actionMode должен быть 'manual' или 'auto_approve'", 400)
        patch.discrepancyActionMode = d.actionMode
      }
      if (d.customFields !== undefined) {
        patch.discrepancyCustomFields =
          d.customFields === null
            ? null
            : JSON.stringify(Array.isArray(d.customFields) ? d.customFields.map(String).filter(Boolean) : [])
      }
      if (d.severityMin !== undefined) {
        if (!SEVERITIES.includes(d.severityMin)) return apiError("severityMin должен быть low|medium|high", 400)
        patch.discrepancySeverityMin = d.severityMin
      }
    }

    if (Object.keys(patch).length > 0) {
      await updateRopSettings(user.companyId, patch)
    }

    if (body.contactThresholdSeconds !== undefined) {
      const row = await getRopSettings(user.companyId)
      const json = getSettingsJson(row)
      const n = Number(body.contactThresholdSeconds)
      await updateRopSettings(user.companyId, {
        settings: { ...json, contactThresholdSeconds: Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined },
      })
    }

    if (body.tokenBilling) {
      await setTokenSettings(user.companyId, body.tokenBilling)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/settings] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
