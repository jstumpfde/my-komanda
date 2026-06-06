import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 34, задача 3: per-company настройки Telegram-канала HR.
// GET — текущее значение (token маскируется в ответе).
// PUT — сохранить bot_token + chat_id.

interface PutBody {
  botToken?: string | null
  chatId?:   string | null
}

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  if (token.length <= 8) return "***"
  return `${token.slice(0, 6)}…${token.slice(-4)}`
}

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({
        botToken: companies.telegramBotToken,
        chatId:   companies.telegramChatId,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    if (!row) return apiError("Company not found", 404)
    return apiSuccess({
      hasToken:   !!row.botToken,
      tokenMasked: maskToken(row.botToken ?? null),
      chatId:     row.chatId ?? "",
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as PutBody

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (typeof body.botToken === "string") {
      const trimmed = body.botToken.trim()
      // Пустая строка — сбрасываем токен. «Маскированная» строка вида
      // 1234…abcd — пришла из GET, не меняем.
      if (trimmed === "") {
        updates.telegramBotToken = null
      } else if (!trimmed.includes("…")) {
        // Простейшая валидация формата bot-token: digits:letters/dash.
        if (!/^\d+:[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
          return apiError("Некорректный формат токена бота", 400)
        }
        updates.telegramBotToken = trimmed
      }
    } else if (body.botToken === null) {
      updates.telegramBotToken = null
    }

    if (typeof body.chatId === "string") {
      const trimmed = body.chatId.trim()
      updates.telegramChatId = trimmed.length > 0 ? trimmed : null
    } else if (body.chatId === null) {
      updates.telegramChatId = null
    }

    const [r] = await db.update(companies)
      .set(updates)
      .where(eq(companies.id, user.companyId))
      .returning({ id: companies.id })
    if (!r) return apiError("Company not found", 404)

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PUT /company/telegram]", err)
    return apiError("Internal server error", 500)
  }
}
