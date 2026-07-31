// POST /api/salesradar/webhook/[connectorId]
//
// Единая точка входа для всех webhook-коннекторов (telegram_bot,
// whatsapp_agg). Проверяет per-connector секрет (НЕ глобальный CRON_SECRET —
// внешние сервисы Telegram/Wazzup не умеют его слать), парсит payload через
// connector.handleWebhook()/normalize(), пишет в rop_messages через
// ingestMessages() и сразу отвечает 200 — без AI-обработки/атрибуции (это
// подхватывает отдельный крон атрибуции, не в этой зоне).
//
// URL секрета:
// - Telegram Bot API: секрет передаётся Telegram'ом в заголовке
//   X-Telegram-Bot-Api-Secret-Token (сверяем с rop_channel_connectors.webhook_secret),
//   регистрируется через telegramSetWebhook() при создании коннектора.
// - WhatsApp-агрегаторы (Wazzup и др.) не имеют стандартного secret-заголовка —
//   секрет встраивается в URL: .../webhook/{connectorId}?secret={webhookSecret},
//   именно такой URL показывается в UI для вставки в настройки агрегатора.
//
// Всегда отвечаем 200 (даже на "не наш" секрет — 401 тоже 4xx, но без утечки
// причины в тело; отдаём минимум диагностики).

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { getConnector } from "@/lib/salesradar/connectors/registry"
import { ingestMessages, markConnectorSync } from "@/lib/salesradar/ingest"
import type { ConnectorKind } from "@/lib/salesradar/types"

export async function POST(req: NextRequest, ctx: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await ctx.params

  const [row] = await db.select().from(ropChannelConnectors).where(eq(ropChannelConnectors.id, connectorId)).limit(1)
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  if (!row.isEnabled) {
    return NextResponse.json({ ok: true, skipped: "disabled" })
  }

  const secretFromHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token")
  const secretFromQuery = req.nextUrl.searchParams.get("secret")
  const providedSecret = secretFromHeader || secretFromQuery
  if (!row.webhookSecret || providedSecret !== row.webhookSecret) {
    // Не палим детали в теле ответа — просто 401.
    console.warn(`[salesradar/webhook] неверный секрет для коннектора ${connectorId}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const connector = getConnector(row.kind as ConnectorKind)
  if (!connector || !connector.capabilities.webhook || !connector.handleWebhook) {
    return NextResponse.json({ error: `коннектор kind=${row.kind} не поддерживает webhook` }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  try {
    const raws = await connector.handleWebhook(payload, { id: row.id, companyId: row.companyId, config: row.config ?? {} })
    const normalized = raws.map((raw) => connector.normalize(raw, { id: row.id, companyId: row.companyId, kind: row.kind as ConnectorKind }))
    const result = await ingestMessages(row.companyId, row.id, normalized)
    await markConnectorSync(row.id, { status: "active", error: result.errors[0] ?? null })
    return NextResponse.json({ ok: true, inserted: result.inserted, skipped: result.skipped })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[salesradar/webhook] коннектор ${connectorId}:`, message)
    await markConnectorSync(row.id, { status: "error", error: message }).catch(() => {})
    // 200 всё равно — иначе Telegram/Wazzup начнут ретраить и заспамят лог;
    // ошибка видна в rop_channel_connectors.lastError/status для UI.
    return NextResponse.json({ ok: false, error: message })
  }
}
