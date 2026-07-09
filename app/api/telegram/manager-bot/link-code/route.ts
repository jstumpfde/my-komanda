import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramLinkCodes } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"
import { MANAGER_BOT_USERNAME } from "@/lib/telegram/manager-bot"

// POST /api/telegram/manager-bot/link-code — одноразовый код для привязки
// личного Telegram к платформенному боту напоминаний об интервью (@Ren_HR_bot).
// В отличие от /api/telegram/link-code (бот БЗ, per-company) — бот один на
// всю платформу, доступен любому залогиненному пользователю.

const CODE_LENGTH = 6
const TTL_MS = 15 * 60 * 1000

function generateCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) code += crypto.randomInt(0, 10).toString()
  return code
}

export async function POST() {
  try {
    const session = await requireAuth()

    if (!MANAGER_BOT_USERNAME) {
      return apiError("Бот напоминаний ещё не настроен на платформе", 409)
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + TTL_MS)

    await db.delete(telegramLinkCodes).where(and(
      eq(telegramLinkCodes.userId, session.id),
      eq(telegramLinkCodes.purpose, "manager_reminders"),
    ))

    await db.insert(telegramLinkCodes).values({
      userId: session.id,
      code,
      expiresAt,
      purpose: "manager_reminders",
    })

    return apiSuccess({
      code,
      expiresAt: expiresAt.toISOString(),
      botUsername: MANAGER_BOT_USERNAME,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[manager-bot link-code]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
