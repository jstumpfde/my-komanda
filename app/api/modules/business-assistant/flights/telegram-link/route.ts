import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { userTelegramLinks } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { TIKET_BOT_USERNAME } from "@/lib/telegram/tiket-bot"

// GET — статус привязки текущего пользователя к боту @TiketCompany24bot.
export async function GET() {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  const [link] = await db
    .select()
    .from(userTelegramLinks)
    .where(eq(userTelegramLinks.userId, user.id))
    .limit(1)

  return NextResponse.json({
    linked: Boolean(link?.chatId),
    chatId: link?.chatId ?? null,
    botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  })
}

// POST — сгенерировать (или перевыпустить) одноразовую ссылку-приглашение
// t.me/TiketCompany24bot?start=<token>. Если уже привязан — просто вернуть
// статус, новый токен не нужен.
export async function POST() {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  const [existing] = await db
    .select()
    .from(userTelegramLinks)
    .where(eq(userTelegramLinks.userId, user.id))
    .limit(1)

  if (existing?.chatId) {
    return NextResponse.json({ linked: true, deepLink: null })
  }

  const token = crypto.randomUUID().replace(/-/g, "")

  if (existing) {
    await db
      .update(userTelegramLinks)
      .set({ linkToken: token })
      .where(eq(userTelegramLinks.id, existing.id))
  } else {
    await db.insert(userTelegramLinks).values({
      userId: user.id,
      companyId: user.companyId,
      linkToken: token,
    })
  }

  return NextResponse.json({
    linked: false,
    deepLink: `https://t.me/${TIKET_BOT_USERNAME}?start=${token}`,
  })
}
