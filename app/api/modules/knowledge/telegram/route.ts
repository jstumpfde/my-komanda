import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// ─── Helpers ───────────────────────────────────────────────────────────────

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  if (token.length <= 10) return "••••"
  return `${token.slice(0, 6)}••••${token.slice(-4)}`
}

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (envUrl) return envUrl.replace(/\/$/, "")
  const host = req.headers.get("host")
  const proto = req.headers.get("x-forwarded-proto") || "https"
  return `${proto}://${host}`
}

interface TgResponse<T> {
  ok: boolean
  result?: T
  description?: string
}

async function tgCall<T>(token: string, method: string, body?: unknown): Promise<TgResponse<T>> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  return await res.json().catch(() => ({ ok: false, description: "Invalid JSON" })) as TgResponse<T>
}

// ─── GET — текущие настройки (маскированный токен) ────────────────────────

export async function GET() {
  try {
    const user = await requireCompany()
    const [company] = await db
      .select({
        token: companies.telegramBotToken,
        username: companies.telegramBotUsername,
        webhookSet: companies.telegramWebhookSet,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company) return apiError("Company not found", 404)

    return apiSuccess({
      connected: Boolean(company.token),
      maskedToken: maskToken(company.token),
      botUsername: company.username,
      webhookSet: company.webhookSet ?? false,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ─── POST — сохранить токен и зарегистрировать webhook ────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { token?: string }
    const token = body.token?.trim()

    if (!token) return apiError("'token' is required", 400)
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return apiError("Неверный формат токена", 400)
    }

    // 1) Проверить токен + получить username
    const me = await tgCall<{ id: number; username?: string; first_name?: string }>(token, "getMe")
    if (!me.ok || !me.result) {
      return apiError(`Telegram отклонил токен: ${me.description ?? "неизвестная ошибка"}`, 400)
    }
    const botUsername = me.result.username ?? null

    // 2) Зарегистрировать webhook
    const baseUrl = getBaseUrl(req)
    const webhookUrl = `${baseUrl}/api/telegram/webhook/${user.companyId}`
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    const setParams: Record<string, unknown> = {
      url: webhookUrl,
      drop_pending_updates: true,
    }
    if (secret) setParams.secret_token = secret

    const setRes = await tgCall<boolean>(token, "setWebhook", setParams)
    const webhookSet = Boolean(setRes.ok)

    // 3) Сохранить в БД
    await db
      .update(companies)
      .set({
        telegramBotToken: token,
        telegramBotUsername: botUsername,
        telegramWebhookSet: webhookSet,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, user.companyId))

    if (!webhookSet) {
      return apiError(`Токен сохранён, но не удалось зарегистрировать webhook: ${setRes.description ?? ""}`, 502)
    }

    return apiSuccess({
      connected: true,
      maskedToken: maskToken(token),
      botUsername,
      webhookSet,
      webhookUrl,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ─── DELETE — отключить бота ──────────────────────────────────────────────

export async function DELETE() {
  try {
    const user = await requireCompany()

    const [company] = await db
      .select({ token: companies.telegramBotToken })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (company?.token) {
      // best-effort deleteWebhook
      await tgCall<boolean>(company.token, "deleteWebhook", { drop_pending_updates: true }).catch(() => null)
    }

    await db
      .update(companies)
      .set({
        telegramBotToken: null,
        telegramBotUsername: null,
        telegramWebhookSet: false,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ connected: false })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
