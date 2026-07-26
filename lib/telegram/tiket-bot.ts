// lib/telegram/tiket-bot.ts
// Двусторонний Telegram-бот @TiketCompany24bot (Бизнес-ассистент → Авиабилеты).
// Платформенный бот (НЕ per-tenant, в отличие от lib/telegram/candidate-bot.ts):
// один токен на всю платформу (env TELEGRAM_BOT_TOKEN), пользователи —
// привязанные через /start <linkToken> сотрудники компаний (user_telegram_links).
//
// Публичный бот — команды (кроме /start) работают ТОЛЬКО для привязанных chatId.
//
// Обработчик переиспользуется и вебхуком (app/api/telegram/tiket-bot/webhook),
// и dev-поллером (scripts/tiket-bot-poll.ts) — единая точка входа handleTiketBotUpdate.

import Anthropic from "@anthropic-ai/sdk"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { userTelegramLinks, flightPriceWatches, users, type FlightPriceWatch } from "@/lib/db/schema"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { runFlightSearch } from "@/lib/business-assistant/flights/run-search"
import { formatBaggageLabel } from "@/lib/business-assistant/flights/baggage"
import type { FlightOffer, FlightSearchParams, TripClass } from "@/lib/business-assistant/flights/types"
import { CITY_ALIASES, resolveCityExact, parseFreeTextRuleBased, type RuleParsedQuery } from "./free-text-parser"

export const TIKET_BOT_USERNAME = "TiketCompany24bot"

// ─── Telegram Bot API — обёртки (только fetch, без сторонних SDK) ─────────

export function tiketBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN
}

export async function tgSend(chatId: string | number, text: string): Promise<boolean> {
  const token = tiketBotToken()
  if (!token) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch (err) {
    console.warn("[tiket-bot] sendMessage failed:", err)
    return false
  }
}

export async function tgSendWithKeyboard(
  chatId: string | number,
  text: string,
  keyboard: { text: string; callback_data: string }[][],
): Promise<boolean> {
  const token = tiketBotToken()
  if (!token) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
      }),
    })
    return res.ok
  } catch (err) {
    console.warn("[tiket-bot] sendMessage(keyboard) failed:", err)
    return false
  }
}

export async function tgAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = tiketBotToken()
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200) }),
    })
  } catch (err) {
    console.warn("[tiket-bot] answerCallbackQuery failed:", err)
  }
}

// ─── IATA-словарь городов (для команд /поиск, /следить) ────────────────────
// Единый источник — lib/telegram/free-text-parser.ts (CITY_ALIASES, ~150
// записей РФ+СНГ+Европа/Азия/курорты), НЕ дублируем здесь. Команды используют
// строгое точное сопоставление (resolveCityExact) — без угадывания по
// префиксу/падежным окончаниям, которое нужно только для свободного текста.

export const CITY_IATA = CITY_ALIASES

/** Резолвит "MOW" / "москва" / "Москва" → IATA-код (3 заглавные буквы) или null. */
export function resolveCityToIata(raw: string): string | null {
  return resolveCityExact(raw)
}

// ─── Разбор дат из команд (DD.MM[.YYYY] или DD.MM-DD.MM) ──────────────────

const CURRENT_YEAR_FALLBACK = new Date().getUTCFullYear()

function normalizeDMY(d: string, m: string, y?: string): string | null {
  const day = Number(d)
  const month = Number(m)
  if (!day || !month || day > 31 || month > 12) return null
  let year = y ? Number(y) : CURRENT_YEAR_FALLBACK
  if (year < 100) year += 2000
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  // Дата уже прошла в этом году без явного года — считаем, что имелся в виду следующий год.
  if (!y) {
    const candidate = new Date(`${iso}T00:00:00Z`)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    if (candidate < today) {
      return `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  return iso
}

/** "30.08" | "30.08.2026" | "10.08-20.08" → { from, to? } в ISO, либо null. */
export function parseDateArg(raw: string): { from: string; to?: string } | null {
  const s = raw.trim()
  const rangeMatch = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s*-\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
  if (rangeMatch) {
    const [, d1, m1, y1, d2, m2, y2] = rangeMatch
    const from = normalizeDMY(d1, m1, y1)
    const to = normalizeDMY(d2, m2, y2 ?? y1)
    if (!from || !to) return null
    return { from, to }
  }
  const singleMatch = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
  if (singleMatch) {
    const [, d, m, y] = singleMatch
    const from = normalizeDMY(d, m, y)
    if (!from) return null
    return { from }
  }
  return null
}

// ─── Разбор команд ──────────────────────────────────────────────────────────

export interface ParsedSearchCommand {
  originIata: string
  destinationIata: string
  dateFrom: string
  dateTo?: string
}

export interface ParsedWatchCommand extends ParsedSearchCommand {
  maxPriceRub?: number
}

/** "/поиск MOW LED 30.08" | "/поиск Москва Питер 10.08-20.08" */
export function parseSearchCommand(text: string): ParsedSearchCommand | { error: string } {
  const parts = text.trim().split(/\s+/)
  parts.shift() // /поиск
  if (parts.length < 3) {
    return { error: "Формат: /поиск ОТКУДА КУДА ДАТА\nНапример: /поиск MOW LED 30.08 или /поиск MOW LED 10.08-20.08" }
  }
  const origin = resolveCityToIata(parts[0])
  const destination = resolveCityToIata(parts[1])
  if (!origin) return { error: `Не распознал город/код вылета «${parts[0]}». Используйте IATA-код (MOW) или название города.` }
  if (!destination) return { error: `Не распознал город/код прилёта «${parts[1]}». Используйте IATA-код (LED) или название города.` }
  const dates = parseDateArg(parts[2])
  if (!dates) return { error: `Не понял дату «${parts[2]}». Формат: ДД.ММ или ДД.ММ-ДД.ММ.` }
  return { originIata: origin, destinationIata: destination, dateFrom: dates.from, dateTo: dates.to }
}

/** "/следить MOW LED 30.08 [до 5000]" */
export function parseWatchCommand(text: string): ParsedWatchCommand | { error: string } {
  // \b не годится для кириллицы (ASCII-only word boundary) — ищем "до NNN" в
  // конце строки, привязываясь к пробелу/началу строки перед ним.
  const doMatch = text.match(/(?:^|\s)до\s+(\d[\d\s]*)\s*$/iu)
  const withoutPrice = doMatch ? text.slice(0, doMatch.index).trim() : text.trim()
  const base = parseSearchCommand(withoutPrice.replace(/^\/следить/i, "/поиск"))
  if ("error" in base) return base
  const maxPriceRub = doMatch ? Number(doMatch[1].replace(/\s/g, "")) : undefined
  return { ...base, maxPriceRub: maxPriceRub && maxPriceRub > 0 ? maxPriceRub : undefined }
}

// ─── Поиск (переиспользует runFlightSearch/applyFlightFilters — не дублируем) ─

function formatOffer(o: FlightOffer): string {
  const bag = formatBaggageLabel(o.baggage)
  const lines = [
    `<b>${o.priceRub.toLocaleString("ru-RU")} ₽</b> · ${o.airlineLabel}`,
    `${o.departDate}, ${o.transfers === 0 ? "прямой" : `${o.transfers} пересадка`}${o.durationMinutes ? `, ~${Math.round(o.durationMinutes / 60)} ч` : ""}`,
    bag,
  ]
  if (o.deepLink) lines.push(`<a href="${o.deepLink}">Купить</a>`)
  return lines.join("\n")
}

/** true, если среди предложений есть хотя бы один прямой рейс (transfers === 0). */
export function hasDirectOffer(offers: FlightOffer[]): boolean {
  return offers.some((o) => o.transfers === 0)
}

export async function runSearchAndFormat(cmd: ParsedSearchCommand): Promise<string> {
  const params: FlightSearchParams = {
    originIata: cmd.originIata,
    destinationIata: cmd.destinationIata,
    departDate: cmd.dateFrom,
    departDateTo: cmd.dateTo,
    adults: 1,
    tripClass: "economy" as TripClass,
  }
  const result = await runFlightSearch(params, { sortBy: "price" })
  const combined = [...result.direct, ...result.combo]
  if (combined.length === 0) {
    return `По маршруту ${cmd.originIata} → ${cmd.destinationIata} на ${cmd.dateFrom}${cmd.dateTo ? `–${cmd.dateTo}` : ""} ничего не нашлось. Попробуйте другие даты.`
  }
  const noDirect = !hasDirectOffer(combined)
  const all = combined.sort((a, b) => a.priceRub - b.priceRub).slice(0, 5)
  const noDirectNote = noDirect ? "Прямых рейсов нет, показываю с пересадками:\n\n" : ""
  const header = `✈️ <b>${cmd.originIata} → ${cmd.destinationIata}</b>, ${cmd.dateFrom}${cmd.dateTo ? `–${cmd.dateTo}` : ""} — топ-${all.length}:\n`
  return noDirectNote + header + "\n\n" + all.map(formatOffer).join("\n\n")
}

// ─── Создание watch из команды /следить ────────────────────────────────────

export async function createWatchFromCommand(
  userId: string,
  companyId: string,
  chatId: string,
  cmd: ParsedWatchCommand,
): Promise<FlightPriceWatch> {
  const [watch] = await db
    .insert(flightPriceWatches)
    .values({
      companyId,
      userId,
      originIata: cmd.originIata,
      destinationIata: cmd.destinationIata,
      dateMode: cmd.dateTo ? "range" : "exact",
      departDate: cmd.dateFrom,
      departDateTo: cmd.dateTo ?? null,
      tripClass: "economy",
      targetPriceRub: cmd.maxPriceRub ?? null,
      notifyTelegram: true,
      telegramChatId: chatId,
      active: true,
    })
    .returning()
  return watch
}

// ─── Привязка chatId ────────────────────────────────────────────────────────

export interface LinkResult {
  ok: boolean
  companyId?: string
  userId?: string
}

/** /start <linkToken> — связывает chatId с пользователем по одноразовому токену. */
export async function linkChatByToken(chatId: string, token: string): Promise<LinkResult> {
  const [link] = await db
    .select()
    .from(userTelegramLinks)
    .where(eq(userTelegramLinks.linkToken, token))
    .limit(1)
  if (!link) return { ok: false }

  await db
    .update(userTelegramLinks)
    .set({ chatId, linkedAt: new Date() })
    .where(eq(userTelegramLinks.id, link.id))

  return { ok: true, companyId: link.companyId, userId: link.userId }
}

/** Находит привязку по chatId (для гейта команд — только привязанные chatId). */
export async function findLinkByChatId(chatId: string) {
  const [link] = await db
    .select()
    .from(userTelegramLinks)
    .where(eq(userTelegramLinks.chatId, chatId))
    .limit(1)
  return link ?? null
}

// ─── Анти-спам: 10 ответов/мин на chatId (in-memory, per-instance) ─────────

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000
const rateLimitLog = new Map<string, number[]>()

/** true, если чат ЕЩЁ может получить ответ (и регистрирует эту попытку). */
export function checkRateLimit(chatId: string, now = Date.now()): boolean {
  const arr = (rateLimitLog.get(chatId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (arr.length >= RATE_LIMIT_MAX) {
    rateLimitLog.set(chatId, arr)
    return false
  }
  arr.push(now)
  rateLimitLog.set(chatId, arr)
  return true
}

/** Только для тестов — сбрасывает счётчики анти-спама. */
export function resetRateLimitForTests(): void {
  rateLimitLog.clear()
}

// ─── AI-разбор свободного текста (Haiku) ───────────────────────────────────
//
// AI-разбор — ВСЕГДА первый шаг для любого некомандного текста, на любом
// языке. Словарь CITY_IATA — только быстрый путь для команд /поиск и
// /следить (когда пользователь уже пишет IATA-код или знакомое название);
// свободный текст он НЕ фильтрует и не блокирует до AI-вызова.

export interface AiParsedQuery {
  originIata: string | null
  destinationIata: string | null
  dateFrom: string | null
  dateTo: string | null
  maxPriceRub: number | null
}

export type AiParseOutcome =
  | { status: "ok"; data: AiParsedQuery }
  | { status: "not_about_flights" }
  | { status: "error" }

const AI_PARSE_SYSTEM = `Ты — парсер запросов на поиск авиабилетов. Пользователь пишет на ЛЮБОМ языке, любыми сокращениями, с опечатками, в любом порядке слов (например: "Из Мюнхен в Москву 2.08.2026", "Mun - Mos 02.08.26", "Откуда Mun - куда Mos 02.08.26").
Сегодня ${new Date().toISOString().slice(0, 10)}.

Верни ТОЛЬКО валидный JSON без markdown-обёртки:
{
  "originIata": "IATA-код города вылета (3 буквы) или null",
  "destinationIata": "IATA-код города назначения (3 буквы) или null",
  "dateFrom": "YYYY-MM-DD или null",
  "dateTo": "YYYY-MM-DD или null (диапазон/выходные/гибкие даты)",
  "maxPriceRub": число в рублях или null,
  "notAboutFlights": true или false
}

Правила:
- Определяй IATA-код города САМ по любому упоминанию: полное название на любом языке, разговорное сокращение (Mun/Мюнхен→MUC, Mos/Мск→MOW, Питер→LED), код аэропорта, опечатка. Не проси уточнить код — угадывай по контексту.
- Если один из городов вообще не упомянут (ни явно, ни намёком) — оставь его null, не выдумывай.
- Даты в любом формате: "2.08.2026", "02.08.26", "2 августа", "завтра", "на выходные" (ближайшие сб-вс), "через неделю" — переведи в YYYY-MM-DD. Год без указания — ближайший будущий.
- "notAboutFlights": true — ТОЛЬКО если сообщение точно не о поиске/бронировании авиабилетов (нет городов, дат, цены, слов про полёт/командировку/билет). Если есть хоть какой-то намёк на перелёт — false, даже если данных мало.
` + AI_SAFETY_PROMPT

export async function aiParseFreeText(text: string): Promise<AiParseOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { status: "error" }
  try {
    const client = new Anthropic({ baseURL: getClaudeApiUrl() })
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      temperature: 0,
      system: AI_PARSE_SYSTEM,
      messages: [{ role: "user", content: text.slice(0, 500) }],
    })
    const content = response.content[0]
    if (content.type !== "text") return { status: "error" }
    const stripped = content.text.trim().replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "")
    const parsed = JSON.parse(stripped) as Partial<AiParsedQuery> & { notAboutFlights?: boolean }
    if (parsed.notAboutFlights === true) return { status: "not_about_flights" }
    return {
      status: "ok",
      data: {
        originIata: parsed.originIata ?? null,
        destinationIata: parsed.destinationIata ?? null,
        dateFrom: parsed.dateFrom ?? null,
        dateTo: parsed.dateTo ?? null,
        maxPriceRub: parsed.maxPriceRub ?? null,
      },
    }
  } catch (err) {
    console.warn("[tiket-bot] AI parse failed:", err instanceof Error ? err.message : err)
    return { status: "error" }
  }
}

// ─── Валидация дат из AI-разбора ────────────────────────────────────────────

/** Дата в будущем (либо сегодня) и не дальше года вперёд — иначе AI, скорее
 *  всего, ошибся (например, вернул прошедший год). */
export function isValidFutureDate(iso: string | null | undefined): iso is string {
  if (!iso) return false
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const maxDate = new Date(today)
  maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 1)
  return d >= today && d <= maxDate
}

// ─── Короткий диалоговый контекст (частичный запрос на chatId, TTL 10 мин) ─
// Позволяет уточнять недостающие поля в несколько сообщений подряд, вместо
// "не понял" с каждой новой репликой.

export interface PendingQuery {
  originIata:      string | null
  destinationIata: string | null
  dateFrom:        string | null
  dateTo:          string | null
  maxPriceRub:     number | null
}

interface PendingEntry extends PendingQuery {
  expiresAt: number
}

const PENDING_TTL_MS = 10 * 60_000
const pendingQueries = new Map<string, PendingEntry>()

export function getPendingQuery(chatId: string, now = Date.now()): PendingQuery | null {
  const p = pendingQueries.get(chatId)
  if (!p) return null
  if (now > p.expiresAt) {
    pendingQueries.delete(chatId)
    return null
  }
  return p
}

export function setPendingQuery(chatId: string, data: PendingQuery, now = Date.now()): void {
  pendingQueries.set(chatId, { ...data, expiresAt: now + PENDING_TTL_MS })
}

export function clearPendingQuery(chatId: string): void {
  pendingQueries.delete(chatId)
}

/** Только для тестов — сбрасывает диалоговый контекст. */
export function resetPendingForTests(): void {
  pendingQueries.clear()
}

/** Объединяет новый AI-разбор с накопленным контекстом чата — новые
 *  непустые поля перекрывают старые, недостающие берутся из pending. */
export function mergePendingQuery(pending: PendingQuery | null, incoming: AiParsedQuery): PendingQuery {
  return {
    originIata:      incoming.originIata ?? pending?.originIata ?? null,
    destinationIata: incoming.destinationIata ?? pending?.destinationIata ?? null,
    dateFrom:        isValidFutureDate(incoming.dateFrom) ? incoming.dateFrom : (pending?.dateFrom ?? null),
    dateTo:          incoming.dateTo ?? pending?.dateTo ?? null,
    maxPriceRub:     incoming.maxPriceRub ?? pending?.maxPriceRub ?? null,
  }
}

/** Что не хватает для запуска поиска, человеческим языком по-русски.
 *  Если не назван город вылета — подсказываем дефолт MOW (Москва). */
export function missingFieldsPrompt(p: PendingQuery): string {
  const route = p.originIata && p.destinationIata ? `${p.originIata}→${p.destinationIata}` : null
  if (route && !p.dateFrom) return `Куда лететь понял: ${route}. На какую дату?`
  if (!p.originIata && !p.destinationIata) return `Не понял маршрут. Откуда и куда лететь?`
  if (!p.originIata) return `Куда лететь — понял (${p.destinationIata}). А откуда вылет? (если из Москвы — просто напишите «Москва»)`
  if (!p.destinationIata) return `Откуда лететь — понял (${p.originIata}). А куда?`
  return `Уточните, пожалуйста: город вылета, город назначения и дату.`
}

// ─── Тексты ─────────────────────────────────────────────────────────────────

export const HELP_TEXT =
  `✈️ <b>Company24 — Авиабилеты</b>\n\n` +
  `/поиск ОТКУДА КУДА ДАТА — топ-5 предложений\n` +
  `  например: <code>/поиск MOW LED 30.08</code> или <code>/поиск MOW LED 10.08-20.08</code>\n\n` +
  `/следить ОТКУДА КУДА ДАТА [до ЦЕНА] — создать отслеживание цены\n` +
  `  например: <code>/следить MOW LED 30.08 до 5000</code>\n\n` +
  `/мои — список ваших отслеживаний\n` +
  `/стоп — выключить Telegram-уведомления\n` +
  `/help — эта справка\n\n` +
  `Можно и свободным текстом: «найди билеты в питер на выходные до 6 тысяч».`

export const NOT_LINKED_TEXT =
  `Этот чат ещё не привязан к аккаунту Company24.\n` +
  `Откройте «Мой ассистент → Авиабилеты → Отслеживания» и нажмите «Привязать Telegram», чтобы получить персональную ссылку.`

export const START_NO_TOKEN_TEXT =
  `Привет! Я бот Company24 для поиска и отслеживания цен на авиабилеты. ✈️\n\n` +
  `Чтобы пользоваться командами, привяжите этот чат к своему аккаунту: ` +
  `«Мой ассистент → Авиабилеты → Отслеживания → Привязать Telegram».`

// ─── Формат списка watch'ей для /мои ────────────────────────────────────────

export function formatWatchLine(w: FlightPriceWatch): string {
  const dates = w.dateMode === "range" && w.departDateTo ? `${w.departDate}–${w.departDateTo}` : w.departDate
  const price = w.lastPriceRub != null ? `${w.lastPriceRub.toLocaleString("ru-RU")} ₽` : "ещё не проверено"
  const target = w.targetPriceRub != null ? ` (цель ${w.targetPriceRub.toLocaleString("ru-RU")} ₽)` : ""
  const status = w.active ? "" : " ⏸"
  return `${w.originIata} → ${w.destinationIata}, ${dates}${status}\n${price}${target}`
}

// ─── Главный обработчик апдейтов ────────────────────────────────────────────

export interface TgUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
    text?: string
  }
  callback_query?: {
    id: string
    from: { id: number }
    message?: { chat: { id: number } }
    data?: string
  }
}

export async function handleTiketBotUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    return
  }
  const msg = update.message
  if (!msg || typeof msg.text !== "string") return

  const chatId = String(msg.chat.id)
  const text = msg.text.trim()

  if (!checkRateLimit(chatId)) return // тихо игнорируем — анти-спам

  if (text.startsWith("/start")) {
    await handleStart(chatId, text)
    return
  }

  const link = await findLinkByChatId(chatId)
  if (!link) {
    // Публичный бот — команды только для привязанных. /start без токена уже
    // обработан выше; всё остальное от непривязанных — вежливый отказ.
    await tgSend(chatId, NOT_LINKED_TEXT)
    return
  }

  if (text === "/help" || text === "/start") {
    await tgSend(chatId, HELP_TEXT)
  } else if (text.startsWith("/поиск")) {
    await handleSearchCommand(chatId, text)
  } else if (text.startsWith("/следить")) {
    await handleWatchCommand(chatId, link.userId, link.companyId, text)
  } else if (text === "/мои") {
    await handleMyWatches(chatId, link.userId)
  } else if (text === "/стоп") {
    await handleStopCommand(chatId, link.userId)
  } else {
    await handleFreeText(chatId, link.userId, link.companyId, text)
  }
}

async function fetchUserFirstName(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ firstName: users.firstName, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!u) return null
  return u.firstName || u.name?.split(" ")[0] || null
}

async function handleStart(chatId: string, text: string): Promise<void> {
  // Повторный /start уже привязанного чата — не "привяжите чат", а честный
  // статус (баг из фидбэка: раньше отвечали START_NO_TOKEN_TEXT, даже если
  // чат давно связан).
  const existingLink = await findLinkByChatId(chatId)
  if (existingLink) {
    const name = await fetchUserFirstName(existingLink.userId)
    await tgSend(chatId, `Чат уже привязан${name ? `, ${name}` : ""}. Пишите запрос или /help.`)
    return
  }

  const token = text.slice("/start".length).trim()
  if (!token) {
    await tgSend(chatId, START_NO_TOKEN_TEXT)
    return
  }
  const result = await linkChatByToken(chatId, token)
  if (!result.ok) {
    await tgSend(chatId, "Ссылка недействительна или уже использована. Сгенерируйте новую на странице «Отслеживания».")
    return
  }
  await tgSend(chatId, "✅ Привязано! Теперь доступны команды — /help покажет список.")
}

async function handleSearchCommand(chatId: string, text: string): Promise<void> {
  const parsed = parseSearchCommand(text)
  if ("error" in parsed) {
    await tgSend(chatId, parsed.error)
    return
  }
  await tgSend(chatId, "Ищу…")
  const reply = await runSearchAndFormat(parsed)
  await tgSend(chatId, reply)
}

async function handleWatchCommand(chatId: string, userId: string, companyId: string, text: string): Promise<void> {
  const parsed = parseWatchCommand(text)
  if ("error" in parsed) {
    await tgSend(chatId, parsed.error)
    return
  }
  const watch = await createWatchFromCommand(userId, companyId, chatId, parsed)
  const target = watch.targetPriceRub != null ? ` до ${watch.targetPriceRub.toLocaleString("ru-RU")} ₽` : ""
  await tgSend(chatId, `👁 Слежу за ${watch.originIata} → ${watch.destinationIata}${target}. Сообщу о падении цены сюда.`)
}

async function handleMyWatches(chatId: string, userId: string): Promise<void> {
  const watches = await db
    .select()
    .from(flightPriceWatches)
    .where(eq(flightPriceWatches.userId, userId))
    .orderBy(desc(flightPriceWatches.createdAt))
    .limit(10)

  if (watches.length === 0) {
    await tgSend(chatId, "У вас пока нет отслеживаний. Создайте: /следить MOW LED 30.08")
    return
  }

  for (const w of watches) {
    const keyboard = [[
      { text: w.active ? "⏸ Пауза" : "▶️ Возобновить", callback_data: `watch_toggle:${w.id}` },
      { text: "🗑 Удалить", callback_data: `watch_delete:${w.id}` },
    ]]
    await tgSendWithKeyboard(chatId, formatWatchLine(w), keyboard)
  }
}

async function handleStopCommand(chatId: string, userId: string): Promise<void> {
  await db
    .update(flightPriceWatches)
    .set({ notifyTelegram: false })
    .where(and(eq(flightPriceWatches.userId, userId), eq(flightPriceWatches.notifyTelegram, true)))
  await tgSend(chatId, "🔕 Telegram-уведомления отключены для всех ваших отслеживаний. Колокольчик на сайте продолжит работать.")
}

/** true, если разбор (AI или rule-based) даёт хоть какой-то полезный сигнал —
 *  стоит его использовать вместо честного "AI недоступен"/"не понял". */
function hasUsefulSignal(q: RuleParsedQuery): boolean {
  return Boolean(q.originIata || q.destinationIata || q.dateFrom || q.maxPriceRub)
}

/** Общий "финиш" для свободного текста — что для AI-пути, что для
 *  rule-based: объединяет с диалоговым контекстом, при неполном запросе
 *  переспрашивает недостающее, при полном — ищет и (если задан бюджет)
 *  заодно ставит слежение. */
async function proceedWithParsedQuery(
  chatId: string,
  userId: string,
  companyId: string,
  incoming: RuleParsedQuery,
  pendingBefore: PendingQuery | null,
): Promise<void> {
  const merged = mergePendingQuery(pendingBefore, incoming)

  if (!merged.originIata || !merged.destinationIata || !merged.dateFrom) {
    setPendingQuery(chatId, merged)
    await tgSend(chatId, missingFieldsPrompt(merged))
    return
  }

  clearPendingQuery(chatId)
  const cmd: ParsedWatchCommand = {
    originIata: merged.originIata,
    destinationIata: merged.destinationIata,
    dateFrom: merged.dateFrom,
    dateTo: merged.dateTo ?? undefined,
    maxPriceRub: merged.maxPriceRub ?? undefined,
  }
  await tgSend(chatId, "Ищу…")
  const reply = await runSearchAndFormat(cmd)
  await tgSend(chatId, reply)
  if (merged.maxPriceRub) {
    const maxPriceRub = merged.maxPriceRub
    void createWatchFromCommand(userId, companyId, chatId, cmd).then((w) => {
      void tgSend(chatId, `Заодно поставил слежение до ${maxPriceRub.toLocaleString("ru-RU")} ₽ (${w.originIata} → ${w.destinationIata}) — отключить: /мои`)
    })
  }
}

// Свободный текст: AI остаётся первичным парсером, НО:
//  - если rule-based фолбэк УВЕРЕННО распознал маршрут+дату — используем его
//    сразу, не тратя AI-вызов (быстрый путь);
//  - если AI недоступен технически (status: "error") ИЛИ считает, что текст
//    не про билеты, а rule-based нашёл хоть что-то полезное — используем
//    rule-based результат;
//  - сообщение "AI-разбор временно недоступен" показываем ТОЛЬКО если и
//    rule-based не смог ничего извлечь (пользователь не должен замечать
//    отсутствие AI, пока квота не восстановлена).
async function handleFreeText(chatId: string, userId: string, companyId: string, text: string): Promise<void> {
  const pendingBefore = getPendingQuery(chatId)
  const ruleResult = parseFreeTextRuleBased(text)

  if (ruleResult.status === "ambiguous") {
    await tgSend(chatId, ruleResult.message)
    return
  }

  if (ruleResult.status === "ok" && ruleResult.confident) {
    await proceedWithParsedQuery(chatId, userId, companyId, ruleResult.data, pendingBefore)
    return
  }

  const outcome = await aiParseFreeText(text)

  if (outcome.status === "ok") {
    await proceedWithParsedQuery(chatId, userId, companyId, outcome.data, pendingBefore)
    return
  }

  // AI посчитал, что это не про билеты, ИЛИ AI технически недоступен —
  // в обоих случаях пробуем rule-based результат (если он что-то нашёл)
  // прежде, чем сдаваться.
  if (ruleResult.status === "ok" && hasUsefulSignal(ruleResult.data)) {
    await proceedWithParsedQuery(chatId, userId, companyId, ruleResult.data, pendingBefore)
    return
  }

  if (pendingBefore) {
    await tgSend(chatId, missingFieldsPrompt(pendingBefore))
    return
  }

  if (outcome.status === "not_about_flights") {
    await tgSend(chatId, "Не понял запрос про авиабилеты. Используйте /поиск ОТКУДА КУДА ДАТА или /help.")
    return
  }

  // outcome.status === "error" и rule-based тоже не справился — честно
  // говорим о технической недоступности (не "не понял").
  await tgSend(chatId, "AI-разбор временно недоступен, используйте /поиск ОТКУДА КУДА ДАТА.")
}

async function handleCallbackQuery(cq: NonNullable<TgUpdate["callback_query"]>): Promise<void> {
  const chatId = cq.message?.chat.id != null ? String(cq.message.chat.id) : null
  if (!chatId || !cq.data) {
    await tgAnswerCallback(cq.id)
    return
  }
  const link = await findLinkByChatId(chatId)
  if (!link) {
    await tgAnswerCallback(cq.id, "Чат не привязан")
    return
  }

  const [action, watchId] = cq.data.split(":")
  if (!watchId) {
    await tgAnswerCallback(cq.id)
    return
  }

  if (action === "watch_toggle") {
    const [watch] = await db
      .select({ active: flightPriceWatches.active })
      .from(flightPriceWatches)
      .where(and(eq(flightPriceWatches.id, watchId), eq(flightPriceWatches.userId, link.userId)))
      .limit(1)
    if (!watch) {
      await tgAnswerCallback(cq.id, "Не найдено")
      return
    }
    await db
      .update(flightPriceWatches)
      .set({ active: !watch.active })
      .where(and(eq(flightPriceWatches.id, watchId), eq(flightPriceWatches.userId, link.userId)))
    await tgAnswerCallback(cq.id, watch.active ? "Поставлено на паузу" : "Возобновлено")
  } else if (action === "watch_delete") {
    await db
      .delete(flightPriceWatches)
      .where(and(eq(flightPriceWatches.id, watchId), eq(flightPriceWatches.userId, link.userId)))
    await tgAnswerCallback(cq.id, "Удалено")
  } else {
    await tgAnswerCallback(cq.id)
  }
}

// Экспорт для случаев, когда нужен явный флаг "нет ни одной непривязанной
// строки в БД" (используется на странице «Отслеживания», чтобы не плодить
// новые токены при повторном рендере).
export async function findExistingLink(userId: string) {
  const [link] = await db
    .select()
    .from(userTelegramLinks)
    .where(eq(userTelegramLinks.userId, userId))
    .orderBy(desc(userTelegramLinks.createdAt))
    .limit(1)
  return link ?? null
}

export async function findUnlinkedTokens(userId: string) {
  return db
    .select()
    .from(userTelegramLinks)
    .where(and(eq(userTelegramLinks.userId, userId), isNull(userTelegramLinks.chatId)))
}
