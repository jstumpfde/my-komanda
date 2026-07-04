import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, telegramLinkCodes } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST /api/telegram/link-code — выдать одноразовый код для привязки Telegram
// к ТЕКУЩЕМУ пользователю (личность уже подтверждена сессией). Заменяет
// небезопасную привязку «/start email@company.ru» без проверки владения
// (аудит 04.07): теперь бот принимает только код, полученный здесь.
//
// TTL 15 минут. Идемпотентно: повторный вызов гасит предыдущий
// неиспользованный код пользователя и выдаёт новый (не копим мусор).
//
// ВАЖНО: требует таблицу telegram_link_codes — см. TODO в lib/db/schema.ts
// рядом с users. Пока миграция не накатана, этот роут упадёт в рантайме на
// insert/delete (ссылка на несуществующую таблицу).

const CODE_LENGTH = 6
const TTL_MS = 15 * 60 * 1000

function generateCode(): string {
  // crypto-random цифровой код, без Math.random. randomInt даёт равномерное
  // распределение без modulo-bias.
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += crypto.randomInt(0, 10).toString()
  }
  return code
}

export async function POST() {
  try {
    const user = await requireCompany()

    const [company] = await db
      .select({ botUsername: companies.telegramBotUsername, hasToken: companies.telegramBotToken })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company?.hasToken) {
      return apiError("Telegram-бот компании ещё не подключён. Обратитесь к директору/администратору.", 409)
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + TTL_MS)

    // Гасим прежние неиспользованные коды этого пользователя, чтобы не
    // копить мусор и не давать несколько одновременно валидных кодов.
    await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, user.id))

    await db.insert(telegramLinkCodes).values({
      userId: user.id,
      code,
      expiresAt,
    })

    return apiSuccess({
      code,
      expiresAt: expiresAt.toISOString(),
      botUsername: company.botUsername ?? null,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram link-code]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
