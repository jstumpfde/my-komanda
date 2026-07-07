// lib/tip/bot/telegram.ts
// Bot API модуля «Типология» — чистый fetch, БЕЗ сторонних SDK (тот же
// принцип, что lib/telegram/candidate-bot.ts). Собственный токен
// TIP_TG_BOT_TOKEN (env), отдельный от кандидатского бота.
//
// Исходящие fetch к api.telegram.org с прод-сервера (РФ) нестабильны —
// sendMessage падает с «fetch failed» примерно в 30-50% случаев. Базовый URL
// переопределяется через TIP_TG_API_BASE (на проде — стабильный прокси на
// рижском VPS, reverse_proxy на api.telegram.org). Плюс ретраи на сетевые
// ошибки в базовом вызове Bot API — HTTP-ошибки самого Telegram (4xx) не
// ретраятся, так как это не сетевая проблема, а невалидный запрос/данные.

const TG_API_BASE = process.env.TIP_TG_API_BASE || "https://api.telegram.org"

const RETRY_DELAYS_MS = [500, 1500]

/** true, если ошибка похожа на сетевую (а не на осмысленный отказ Telegram). */
function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timeout|aborted/i.test(msg)
}

export interface TgInlineButton {
  text: string
  callback_data?: string
  url?: string
}

export type TgInlineKeyboard = TgInlineButton[][]

interface TgApiOk<T> {
  ok: true
  result: T
}
interface TgApiErr {
  ok: false
  error_code?: number
  description?: string
}
type TgApiResponse<T> = TgApiOk<T> | TgApiErr

function apiUrl(botToken: string, method: string): string {
  return `${TG_API_BASE}/bot${botToken}/${method}`
}

/**
 * Базовый вызов Bot API. До 3 попыток на сетевые ошибки (TypeError/fetch
 * failed/timeout) с backoff 500мс/1500мс между попытками. HTTP-ошибки самого
 * Telegram (data.ok === false, обычно 4xx) НЕ ретраятся — это не сетевая
 * проблема, повтор её не исправит.
 */
async function callApi<T>(botToken: string, method: string, body: Record<string, unknown>): Promise<T | null> {
  const maxAttempts = RETRY_DELAYS_MS.length + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(apiUrl(botToken, method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as TgApiResponse<T>
      if (!data.ok) {
        // eslint-disable-next-line no-console
        console.error(`[tip-bot] ${method} failed`, "description" in data ? data.description : res.status)
        return null
      }
      return data.result
    } catch (e) {
      const network = isNetworkError(e)
      // eslint-disable-next-line no-console
      console.error(
        `[tip-bot] ${method} network error (попытка ${attempt}/${maxAttempts}${network ? "" : ", не похоже на сетевую"})`,
        e instanceof Error ? e.message : e,
      )
      if (!network || attempt === maxAttempts) return null
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
    }
  }
  return null
}

export interface TgSentMessage {
  message_id: number
  chat: { id: number }
}

/**
 * Отправляет сообщение. parse_mode=HTML всегда (текст должен быть уже
 * конвертирован через mdToTelegramHtml перед вызовом, если источник — markdown).
 */
export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  opts?: { keyboard?: TgInlineKeyboard; disablePreview?: boolean },
): Promise<TgSentMessage | null> {
  return callApi<TgSentMessage>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: opts?.disablePreview ?? true,
    ...(opts?.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
  })
}

export async function editMessageText(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
  opts?: { keyboard?: TgInlineKeyboard; disablePreview?: boolean },
): Promise<boolean> {
  const result = await callApi<unknown>(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: opts?.disablePreview ?? true,
    ...(opts?.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
  })
  return result !== null
}

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert?: boolean,
): Promise<boolean> {
  const result = await callApi<unknown>(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    ...(showAlert ? { show_alert: true } : {}),
  })
  return result !== null
}

/** Индикатор «печатает…» — вызывать раз в ~8с во время длительной генерации. */
export async function sendChatAction(botToken: string, chatId: number, action = "typing"): Promise<boolean> {
  const result = await callApi<unknown>(botToken, "sendChatAction", { chat_id: chatId, action })
  return result !== null
}

export interface TgWebhookInfo {
  url: string
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
}

export async function setWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken: string,
): Promise<boolean> {
  const result = await callApi<boolean>(botToken, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"],
  })
  return result === true
}

export async function getWebhookInfo(botToken: string): Promise<TgWebhookInfo | null> {
  return callApi<TgWebhookInfo>(botToken, "getWebhookInfo", {})
}

// ─── Длинные сообщения — разбивка на чанки ≤3800 символов ──────────────────

const CHUNK_LIMIT = 3800
const MAX_CHUNKS = 8

/**
 * Разбивает длинный текст (уже telegram-HTML) на чанки ≤3800 символов, стараясь
 * резать по границе абзаца/строки, а не посреди слова/тега. Максимум 8 чанков —
 * дальше добавляется финальная строка «Продолжение — по ссылке» (сам линк
 * добавляет вызывающий код, здесь только текст-заглушка на месте обрезки).
 */
export function chunkTelegramHtml(html: string, continueLinkText = "Продолжение — по ссылке выше."): string[] {
  if (html.length <= CHUNK_LIMIT) return [html]

  const paragraphs = html.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ""

  const pushCurrent = () => {
    if (current.length > 0) {
      chunks.push(current)
      current = ""
    }
  }

  for (const para of paragraphs) {
    // Если параграф сам длиннее лимита — режем построчно.
    const piece = current.length > 0 ? "\n\n" + para : para
    if (current.length + piece.length <= CHUNK_LIMIT) {
      current += piece
      continue
    }

    pushCurrent()

    if (para.length <= CHUNK_LIMIT) {
      current = para
      continue
    }

    // Параграф длиннее лимита целиком — режем по строкам.
    const lines = para.split("\n")
    for (const line of lines) {
      const linePiece = current.length > 0 ? "\n" + line : line
      if (current.length + linePiece.length <= CHUNK_LIMIT) {
        current += linePiece
      } else {
        pushCurrent()
        // Строка сама длиннее лимита (редко) — режем жёстко по символам.
        if (line.length > CHUNK_LIMIT) {
          for (let i = 0; i < line.length; i += CHUNK_LIMIT) {
            chunks.push(line.slice(i, i + CHUNK_LIMIT))
          }
        } else {
          current = line
        }
      }
    }
  }
  pushCurrent()

  if (chunks.length > MAX_CHUNKS) {
    const truncated = chunks.slice(0, MAX_CHUNKS)
    truncated[MAX_CHUNKS - 1] = truncated[MAX_CHUNKS - 1] + `\n\n<i>${continueLinkText}</i>`
    return truncated
  }

  return chunks
}

/**
 * Отправляет длинный текст чанками с небольшой паузой между сообщениями
 * (Telegram допускает ~1 msg/сек в один чат).
 */
export async function sendLongMessage(
  botToken: string,
  chatId: number,
  html: string,
  opts?: { keyboardOnLast?: TgInlineKeyboard },
): Promise<void> {
  const chunks = chunkTelegramHtml(html)
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1
    await sendMessage(botToken, chatId, chunks[i], {
      keyboard: isLast ? opts?.keyboardOnLast : undefined,
    })
    if (!isLast) {
      await new Promise((r) => setTimeout(r, 350))
    }
  }
}

// ─── Markdown (методика/AI-отчёт) → Telegram HTML ──────────────────────────

/**
 * Экранирует HTML-спецсимволы перед вставкой пользовательской строки (имя,
 * роль, ...) в сообщение с parse_mode=HTML — иначе Telegram отвергает
 * сообщение целиком, если строка содержит '<'/'>'/'&' (см. flow.ts, где
 * это раньше подставлялось в промптConfirm и другие места без экранирования).
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Упрощённый конвертер markdown в telegram-HTML (Bot API поддерживает только
 * узкое подмножество тегов: b, i, u, s, code, pre, a). Заголовки (#, ##, ###)
 * превращаются в <b>жирный текст</b>; **bold** — тоже в <b>; курсив в стиле
 * *word* или _word_ — в <i>; списки (тире, звёздочка, точка, цифра с точкой)
 * — в «— »; таблицы markdown упрощаются построчно «кол1 — кол2 — ...»
 * (Telegram не умеет таблицы).
 */
export function mdToTelegramHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []

  for (let raw of lines) {
    let line = raw

    // Таблицы markdown: строка вида "| a | b | c |" или разделитель "|---|---|".
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
      // Разделитель заголовка таблицы (---|---) — пропускаем.
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
      if (cells.length === 0 || cells.every((c) => c === "")) continue
      out.push(escapeHtml(cells.join(" — ")))
      continue
    }

    // Заголовки → жирная строка.
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line)
    if (headingMatch) {
      out.push(`<b>${escapeHtml(headingMatch[2].trim())}</b>`)
      continue
    }

    // Списки (-, *, •, "1.", "2)") → «— текст».
    const listMatch = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (listMatch) {
      line = `— ${listMatch[1]}`
    }

    // Инлайн: **bold** и __bold__ → <b>; *italic* и _italic_ → <i>.
    // Экранируем HTML-спецсимволы ДО расстановки тегов, чтобы не задеть их же.
    let escaped = escapeHtml(line)
    // **bold**/__bold__ снимаются ПЕРВЫМИ — после этого в строке не остаётся
    // двойных звёздочек/подчёркиваний, поэтому одиночные *italic*/_italic_
    // ниже матчатся без риска зацепить остатки bold-разметки (без lookbehind —
    // target ES6 в tsconfig.json его не поддерживает).
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    escaped = escaped.replace(/__(.+?)__/g, "<b>$1</b>")
    escaped = escaped.replace(/\*(.+?)\*/g, "<i>$1</i>")
    escaped = escaped.replace(/_(.+?)_/g, "<i>$1</i>")
    // Инлайн-код `code` → <code>.
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>")

    out.push(escaped)
  }

  // Схлопываем 3+ пустых строк подряд в 2 (абзац).
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
