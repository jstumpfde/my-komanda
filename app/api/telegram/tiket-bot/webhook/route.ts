// app/api/telegram/tiket-bot/webhook/route.ts
// Вебхук платформенного бота @TiketCompany24bot (Бизнес-ассистент → Авиабилеты).
// В отличие от app/api/telegram/candidate-bot/webhook (per-tenant secret из
// БД), этот бот один на всю платформу — секрет из env
// TELEGRAM_TIKET_WEBHOOK_SECRET, передаётся query-параметром ?secret=,
// т.к. Telegram setWebhook пишет его прямо в URL. Несовпадение → 404
// (не 403 — не подсказываем, что эндпоинт вообще существует).
import { NextRequest, NextResponse } from "next/server"
import { handleTiketBotUpdate, type TgUpdate } from "@/lib/telegram/tiket-bot"

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  const expected = process.env.TELEGRAM_TIKET_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  let update: TgUpdate
  try {
    update = (await req.json()) as TgUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  try {
    await handleTiketBotUpdate(update)
  } catch (err) {
    console.error("[tiket-bot webhook]", err)
  }

  // Telegram ждёт 200 OK; любой другой код → ретрай того же update.
  return NextResponse.json({ ok: true })
}
