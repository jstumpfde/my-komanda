// POST /api/public/rop-webhook — входящий вебхук Bitrix24 AI-РОП (события
// исходящего вебхука портала клиента): OnVoximplantCallEnd (встроенная
// телефония) и ONCRMACTIVITYADD/ONCRMACTIVITYUPDATE (внешняя АТС/звонок как
// Activity). Тело — application/x-www-form-urlencoded (стандарт Bitrix)
// либо JSON.
//
// Компания резолвится ПО ТОКЕНУ (?token= в URL исходящего вебхука ИЛИ
// auth[application_token] в теле) сверкой с rop_settings.bitrixInboundToken —
// НЕ по данным в теле (их подделать может кто угодно). Невалидный/пустой
// токен → 403 без деталей (не палим, настроен ли вообще AI-РОП у кого-то).
//
// GET — health-check для ручной проверки URL в консоли Bitrix.
import { NextResponse } from "next/server"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, ropSettings, type NewRopCall } from "@/lib/db/schema"
import { toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient, entityTypeStringToId } from "@/lib/ai-rop/bitrix"

export const runtime = "nodejs"

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || ""
  if (ct.includes("application/json")) {
    try {
      return (await req.json()) as Record<string, string>
    } catch {
      return {}
    }
  }
  const raw = await req.text()
  return Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const payload = await parseBody(req)

  const queryToken = url.searchParams.get("token")
  const bodyToken = payload["auth[application_token]"] || payload["application_token"]
  const token = queryToken || bodyToken

  if (!token) {
    console.warn("[public/rop-webhook] запрос без токена — отклонён")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [settingsRow] = await db
    .select()
    .from(ropSettings)
    .where(and(eq(ropSettings.bitrixInboundToken, token), ne(ropSettings.bitrixInboundToken, "")))
    .limit(1)
  if (!settingsRow) {
    console.warn("[public/rop-webhook] неизвестный токен — отклонён")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const bitrixConfig = toBitrixConfig(settingsRow)
  if (!bitrixConfig) {
    console.warn(`[public/rop-webhook] компания ${settingsRow.companyId}: bitrixWebhookUrl не настроен`)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const client = createBitrixClient(bitrixConfig)
  const companyId = settingsRow.companyId

  const event = payload["event"] || payload["EVENT"] || ""
  const callId = payload["data[CALL_ID]"] || payload["data[ID]"] || payload["data[FIELDS][ID]"] || ""

  try {
    if (event === "OnVoximplantCallEnd" && callId) {
      await ingestVoxCall(client, companyId, callId)
    } else if ((event === "ONCRMACTIVITYADD" || event === "ONCRMACTIVITYUPDATE") && callId) {
      await ingestCrmActivity(client, companyId, callId)
    } else {
      console.warn(`[public/rop-webhook] неизвестное событие company=${companyId}:`, event, callId)
    }
  } catch (e) {
    console.error(`[public/rop-webhook] company=${companyId}:`, (e as Error).message)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

async function ingestVoxCall(client: ReturnType<typeof createBitrixClient>, companyId: string, bitrixCallId: string): Promise<void> {
  const stat = await client.voxGetStatistic(bitrixCallId)
  if (!stat) {
    console.warn(`[public/rop-webhook] voxGetStatistic(${bitrixCallId}) → null (company ${companyId})`)
    return
  }

  const recordingUrl = stat.CALL_RECORD_URL || stat.CALL_WEBDAV_URL || null
  const entityType = entityTypeStringToId(stat.CRM_ENTITY_TYPE)

  const values: NewRopCall = {
    tenantId: companyId,
    bitrixCallId,
    bitrixDealId: entityType === 2 ? stat.CRM_ENTITY_ID ?? null : null,
    bitrixLeadId: entityType === 1 ? stat.CRM_ENTITY_ID ?? null : null,
    bitrixContactId: entityType === 3 ? stat.CRM_ENTITY_ID ?? null : null,
    bitrixActivityId: stat.CRM_ACTIVITY_ID ?? null,
    managerId: stat.PORTAL_USER_ID ?? null,
    clientPhone: stat.PHONE_NUMBER ?? null,
    direction: stat.CALL_TYPE === "2" || stat.CALL_TYPE === "3" ? "in" : "out",
    startedAt: stat.CALL_START_DATE ? new Date(stat.CALL_START_DATE) : null,
    durationSec: Number(stat.CALL_DURATION || 0),
    recordingUrl,
    status: recordingUrl ? "pending" : "no_recording",
    attempts: 0,
  }

  const created = await db
    .insert(ropCalls)
    .values(values)
    .onConflictDoNothing({ target: [ropCalls.tenantId, ropCalls.bitrixCallId] })
    .returning({ id: ropCalls.id })

  if (created.length === 0) {
    console.log(`[public/rop-webhook] duplicate call, skipped: ${bitrixCallId} (company ${companyId})`)
  } else {
    console.log(`[public/rop-webhook] inserted call: ${bitrixCallId} (company ${companyId})${recordingUrl ? "" : " (no recording)"}`)
  }
}

async function ingestCrmActivity(client: ReturnType<typeof createBitrixClient>, companyId: string, activityId: string): Promise<void> {
  const a = await client.crmActivityGet(activityId)
  if (!a || a.PROVIDER_TYPE_ID !== "CALL") return

  const file = a.FILES?.[0]
  const recordingUrl = file?.urlMachine || file?.url || null
  const entityType = a.OWNER_TYPE_ID ? Number(a.OWNER_TYPE_ID) : null
  const bitrixCallId = `activity-${a.ID}`

  const values: NewRopCall = {
    tenantId: companyId,
    bitrixCallId,
    bitrixDealId: entityType === 2 ? a.OWNER_ID ?? null : null,
    bitrixLeadId: entityType === 1 ? a.OWNER_ID ?? null : null,
    bitrixContactId: entityType === 3 ? a.OWNER_ID ?? null : null,
    bitrixActivityId: a.ID,
    managerId: a.RESPONSIBLE_ID ?? null,
    startedAt: a.START_TIME ? new Date(a.START_TIME) : null,
    recordingUrl,
    status: recordingUrl ? "pending" : "no_recording",
    attempts: 0,
  }

  const created = await db
    .insert(ropCalls)
    .values(values)
    .onConflictDoNothing({ target: [ropCalls.tenantId, ropCalls.bitrixCallId] })
    .returning({ id: ropCalls.id })

  if (created.length === 0) {
    console.log(`[public/rop-webhook] duplicate activity, skipped: ${activityId} (company ${companyId})`)
  } else {
    console.log(`[public/rop-webhook] inserted activity: ${activityId} (company ${companyId})${recordingUrl ? "" : " (no recording)"}`)
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST events here" })
}
