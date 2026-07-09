import { NextRequest, NextResponse } from "next/server"
import { and, eq, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, telegramLinkCodes } from "@/lib/db/schema"
import { sendManagerBotMessage } from "@/lib/telegram/manager-bot"

// Webhook платформенного бота напоминаний об интервью (@Ren_HR_bot).
// Единственная функция бота — привязать личный chat_id менеджера по
// одноразовому коду (/start <код>, код выдаётся в Профиле пользователя,
// см. app/api/telegram/manager-bot/link-code). Сам бот ничего не отвечает
// и не ведёт диалог — только присылает напоминания об интервью.

const WEBHOOK_SECRET = process.env.MANAGER_REMINDER_BOT_WEBHOOK_SECRET

interface TelegramMessage {
  chat: { id: number }
  text?: string
}
interface TelegramUpdate {
  message?: TelegramMessage
}

async function handleStart(chatId: number, code: string) {
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    await sendManagerBotMessage(
      String(chatId),
      "Код не найден или истёк. Получите новый код в Профиле платформы (раздел «Напоминания об интервью в Telegram») и отправьте /start КОД.",
    )
    return
  }

  const [row] = await db
    .select({ userId: telegramLinkCodes.userId })
    .from(telegramLinkCodes)
    .where(and(
      eq(telegramLinkCodes.code, trimmed),
      eq(telegramLinkCodes.purpose, "manager_reminders"),
      gt(telegramLinkCodes.expiresAt, new Date()),
    ))
    .limit(1)

  if (!row) {
    await sendManagerBotMessage(
      String(chatId),
      "Код не найден или истёк. Получите новый код в Профиле платформы (раздел «Напоминания об интервью в Telegram») и отправьте /start КОД.",
    )
    return
  }

  await db.update(users).set({ managerReminderChatId: String(chatId) }).where(eq(users.id, row.userId))
  await db.delete(telegramLinkCodes).where(and(
    eq(telegramLinkCodes.userId, row.userId),
    eq(telegramLinkCodes.purpose, "manager_reminders"),
  ))

  await sendManagerBotMessage(
    String(chatId),
    "✅ Готово. Теперь сюда будут приходить напоминания о назначенных вами интервью — за сутки, утром в день встречи, за час и за 15 минут до начала.",
  )
}

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const header = req.headers.get("x-telegram-bot-api-secret-token")
  if (header !== WEBHOOK_SECRET) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let update: TelegramUpdate
  try {
    update = await req.json() as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message || typeof message.text !== "string") {
    return NextResponse.json({ ok: true })
  }

  const chatId = message.chat.id
  const text = message.text.trim()

  try {
    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim()
      await handleStart(chatId, code)
    } else {
      await sendManagerBotMessage(
        String(chatId),
        "Этот бот только присылает напоминания об интервью. Привязать аккаунт: /start КОД (код — в Профиле платформы).",
      )
    }
  } catch (err) {
    console.error("[manager-bot webhook]", err)
  }

  return NextResponse.json({ ok: true })
}
