// GET/POST /api/modules/ai-rop/settings — профиль настроек AI-РОП компании:
// Bitrix-подключение (webhook/inbound-токен — секреты, отдаём только хвост),
// глоссарий, модель анализа, настройки «Сравнения с CRM-карточкой», STT
// (Yandex SpeechKit — секрет, write-only, отдаём только хвост из 4 символов),
// параметры дашборда (порог «контактного» звонка, срок хранения аудио, цель
// weekly challenge), таксономия категорий возражений и токен-биллинг (тариф/
// автопродление/пороги). dry-run флаги — отдельный роут /flags (частый
// переключатель, не хотим гонять весь профиль ради одного тумблера).
//
// Доступ: requireRopManage (директор) — и на чтение, и на запись: тут секреты
// (webhook, inbound-токен, Yandex STT-ключ), рядовому менеджеру их видеть незачем.
//
// jsonb-поля (settings.stt/contactThresholdSeconds/recordingsRetentionDays/
// weeklyDoneGoal/objectionTaxonomy) патчатся ОДНИМ read-modify-write внутри
// POST — раньше contactThresholdSeconds делал отдельный getRopSettings+
// updateRopSettings ПОСЛЕ основного патча явных колонок, что при параллельном
// сохранении из двух карточек settings могло потерять один из патчей
// (last-write-wins на весь jsonb-столбец); теперь все jsonb-патчи одного
// запроса объединяются перед единственной записью.
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getRopSettings, getSettingsJson, updateRopSettings, type RopSettingsJson } from "@/lib/ai-rop/settings"
import { getTokenSettings, setTokenSettings, type RopTokenBillingSettings } from "@/lib/ai-rop/tokens"

type RecipientMode = "manager" | "admins"
type ActionMode = "manual" | "auto_approve"
type Severity = "low" | "medium" | "high"
const RECIPIENT_MODES: RecipientMode[] = ["manager", "admins"]
const ACTION_MODES: ActionMode[] = ["manual", "auto_approve"]
const SEVERITIES: Severity[] = ["low", "medium", "high"]

// Держать в синхроне с DEFAULT_RETENTION_DAYS (app/api/cron/ai-rop-process/route.ts)
// и DEFAULT_WEEKLY_GOAL (lib/ai-rop/gamification.ts) — там же дефолты применяются
// на чтении, если в settings.jsonb значения ещё нет.
const DEFAULT_RECORDINGS_RETENTION_DAYS = 30
const DEFAULT_WEEKLY_DONE_GOAL = 50

/** Секрет → «…хвост» (последние 6 символов), null если пусто. */
function maskSecret(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  if (!v) return null
  if (v.length <= 6) return "…" + v
  return "…" + v.slice(-6)
}

/** STT-ключ Yandex — короче хвост (4 символа, как в задаче), null если пусто. */
function maskSttKey(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  if (!v) return null
  if (v.length <= 4) return "…" + v
  return "…" + v.slice(-4)
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
    const stt = json.stt ?? {}

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
        // Write-only секрет — GET отдаёт только факт настройки + короткий хвост,
        // сам ключ на клиент не уходит НИКОГДА (в отличие от bitrixWebhookUrl,
        // который settings/page.tsx передаёт в карточку напрямую как есть).
        stt: {
          yandexApiKeyConfigured: !!stt.yandexApiKey?.trim(),
          yandexApiKeyTail: maskSttKey(stt.yandexApiKey),
          yandexFolderId: stt.yandexFolderId ?? "",
          allowForeignSttFallback: stt.allowForeignSttFallback === true,
        },
        recordingsRetentionDays:
          typeof json.recordingsRetentionDays === "number" ? json.recordingsRetentionDays : DEFAULT_RECORDINGS_RETENTION_DAYS,
        weeklyDoneGoal: typeof json.weeklyDoneGoal === "number" ? json.weeklyDoneGoal : DEFAULT_WEEKLY_DONE_GOAL,
        objectionTaxonomy: Array.isArray(json.objectionTaxonomy) && json.objectionTaxonomy.length > 0 ? json.objectionTaxonomy : null,
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
      // undefined-поле = не менять; null/"" — очистить (write-only секрет, GET его не отдаёт).
      stt?: {
        yandexApiKey?: string | null
        yandexFolderId?: string | null
        allowForeignSttFallback?: boolean
      }
      recordingsRetentionDays?: number | null
      weeklyDoneGoal?: number | null
      objectionTaxonomy?: Array<{ name: string; def: string }> | null
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

    // Один read-modify-write на ВСЕ jsonb-поля этого запроса (см. докблок файла —
    // раньше contactThresholdSeconds патчился отдельным вызовом ПОСЛЕ основного,
    // рискуя потерять параллельный патч другой карточки).
    const touchesJsonSettings =
      body.contactThresholdSeconds !== undefined ||
      body.stt !== undefined ||
      body.recordingsRetentionDays !== undefined ||
      body.weeklyDoneGoal !== undefined ||
      body.objectionTaxonomy !== undefined
    if (touchesJsonSettings) {
      const row = await getRopSettings(user.companyId)
      const json = getSettingsJson(row)
      const nextJson: RopSettingsJson = { ...json }

      if (body.contactThresholdSeconds !== undefined) {
        const n = Number(body.contactThresholdSeconds)
        nextJson.contactThresholdSeconds = Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined
      }

      if (body.stt !== undefined) {
        const current = json.stt ?? {}
        const nextStt: NonNullable<RopSettingsJson["stt"]> = { ...current }
        if (body.stt.yandexApiKey !== undefined) {
          nextStt.yandexApiKey = body.stt.yandexApiKey?.trim() || null
        }
        if (body.stt.yandexFolderId !== undefined) {
          nextStt.yandexFolderId = body.stt.yandexFolderId?.trim() || null
        }
        if (body.stt.allowForeignSttFallback !== undefined) {
          nextStt.allowForeignSttFallback = !!body.stt.allowForeignSttFallback
        }
        nextJson.stt = nextStt
      }

      if (body.recordingsRetentionDays !== undefined) {
        const n = Number(body.recordingsRetentionDays)
        if (body.recordingsRetentionDays !== null && (!Number.isFinite(n) || n <= 0)) {
          return apiError("recordingsRetentionDays должен быть положительным числом", 400)
        }
        nextJson.recordingsRetentionDays = body.recordingsRetentionDays === null ? undefined : Math.trunc(n)
      }

      if (body.weeklyDoneGoal !== undefined) {
        const n = Number(body.weeklyDoneGoal)
        if (body.weeklyDoneGoal !== null && (!Number.isFinite(n) || n <= 0)) {
          return apiError("weeklyDoneGoal должен быть положительным числом", 400)
        }
        nextJson.weeklyDoneGoal = body.weeklyDoneGoal === null ? undefined : Math.trunc(n)
      }

      if (body.objectionTaxonomy !== undefined) {
        if (body.objectionTaxonomy === null) {
          nextJson.objectionTaxonomy = undefined
        } else {
          if (!Array.isArray(body.objectionTaxonomy)) return apiError("objectionTaxonomy должен быть массивом", 400)
          const cleaned = body.objectionTaxonomy
            .map((c) => ({ name: String(c?.name ?? "").trim(), def: String(c?.def ?? "").trim() }))
            .filter((c) => c.name)
          nextJson.objectionTaxonomy = cleaned.length > 0 ? cleaned : undefined
        }
      }

      await updateRopSettings(user.companyId, { settings: nextJson })
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
