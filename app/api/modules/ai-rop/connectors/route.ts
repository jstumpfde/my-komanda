// GET  /api/modules/ai-rop/connectors — список каналов компании (без кредов).
// POST /api/modules/ai-rop/connectors — создать канал: валидирует
//   config/creds через connector.validate(), шифрует creds
//   (lib/salesradar/crypto.ts), генерирует webhookSecret, для telegram_bot
//   сразу регистрирует webhook у Telegram (setWebhook).
//
// Доступ: requireRopManage (директор) — креды каналов коммуникации не менее
// чувствительны, чем Bitrix-webhook в settings.
import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage } from "@/lib/ai-rop/access"
import { getConnector, isConnectorImplemented } from "@/lib/salesradar/connectors/registry"
import { encryptConnectorCreds } from "@/lib/salesradar/crypto"
import { telegramSetWebhook } from "@/lib/salesradar/connectors/telegram-bot"
import type { ConnectorKind } from "@/lib/salesradar/types"

function webhookUrlFor(connectorId: string, secret: string): string {
  const base = process.env.NEXTAUTH_URL || "https://company24.pro"
  return `${base.replace(/\/$/, "")}/api/salesradar/webhook/${connectorId}?secret=${secret}`
}

export async function GET() {
  try {
    const user = await requireRopManage()
    const rows = await db
      .select({
        id: ropChannelConnectors.id,
        kind: ropChannelConnectors.kind,
        providerKey: ropChannelConnectors.providerKey,
        title: ropChannelConnectors.title,
        mode: ropChannelConnectors.mode,
        config: ropChannelConnectors.config,
        country: ropChannelConnectors.country,
        isEnabled: ropChannelConnectors.isEnabled,
        status: ropChannelConnectors.status,
        lastSyncAt: ropChannelConnectors.lastSyncAt,
        lastError: ropChannelConnectors.lastError,
        webhookSecret: ropChannelConnectors.webhookSecret,
        createdAt: ropChannelConnectors.createdAt,
      })
      .from(ropChannelConnectors)
      .where(eq(ropChannelConnectors.companyId, user.companyId))
      .orderBy(desc(ropChannelConnectors.createdAt))

    const connectors = rows.map((r) => ({
      ...r,
      webhookUrl: r.mode === "webhook" && r.webhookSecret ? webhookUrlFor(r.id, r.webhookSecret) : null,
      webhookSecret: undefined, // секрет наружу не отдаём отдельным полем — он уже вшит в webhookUrl
    }))

    return NextResponse.json({ ok: true, connectors })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[salesradar/connectors] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as {
      kind?: string
      providerKey?: string
      title?: string
      country?: string
      config?: Record<string, unknown>
      creds?: Record<string, unknown>
    }

    const kind = body.kind as ConnectorKind
    if (!kind || !isConnectorImplemented(kind)) {
      return apiError(`Коннектор kind="${body.kind}" не реализован`, 400)
    }
    const connector = getConnector(kind)!

    const config = { ...(body.config ?? {}), ...(body.providerKey ? { providerKey: body.providerKey } : {}) }
    const creds = body.creds ?? {}

    const validation = await connector.validate(config, creds)
    if (!validation.ok) {
      return apiError(validation.error || "Не удалось проверить подключение", 400)
    }

    const webhookSecret = randomBytes(24).toString("hex")

    const [row] = await db
      .insert(ropChannelConnectors)
      .values({
        companyId: user.companyId,
        kind,
        providerKey: body.providerKey ?? null,
        title: body.title?.trim() || validation.accountLabel || kind,
        mode: connector.capabilities.pull ? "pull" : "webhook",
        credentialsEnc: encryptConnectorCreds(creds),
        config,
        webhookSecret,
        country: body.country === "DE" ? "DE" : "RU",
        isEnabled: true,
        status: "active",
        lastSyncAt: new Date(),
      })
      .returning({ id: ropChannelConnectors.id })

    if (kind === "telegram_bot") {
      const botToken = (creds as { botToken?: string }).botToken
      if (botToken) {
        const url = webhookUrlFor(row.id, webhookSecret)
        const reg = await telegramSetWebhook(botToken, url, webhookSecret)
        if (!reg.ok) {
          await db.update(ropChannelConnectors).set({ status: "error", lastError: `setWebhook: ${reg.error}` }).where(eq(ropChannelConnectors.id, row.id))
        }
      }
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
      accountLabel: validation.accountLabel,
      webhookUrl: connector.capabilities.webhook ? webhookUrlFor(row.id, webhookSecret) : null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[salesradar/connectors] POST error:", err)
    return apiError("Internal server error", 500)
  }
}
