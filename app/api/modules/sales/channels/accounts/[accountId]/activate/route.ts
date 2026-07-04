// Активация Telegram-аккаунта канала продаж: валидация токена (getMe) +
// регистрация webhook (setWebhook) с per-account секретом. Зеркалит паттерн
// app/api/modules/knowledge/telegram/route.ts, но per-tenant аккаунт из
// salesChannelAccounts (а не единый companies.telegramBotToken).
//
// POST — подключить/перерегистрировать webhook. DELETE — отключить (deleteWebhook).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesChannelAccounts } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

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
  return (await res.json().catch(() => ({ ok: false, description: "Invalid JSON" }))) as TgResponse<T>
}

async function loadAccount(accountId: string, tenantId: string) {
  const [account] = await db
    .select()
    .from(salesChannelAccounts)
    .where(and(eq(salesChannelAccounts.id, accountId), eq(salesChannelAccounts.tenantId, tenantId)))
    .limit(1)
  return account ?? null
}

// ─── POST — подключить токен и зарегистрировать webhook ───────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const user = await requireCompany()
    const { accountId } = await params

    const account = await loadAccount(accountId, user.companyId)
    if (!account) return apiError("Аккаунт канала не найден", 404)
    if (account.channel !== "telegram") return apiError("Активация доступна только для Telegram", 400)

    const token = account.botToken?.trim()
    if (!token) return apiError("У аккаунта не задан токен бота", 400)
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return apiError("Неверный формат токена", 400)

    // 1) Проверить токен + получить username бота.
    const me = await tgCall<{ id: number; username?: string }>(token, "getMe")
    if (!me.ok || !me.result) {
      return apiError(`Telegram отклонил токен: ${me.description ?? "неизвестная ошибка"}`, 400)
    }
    const botUsername = me.result.username ?? null

    // 2) Зарегистрировать webhook с per-account секретом.
    const baseUrl = getBaseUrl(req)
    const webhookUrl = `${baseUrl}/api/modules/sales/channels/telegram/${accountId}/webhook`
    const setParams: Record<string, unknown> = {
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: ["message", "callback_query"],
    }
    if (account.webhookSecret) setParams.secret_token = account.webhookSecret

    const setRes = await tgCall<boolean>(token, "setWebhook", setParams)
    const webhookSet = Boolean(setRes.ok)

    // 3) Сохранить username + флаг в config.
    const config = { ...(account.config as Record<string, unknown> | null), webhookSet, webhookUrl }
    await db
      .update(salesChannelAccounts)
      .set({
        externalAccountId: botUsername,
        isActive: true,
        config,
        updatedAt: new Date(),
      })
      .where(and(eq(salesChannelAccounts.id, accountId), eq(salesChannelAccounts.tenantId, user.companyId)))

    if (!webhookSet) {
      return apiError(`Токен принят, но не удалось зарегистрировать webhook: ${setRes.description ?? ""}`, 502)
    }

    return apiSuccess({ connected: true, botUsername, webhookSet, webhookUrl })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ─── DELETE — отключить бота (deleteWebhook) ──────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const user = await requireCompany()
    const { accountId } = await params

    const account = await loadAccount(accountId, user.companyId)
    if (!account) return apiError("Аккаунт канала не найден", 404)

    if (account.botToken) {
      await tgCall<boolean>(account.botToken, "deleteWebhook", { drop_pending_updates: true }).catch(() => null)
    }

    const config = { ...(account.config as Record<string, unknown> | null), webhookSet: false }
    await db
      .update(salesChannelAccounts)
      .set({ isActive: false, config, updatedAt: new Date() })
      .where(and(eq(salesChannelAccounts.id, accountId), eq(salesChannelAccounts.tenantId, user.companyId)))

    return apiSuccess({ connected: false })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
