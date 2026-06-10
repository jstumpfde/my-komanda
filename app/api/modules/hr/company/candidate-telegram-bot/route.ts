// app/api/modules/hr/company/candidate-telegram-bot/route.ts
// F7: настройка Telegram-бота для переписки с кандидатами.
// GET  — текущий статус (токен маскируется).
// PUT  — сохранить токен + подключить webhook (getMe + setWebhook).
// DELETE — отключить (удалить webhook, очистить поля).

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { tgGetMe, tgSetWebhook, tgDeleteWebhook, generateInviteToken } from "@/lib/telegram/candidate-bot"

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  if (token.length <= 8) return "***"
  return `${token.slice(0, 6)}…${token.slice(-4)}`
}

// Webhook URL: https://company24.pro/api/telegram/candidate-bot/webhook
function buildWebhookUrl(): string {
  const base = process.env.NEXTAUTH_URL || "https://company24.pro"
  return `${base}/api/telegram/candidate-bot/webhook`
}

export async function GET() {
  try {
    const user = await requireDirector()
    const [row] = await db
      .select({
        candidateBotToken:         companies.candidateBotToken,
        candidateBotUsername:      companies.candidateBotUsername,
        candidateBotWebhookSecret: companies.candidateBotWebhookSecret,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!row) return apiError("Company not found", 404)

    return apiSuccess({
      connected:     !!row.candidateBotToken && !!row.candidateBotUsername,
      tokenMasked:   maskToken(row.candidateBotToken),
      username:      row.candidateBotUsername ?? null,
      webhookActive: !!row.candidateBotWebhookSecret,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = await req.json().catch(() => ({})) as { botToken?: string }

    const rawToken = typeof body.botToken === "string" ? body.botToken.trim() : ""
    if (!rawToken) return apiError("Токен бота не указан", 400)

    // Маскированный токен — значит пришёл из GET, ничего не меняем
    if (rawToken.includes("…")) return apiError("Передайте полный токен бота", 400)

    // Базовая валидация формата: числа:буквы-цифры-дефис-подчёркивание
    if (!/^\d+:[A-Za-z0-9_-]{10,}$/.test(rawToken)) {
      return apiError("Некорректный формат токена бота Telegram", 400)
    }

    // Проверяем токен через getMe
    const botInfo = await tgGetMe(rawToken)
    if (!botInfo) {
      return apiError("Не удалось проверить токен бота. Проверьте токен и попробуйте снова.", 400)
    }

    // Генерируем новый webhook-секрет
    const webhookSecret = generateInviteToken()
    const webhookUrl    = buildWebhookUrl()

    // Устанавливаем webhook
    const webhookOk = await tgSetWebhook(rawToken, webhookUrl, webhookSecret)
    if (!webhookOk) {
      return apiError("Не удалось установить webhook. Бот должен быть не связан с другим webhook.", 502)
    }

    await db.update(companies)
      .set({
        candidateBotToken:         rawToken,
        candidateBotUsername:      botInfo.username,
        candidateBotWebhookSecret: webhookSecret,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({
      connected: true,
      username:  botInfo.username,
      name:      botInfo.first_name,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT /candidate-telegram-bot]", err)
    return apiError("Internal server error", 500)
  }
}

export async function DELETE() {
  try {
    const user = await requireDirector()

    const [row] = await db
      .select({ candidateBotToken: companies.candidateBotToken })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!row) return apiError("Company not found", 404)

    // Попытка удалить webhook (тихо, если токен уже недействителен)
    if (row.candidateBotToken) {
      await tgDeleteWebhook(row.candidateBotToken)
    }

    await db.update(companies)
      .set({
        candidateBotToken:         null,
        candidateBotUsername:      null,
        candidateBotWebhookSecret: null,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ disconnected: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[DELETE /candidate-telegram-bot]", err)
    return apiError("Internal server error", 500)
  }
}
