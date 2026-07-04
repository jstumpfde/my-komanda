// lib/telegram/candidate-bot.ts
// F7: утилиты для Telegram-бота переписки с кандидатами.
// Использует только официальный Bot API (обычный fetch, без сторонних библиотек).
// Бот НЕ пишет первым — кандидат начинает через deep-link.

export interface TgBotInfo {
  id:         number
  username:   string
  first_name: string
}

// ─── Bot API helpers ──────────────────────────────────────────────────────────

/** Проверяет токен через getMe; возвращает информацию о боте или null. */
export async function tgGetMe(botToken: string): Promise<TgBotInfo | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; result?: TgBotInfo }
    return data.ok && data.result ? data.result : null
  } catch {
    return null
  }
}

/** Устанавливает webhook на наш эндпоинт с защитой secret_token. */
export async function tgSetWebhook(
  botToken:      string,
  webhookUrl:    string,
  secretToken:   string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url:                  webhookUrl,
        secret_token:         secretToken,
        drop_pending_updates: true,
        // Разрешаем только обычные сообщения — не нужны inline/callback
        allowed_updates: ["message"],
      }),
    })
    if (!res.ok) return false
    const data = await res.json() as { ok: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

/** Удаляет webhook. */
export async function tgDeleteWebhook(botToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    })
    if (!res.ok) return false
    const data = await res.json() as { ok: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

/**
 * Отправляет сообщение кандидату.
 * Rate-limit: Telegram допускает 1 msg/сек в один чат.
 * Передавайте rateLimitMs = 1100 если отправляете серии; для одиночных не нужно.
 */
export async function tgSendMessage(
  botToken:     string,
  chatId:       string | number,
  text:         string,
  rateLimitMs?: number,
): Promise<boolean> {
  if (rateLimitMs && rateLimitMs > 0) {
    await new Promise(r => setTimeout(r, rateLimitMs))
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:                  chatId,
        text,
        parse_mode:               "HTML",
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Файлы (запасной канал загрузки видео-визитки) ────────────────────────────

/**
 * Лимит Bot API на СКАЧИВАНИЕ файла через getFile/file — 20 МБ. Это лимит
 * самого Telegram (не наш), обойти нельзя обычным Bot API. Если кандидат
 * прислал файл крупнее — file_path Telegram не отдаёт вовсе (getFile упадёт
 * или недоступен файл), поэтому проверяем ДО скачивания по message.*.file_size.
 */
export const TG_BOT_API_DOWNLOAD_LIMIT = 20 * 1024 * 1024

/** Результат getFile: путь на серверах Telegram для последующего скачивания. */
export async function tgGetFile(botToken: string, fileId: string): Promise<{ filePath: string; fileSize?: number } | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`)
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; result?: { file_path?: string; file_size?: number } }
    if (!data.ok || !data.result?.file_path) return null
    return { filePath: data.result.file_path, fileSize: data.result.file_size }
  } catch {
    return null
  }
}

/** Скачивает содержимое файла с серверов Telegram (после tgGetFile). */
export async function tgDownloadFile(botToken: string, filePath: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`)
    if (!res.ok) return null
    const arrayBuf = await res.arrayBuffer()
    return Buffer.from(arrayBuf)
  } catch {
    return null
  }
}

// ─── Deep-link ────────────────────────────────────────────────────────────────

/** Формирует deep-link для кандидата: t.me/<botUsername>?start=<inviteToken> */
export function buildCandidateDeepLink(botUsername: string, inviteToken: string): string {
  return `https://t.me/${botUsername}?start=${inviteToken}`
}

// ─── Токен приглашения ────────────────────────────────────────────────────────

/**
 * Генерирует случайный токен-приглашение (32 hex-символа).
 * Токен хранится в candidates.telegram_invite_token.
 */
export function generateInviteToken(): string {
  // crypto.randomUUID() доступен в Node 18+ и Edge runtime
  return crypto.randomUUID().replace(/-/g, "")
}
