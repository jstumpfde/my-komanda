// Подключение личного Telegram-аккаунта владельца платформы — шаг 1
// (телефон → код) + статус + разлогин.
// Доступ: только владелец платформы (requirePlatformAdmin).

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramUserbotSessions } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"
import { startLogin, disconnectAccount } from "@/lib/telegram-posting/auth"

// GET — статус текущей сессии (БЕЗ session_string!).
export async function GET() {
  try {
    const user = await requirePlatformAdmin()
    const [row] = await db
      .select({
        phone: telegramUserbotSessions.phone,
        status: telegramUserbotSessions.status,
        lastError: telegramUserbotSessions.lastError,
        dailyLimit: telegramUserbotSessions.dailyLimit,
        lastConnectedAt: telegramUserbotSessions.lastConnectedAt,
        firstActivatedAt: telegramUserbotSessions.firstActivatedAt,
        sendingPaused: telegramUserbotSessions.sendingPaused,
        peerFloodUntil: telegramUserbotSessions.peerFloodUntil,
      })
      .from(telegramUserbotSessions)
      .where(eq(telegramUserbotSessions.userId, user.id as string))
      .limit(1)

    if (!row) return apiSuccess({ connected: false, status: null })
    return apiSuccess({ connected: row.status === "active", ...row })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/connect] GET", err)
    return apiError("Ошибка получения статуса", 500)
  }
}

// POST { phone } — шаг 1: отправить код на телефон.
export async function POST(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const body = await req.json().catch(() => ({}))
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    if (!phone) return apiError("Укажите номер телефона", 400)

    await startLogin(user.id as string, phone)
    return apiSuccess({ ok: true, status: "pending_code" })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/connect] POST", err)
    return apiError(err instanceof Error ? err.message : "Не удалось отправить код", 500)
  }
}

// PATCH { sending_paused } — ручная аварийная пауза/возобновление отправок
// (не трогает подписку/сессию, только флаг проверяется в sender.ts перед
// обработкой постов этого владельца).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const body = await req.json().catch(() => ({}))
    if (typeof body.sending_paused !== "boolean") {
      return apiError("Укажите sending_paused (true/false)", 400)
    }

    const [updated] = await db
      .update(telegramUserbotSessions)
      .set({ sendingPaused: body.sending_paused, updatedAt: new Date() })
      .where(eq(telegramUserbotSessions.userId, user.id as string))
      .returning({ id: telegramUserbotSessions.id })

    if (!updated) return apiError("Аккаунт не подключён", 404)
    return apiSuccess({ ok: true, sendingPaused: body.sending_paused })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/connect] PATCH", err)
    return apiError("Не удалось изменить паузу отправок", 500)
  }
}

// DELETE — разлогин (удалить сессию).
export async function DELETE() {
  try {
    const user = await requirePlatformAdmin()
    await disconnectAccount(user.id as string)
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/connect] DELETE", err)
    return apiError("Не удалось отключить аккаунт", 500)
  }
}
