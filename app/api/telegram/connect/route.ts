import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requireAuth } from "@/lib/api-helpers"

// POST /api/telegram/connect — link a Telegram chat_id to a user by email.
// Called from a settings UI or an admin panel. Auth required.
export async function POST(req: NextRequest) {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { chatId?: number | string; email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  const chatId = body.chatId !== undefined && body.chatId !== null ? String(body.chatId).trim() : ""
  const email = (body.email || "").trim().toLowerCase()

  if (!chatId || !email) {
    return NextResponse.json({ error: "chatId и email обязательны" }, { status: 400 })
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
