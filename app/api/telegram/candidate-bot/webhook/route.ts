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
// video/video_note/audio/voice/document(video-mime) — запасной канал
//   загрузки видео-визитки (04.07): скачиваем через getFile, сохраняем как
//   /api/public/demo/[token]/upload-media, прикрепляем к anketaAnswers.
// любой текст          — сохранить как входящее сообщение кандидата

import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import path from "path"
import { promises as fs } from "fs"
import { db } from "@/lib/db"
import { candidates, companies, vacancies } from "@/lib/db/schema"
import type { TgMessage } from "@/lib/db/schema"
import { tgSendMessage, tgGetFile, tgDownloadFile, TG_BOT_API_DOWNLOAD_LIMIT } from "@/lib/telegram/candidate-bot"
import { publicDir } from "@/lib/uploads-path"
import { sql } from "drizzle-orm"

// ─── Telegram update types ────────────────────────────────────────────────────

interface TgFrom {
  id:         number
  username?:  string
  first_name?: string
}

interface TgPhotoSize {
  file_id:   string
  file_size?: number
}

interface TgVideo {
  file_id:   string
  file_name?: string
  mime_type?: string
  file_size?: number
  duration?:  number
}

interface TgDocument {
  file_id:   string
  file_name?: string
  mime_type?: string
  file_size?: number
}

interface TgVoice {
  file_id:   string
  mime_type?: string
  file_size?: number
  duration?:  number
}

interface TgMessage_ {
  message_id:  number
  chat:        { id: number; type: string }
  from?:       TgFrom
  text?:       string
  video?:      TgVideo
  video_note?: TgVideo
  audio?:      TgDocument & { duration?: number }
  voice?:      TgVoice
  document?:   TgDocument
  photo?:      TgPhotoSize[]
}

interface TgUpdate {
  update_id: number
  message?:  TgMessage_
}

// Форматы документов, которые принимаем как видео (кандидаты иногда шлют
// «файлом», а не «видео», особенно с iPhone).
const DOCUMENT_VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska"])

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
  if (!msg) {
    return NextResponse.json({ ok: true })
  }

  const chatId   = msg.chat.id
  const username = msg.from?.username ?? null
  const token    = company.candidateBotToken

  // Медиа (видео/видео-заметка/голос/аудио/документ-как-видео) — запасной
  // канал загрузки. Проверяем ДО текста: сообщение с медиа обычно caption'а
  // не имеет, но если бы имело — приоритет у медиа.
  const media = msg.video ?? msg.video_note ?? msg.voice ?? msg.audio
    ?? (msg.document && DOCUMENT_VIDEO_MIME.has((msg.document.mime_type ?? "").toLowerCase()) ? msg.document : undefined)

  if (media) {
    try {
      await handleMedia(token, chatId, media, msg, company.id)
    } catch (err) {
      console.error("[candidate-bot webhook] media", err)
    }
    return NextResponse.json({ ok: true })
  }

  if (typeof msg.text !== "string") {
    return NextResponse.json({ ok: true })
  }

  const text = msg.text.trim()

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
  companyId: string,
) {
  // Найти кандидата по chat_id В РАМКАХ КОМПАНИИ из секрета вебхука —
  // tenant-изоляция через JOIN (без неё совпадение chat_id увело бы
  // сообщение в чужой тенант). Аналогично handleStart.
  const [row] = await db
    .select({
      id:            candidates.id,
      telegramOptOut: candidates.telegramOptOut,
      tgMessages:    candidates.tgMessages,
    })
    .from(candidates)
    .innerJoin(vacancies, and(
      eq(candidates.vacancyId, vacancies.id),
      eq(vacancies.companyId, companyId),
    ))
    .where(eq(candidates.telegramChatId, String(chatId)))
    .limit(1)

  if (!row || row.telegramOptOut) {
    // Нет связи или кандидат отписался — игнорируем
    return
  }

  // Сохранить входящее сообщение (обрезаем до лимита Telegram — 4096 символов)
  const newMsg: TgMessage = {
    role:   "candidate",
    text:   text.slice(0, 4096),
    sentAt: new Date().toISOString(),
  }

  const current = Array.isArray(row.tgMessages) ? row.tgMessages : []
  // Ограничиваем историю 500 сообщениями
  const updated = [...current, newMsg].slice(-500)

  await db.update(candidates)
    .set({ tgMessages: updated, updatedAt: new Date() })
    .where(eq(candidates.id, row.id))
}

// blockId-заглушка для видео, пришедшего через запасной Telegram-канал —
// на демо-странице кандидат обычно грузит одну видео-визитку, у Telegram
// нет понятия «для какого блока анкеты» это видео. Если у кандидата уже
// есть настоящий media-блок в anketaAnswers — HR увидит оба варианта в
// карточке (fallback не затирает существующий upload).
const TELEGRAM_FALLBACK_BLOCK_ID = "telegram-fallback-media"

function extFromMime(mime: string | undefined, fallback: string): string {
  const map: Record<string, string> = {
    "video/mp4":        "mp4",
    "video/quicktime":  "mov",
    "video/webm":       "webm",
    "video/x-matroska": "mkv",
    "video/x-msvideo":  "avi",
    "audio/ogg":        "ogg",
    "audio/mpeg":       "mp3",
    "audio/mp4":        "m4a",
  }
  return map[(mime ?? "").toLowerCase()] ?? fallback
}

/**
 * Кандидат прислал видео/аудио боту напрямую (запасной канал, когда загрузка
 * на демо-странице не работает). Скачиваем через getFile (лимит Bot API —
 * 20 МБ, TG_BOT_API_DOWNLOAD_LIMIT), сохраняем ТУДА ЖЕ, куда пишет обычная
 * загрузка (/api/public/demo/[token]/upload-media — publicDir("uploads",
 * "candidates", candidateId)), и прикрепляем в candidates.anketaAnswers —
 * тем же форматом записи, чтобы HR видел файл в карточке кандидата как
 * обычный media-ответ.
 */
async function handleMedia(
  botToken:  string,
  chatId:    number,
  media:     { file_id: string; file_size?: number; mime_type?: string; file_name?: string; duration?: number },
  msg:       TgMessage_,
  companyId: string,
) {
  // Найти кандидата по chat_id В РАМКАХ КОМПАНИИ — та же tenant-изоляция,
  // что и в handleIncoming/handleStart.
  const [row] = await db
    .select({
      id:             candidates.id,
      telegramOptOut: candidates.telegramOptOut,
      anketaAnswers:  candidates.anketaAnswers,
    })
    .from(candidates)
    .innerJoin(vacancies, and(
      eq(candidates.vacancyId, vacancies.id),
      eq(vacancies.companyId, companyId),
    ))
    .where(eq(candidates.telegramChatId, String(chatId)))
    .limit(1)

  if (!row || row.telegramOptOut) return

  // Лимит Bot API на скачивание — 20 МБ. Telegram сам сжимает видео,
  // отправленное «как видео» (не «как файл») — в описании задачи это ok;
  // если всё равно крупнее — просим прислать короче/сжатое.
  if (typeof media.file_size === "number" && media.file_size > TG_BOT_API_DOWNLOAD_LIMIT) {
    await tgSendMessage(botToken, chatId,
      "Файл слишком большой для отправки через бота (лимит Telegram — 20 МБ). " +
      "Пришлите файл покороче или более сжатый — например, отправьте его именно " +
      "как видео (не «файлом»), Telegram сам его сожмёт.",
    )
    return
  }

  const fileInfo = await tgGetFile(botToken, media.file_id)
  if (!fileInfo) {
    await tgSendMessage(botToken, chatId,
      "Не получилось скачать файл. Попробуйте отправить его ещё раз.",
    )
    return
  }

  const buffer = await tgDownloadFile(botToken, fileInfo.filePath)
  if (!buffer || buffer.length === 0) {
    await tgSendMessage(botToken, chatId,
      "Не получилось скачать файл. Попробуйте отправить его ещё раз.",
    )
    return
  }

  const isVoiceOrAudio = !!msg.voice || !!msg.audio
  const mediaType: "video" | "audio" = isVoiceOrAudio ? "audio" : "video"
  const mime = media.mime_type
    ?? (mediaType === "audio" ? "audio/ogg" : "video/mp4")
  const ext = extFromMime(mime, mediaType === "audio" ? "ogg" : "mp4")

  const relativeDir = path.join("uploads", "candidates", row.id)
  const absoluteDir = publicDir(relativeDir)
  await fs.mkdir(absoluteDir, { recursive: true })

  const fileName = `${TELEGRAM_FALLBACK_BLOCK_ID}-${Date.now()}.${ext}`
  await fs.writeFile(path.join(absoluteDir, fileName), buffer)
  const publicUrl = "/" + path.posix.join(relativeDir.split(path.sep).join("/"), fileName)

  const answerObj = {
    url:  publicUrl,
    mediaType,
    ...(typeof media.duration === "number" ? { duration: media.duration } : {}),
    size: buffer.length,
    mime,
  }

  // Тот же формат, что /api/public/demo/[token]/upload-media — upsert по
  // blockId в массиве anketaAnswers (нормализуем массив/объект на всякий
  // случай, как и там).
  const rawAnswers = row.anketaAnswers as unknown
  let existing: any[]
  if (Array.isArray(rawAnswers)) {
    existing = rawAnswers
  } else if (rawAnswers && typeof rawAnswers === "object") {
    existing = Object.values(rawAnswers as Record<string, any>)
  } else {
    existing = []
  }
  const idx = existing.findIndex((a: any) => a?.blockId === TELEGRAM_FALLBACK_BLOCK_ID)
  const entry = { blockId: TELEGRAM_FALLBACK_BLOCK_ID, answer: answerObj, answeredAt: new Date().toISOString() }
  if (idx >= 0) existing[idx] = entry
  else existing.push(entry)

  await db.update(candidates)
    .set({ anketaAnswers: existing, updatedAt: new Date() })
    .where(eq(candidates.id, row.id))

  await tgSendMessage(botToken, chatId, "Видео получено и прикреплено ✅")
}
