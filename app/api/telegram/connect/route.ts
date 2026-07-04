import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAuth } from "@/lib/api-helpers"

// POST /api/telegram/connect — привязать telegram chat_id к ТЕКУЩЕМУ пользователю.
// Личность берётся ИЗ СЕССИИ, а не из тела запроса: иначе любой залогиненный мог
// бы перезаписать telegramChatId чужого сотрудника по email (IDOR, аудит 04.07).
export async function POST(req: NextRequest) {
  let sessionUser
  try {
    sessionUser = await requireAuth()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { chatId?: number | string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const chatId = body.chatId !== undefined && body.chatId !== null ? String(body.chatId).trim() : ""
  const email = (sessionUser.email || "").trim().toLowerCase()

  if (!chatId) {
    return NextResponse.json({ error: "chatId обязателен" }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: "У текущего пользователя нет email" }, { status: 400 })
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 })
  }

  await db
    .update(users)
    .set({ telegramChatId: chatId })
    .where(eq(users.id, user.id))

  return NextResponse.json({ ok: true, userId: user.id })
}
