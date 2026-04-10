import { NextRequest, NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/api-helpers"

// POST /api/telegram/setup — register the bot webhook with Telegram.
// Call once from dev tools while logged in as platform_admin.
export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN не настроен" }, { status: 500 })
  }

  // Accept an optional webhook URL from the body; default to production host.
  let overrideUrl: string | undefined
  try {
    const body = await req.json() as { url?: string }
    overrideUrl = body.url
  } catch {
    // no body, use default
  }

  const webhookUrl = overrideUrl || "https://company24.pro/api/telegram/webhook"
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET

  const params: Record<string, string> = {
    url: webhookUrl,
    drop_pending_updates: "true",
  }
  if (secret) params.secret_token = secret

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })

  const data = await tgRes.json().catch(() => null)
  if (!tgRes.ok || !data?.ok) {
    console.error("[telegram setup]", tgRes.status, data)
    return NextResponse.json({ error: "Не удалось зарегистрировать webhook", details: data }, { status: 502 })
  }

  return NextResponse.json({ ok: true, webhook: webhookUrl, telegram: data })
}

// GET /api/telegram/setup — inspect the currently registered webhook.
export async function GET() {
  try {
    await requirePlatformAdmin()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN не настроен" }, { status: 500 })
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
  const data = await tgRes.json().catch(() => null)
  if (!tgRes.ok || !data?.ok) {
    return NextResponse.json({ error: "Не удалось получить webhook", details: data }, { status: 502 })
  }
  return NextResponse.json({ ok: true, telegram: data })
}
