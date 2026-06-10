// app/api/telegram/candidate-bot/webhook/route.ts
// F7: принимает Telegram-update'ы от кандидатских ботов всех компаний.
//
// Безопасность:
// - Каждая компания имеет свой secret_token (companies.candidate_bot_webhook_secret).
//   Telegram передаёт его в X-Telegram-Bot-Api-Secret-Token.
// - При несовпадении secret — 403, update игнорируется.
//
// Команды:
// /start <inviteToken> — связать telegram chat_id с кандидатом
// /stop               — отписаться (candidates.telegram_opt_out = true)
// любой текст          — сохранить как входящее сообщение кандидата

import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, companies, vacancies } from "@/lib/db/schema"
import type { TgMessage } from "@/lib/db/schema"
import { tgSendMessage } from "@/lib/telegram/candidate-bot"
import { sql } from "drizzle-orm"

// ─── Telegram update types ────────────────────────────────────────────────────

interface TgFrom {
  id:         number
  username?:  string
  first_name?: string
}

interface TgMessage_ {
  message_id: number
  chat:       { id: number; type: string }
  from?:      TgFrom
  text?:      string
}

interface TgUpdate {
  update_id: number
  message?:  TgMessage_
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Достать secret из заголовка
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!incomingSecret) {
    return NextResponse.json({ ok: false, error: "no_secret" }, { status: 403 })
  }

  // 2. Найти компанию по secret_token
  const [company] = await db
    .select({
      id:               companies.id,
      candidateBotToken: companies.candidateBotToken,
      webhookSecret:    companies.candidateBotWebhookSecret,
      username:         companies.candidateBotUsername,
    })
    .from(companies)
    .where(eq(companies.candidateBotWebhookSecret, incomingSecret))
    .limit(1)

  if (!company || !company.candidateBotToken) {
    return NextResponse.json({ ok: false, error: "unknown_secret" }, { status: 403 })
  }

  // 3. Разобрать update
  let update: TgUpdate
  try {
    update = await req.json() as TgUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update.message
  if (!msg || typeof msg.text !== "string") {
    return NextResponse.json({ ok: true })
  }

  const chatId   = msg.chat.id
  const text     = msg.text.trim()
  const username = msg.from?.username ?? null
  const token    = company.candidateBotToken

  try {
    if (text.startsWith("/start")) {
      await handleStart(token, chatId, username, text, company.id)
    } else if (text === "/stop") {
      await handleStop(token, chatId)
    } else {
      await handleIncoming(chatId, text, username, company.id)
    }
  } catch (err) {
    console.error("[candidate-bot webhook]", err)
  }

  // Telegram ждёт 200 OK; любой другой код → ретрай.
  return NextResponse.json({ ok: true })
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleStart(
  botToken: string,
  chatId:   number,
  username: string | null,
  text:     string,
  companyId: string,
) {
  const inviteToken = text.slice("/start".length).trim()

  if (!inviteToken) {
    await tgSendMessage(botToken, chatId,
      "Привет! Эта ссылка предназначена для кандидатов компании. " +
      "Если вы откликнулись на вакансию — воспользуйтесь ссылкой из письма.",
    )
    return
  }

  // Найти кандидата по inviteToken в рамках этой компании
  // (candidates → vacancies → companyId) — tenant-изоляция через JOIN.
  const [row] = await db
    .select({
      id:            candidates.id,
      name:          candidates.name,
      telegramChatId: candidates.telegramChatId,
      telegramOptOut: candidates.telegramOptOut,
    })
    .from(candidates)
    .innerJoin(vacancies, and(
      eq(candidates.vacancyId, vacancies.id),
      eq(vacancies.companyId, companyId),
    ))
    .where(eq(candidates.telegramInviteToken, inviteToken))
    .limit(1)

  if (!row) {
    await tgSendMessage(botToken, chatId,
      "Ссылка недействительна или устарела. Обратитесь к HR-специалисту компании.",
    )
    return
  }

  // Связать чат с кандидатом (idempotent: можно нажать /start повторно)
  await db.update(candidates)
    .set({
      telegramChatId:   String(chatId),
      telegramUsername: username ?? undefined,
      telegramOptOut:   false,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, row.id))

  const firstName = row.name?.split(" ")[0] || "Кандидат"
  await tgSendMessage(botToken, chatId,
    `Привет, ${firstName}! ✅\n\nТеперь HR-команда сможет написать вам здесь. ` +
    `Чтобы отписаться от уведомлений, отправьте /stop.`,
  )
}

async function handleStop(botToken: string, chatId: number) {
  // Найти кандидата по chat_id
  const [row] = await db
    .select({ id: candidates.id, name: candidates.name })
    .from(candidates)
    .where(eq(candidates.telegramChatId, String(chatId)))
    .limit(1)

  if (!row) {
    await tgSendMessage(botToken, chatId,
      "Связанного аккаунта кандидата не найдено.",
    )
    return
  }

  await db.update(candidates)
    .set({ telegramOptOut: true, updatedAt: new Date() })
    .where(eq(candidates.id, row.id))

  await tgSendMessage(botToken, chatId,
    "Вы отписались от сообщений этого бота. Мы больше не будем вам писать.\n" +
    "Если хотите возобновить общение — обратитесь к HR-специалисту.",
  )
}

async function handleIncoming(
  chatId:    number,
  text:      string,
  _username: string | null,
  _companyId: string,
) {
  // Найти кандидата по chat_id
  const [row] = await db
    .select({
      id:            candidates.id,
      telegramOptOut: candidates.telegramOptOut,
      tgMessages:    candidates.tgMessages,
    })
    .from(candidates)
    .where(eq(candidates.telegramChatId, String(chatId)))
    .limit(1)

  if (!row || row.telegramOptOut) {
    // Нет связи или кандидат отписался — игнорируем
    return
  }

  // Сохранить входящее сообщение
  const newMsg: TgMessage = {
    role:   "candidate",
    text,
    sentAt: new Date().toISOString(),
  }

  const current = Array.isArray(row.tgMessages) ? row.tgMessages : []
  // Ограничиваем историю 500 сообщениями
  const updated = [...current, newMsg].slice(-500)

  await db.update(candidates)
    .set({ tgMessages: updated, updatedAt: new Date() })
    .where(eq(candidates.id, row.id))
}
