// Бизнес-ассистент → Авиабилеты → «Выбросы цен из Telegram».
//
// Источник: публичные веб-превью t.me/s/{channel} (без бота/API-ключа —
// Telegram отдаёт последние ~20 постов канала как обычный HTML). Парсим
// fetch+regex, без новых npm-пакетов.
//
// Список каналов — временный хардкод. Позже станет настройкой платформенного
// админа (аналог PLATFORM_ADMIN_EMAILS/SETTINGS_MIGRATIONS — управляемый
// список источников, а не вшитый в код).
//
// Отбор 27.07: живьём проверены ~24 кандидата (curl t.me/s/{ch} + прогон
// через parseTelegramChannelHtml). Порог отбора — жив + аудитория ≥10k +
// ≥40% постов последней страницы с распознанной ценой. Прошли (аудитория и
// доля цены — на дату проверки 27.07.2026):
export const FLIGHT_DEAL_CHANNELS = [
  "travelradar",         // 248K подписчиков, 70% постов с ценой
  "piratesru",           // 157K, 100%
  "nachemodanah",        // 67.6K, 100%
  "travel100500miles",   // 54.4K, 85%
  "vandroukiru",         // 402K, 79% — «Способы путешествовать почти бесплатно»
  "chartergorit",        // 22.8K, 85% — «Чартер горит!»
  "trvlclick",           // 186K, 100% — «Трэвел Клик»
  "travelbelka",         // 70.8K, 67% — Travelbelka.ru
  "toursmsk",            // 28.8K, 90% — «Дешёвые и горящие туры из Москвы»
  "triptodreamru",       // 104K, 100% — TripToDream
] as const

export type FlightDealChannel = (typeof FLIGHT_DEAL_CHANNELS)[number]

export interface ParsedTelegramDeal {
  channel:      string
  priceRub:     number
  routeFrom:    string
  routeTo:      string
  rawText:      string
  postUrl:      string
  postedAt:     Date | null
}

const PRICE_RE = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,7})\s*(?:₽|руб\.?|RUB|рублей)/iu
const PRICE_THOUSANDS_RE = /(\d+(?:[.,]\d+)?)\s*тыс\.?\s*руб/iu

// Ни один из 10 отобранных 27.07 каналов не постит в € или $ (проверено на
// живых постах) — но некоторые кандидаты-аутсайдеры (мониторинг чартеров в
// Европу) иногда так делают, поэтому парсер готов к этому заранее. Курс —
// фиксированная константа (НЕ живой курс ЦБ, обновлять руками при сильном
// расхождении); лучше грубая рублёвая оценка для сортировки/фильтра по цене,
// чем полное исключение поста — rawText внизу карточки всё равно показывает
// исходную сумму в валюте поста.
const EUR_TO_RUB_RATE = 100
const USD_TO_RUB_RATE = 90
const PRICE_EUR_RE = /(?:€\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?))|(?:(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?)\s?€)/u
const PRICE_USD_RE = /(?:\$\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?))|(?:(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?)\s?\$)/u

// "...из Города в Город..." — самая частая формулировка направления в этих
// каналах. Ленивое сканирование между городами пропускает списки через
// запятую ("из Москвы, Уфы... в Анталью").
const ROUTE_FROM_TO_RE = /(?:^|\s)из\s+([А-ЯЁ][а-яё]+).*?\sв\s+([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)/u
// "Город - Город" / "Город — Город" в начале или середине поста.
const ROUTE_DASH_RE = /([А-ЯЁA-Z][а-яёA-Za-z-]{2,25}?)\s[—–-]\s([А-ЯЁA-Z][а-яёA-Za-z-]{2,25}?)(?=\s|$|[,.—])/u

const POST_RE = /data-post="([a-zA-Z0-9_]+\/\d+)"/g
const TEXT_DIV_RE = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
const DATETIME_RE = /datetime="([^"]+)"/

function stripHtml(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#33;/g, "!")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function parsePriceRub(text: string): number | null {
  const candidates: { idx: number; value: number }[] = []
  const m1 = text.match(PRICE_RE)
  if (m1 && m1.index !== undefined) {
    const n = Number(m1[1].replace(/[.,\s]/g, ""))
    if (Number.isFinite(n) && n > 0) candidates.push({ idx: m1.index, value: n })
  }
  const m2 = text.match(PRICE_THOUSANDS_RE)
  if (m2 && m2.index !== undefined) {
    const n = Math.round(parseFloat(m2[1].replace(",", ".")) * 1000)
    if (Number.isFinite(n) && n > 0) candidates.push({ idx: m2.index, value: n })
  }
  // € / $ — только если в посте вообще нет рублёвой цены (candidates пуст):
  // если пост уже содержит ₽/руб, доверяем ей, а не грубой конвертации.
  if (candidates.length === 0) {
    const m3 = text.match(PRICE_EUR_RE)
    if (m3 && m3.index !== undefined) {
      const raw = (m3[1] ?? m3[2] ?? "").replace(/[.,\s]/g, "")
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) candidates.push({ idx: m3.index, value: Math.round(n * EUR_TO_RUB_RATE) })
    }
    const m4 = text.match(PRICE_USD_RE)
    if (m4 && m4.index !== undefined) {
      const raw = (m4[1] ?? m4[2] ?? "").replace(/[.,\s]/g, "")
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) candidates.push({ idx: m4.index, value: Math.round(n * USD_TO_RUB_RATE) })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.idx - b.idx)
  return candidates[0].value
}

function parseRoute(text: string): { from: string; to: string } | null {
  let m = text.match(ROUTE_FROM_TO_RE)
  if (m) return { from: m[1], to: m[2] }
  m = text.match(ROUTE_DASH_RE)
  if (m) return { from: m[1].trim(), to: m[2].trim() }
  return null
}

/** Парсит HTML публичного веб-превью t.me/s/{channel} в список находок с
 *  распознанной ценой. Посты без цены пропускаются — направление
 *  (route) необязательно и может быть "?", если не распозналось. */
export function parseTelegramChannelHtml(html: string, channel: string): ParsedTelegramDeal[] {
  const postMatches = [...html.matchAll(POST_RE)]
  const deals: ParsedTelegramDeal[] = []

  for (let i = 0; i < postMatches.length; i++) {
    const start = postMatches[i].index ?? 0
    const end = i + 1 < postMatches.length ? postMatches[i + 1].index ?? html.length : html.length
    const block = html.slice(start, end)
    const postId = postMatches[i][1] // "channel/12345"

    const textMatch = block.match(TEXT_DIV_RE)
    if (!textMatch) continue
    const rawText = stripHtml(textMatch[1])

    const priceRub = parsePriceRub(rawText)
    if (priceRub === null) continue // посты без цены пропускаем

    const route = parseRoute(rawText)
    const dateMatch = block.match(DATETIME_RE)
    const postedAt = dateMatch ? new Date(dateMatch[1]) : null

    deals.push({
      channel,
      priceRub,
      routeFrom: route?.from ?? "?",
      routeTo: route?.to ?? "?",
      rawText,
      postUrl: `https://t.me/${postId}`,
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    })
  }

  return deals
}

async function fetchChannelHtml(channel: string): Promise<string> {
  const res = await fetch(`https://t.me/s/${channel}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Company24Bot/1.0; +https://company24.pro)" },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`t.me/s/${channel} → HTTP ${res.status}`)
  return res.text()
}

/** Опрашивает все настроенные каналы и возвращает объединённый список
 *  находок. Ошибка одного канала не должна валить остальные. */
export async function fetchAllTelegramDeals(): Promise<ParsedTelegramDeal[]> {
  const results = await Promise.allSettled(
    FLIGHT_DEAL_CHANNELS.map(async (channel) => {
      const html = await fetchChannelHtml(channel)
      return parseTelegramChannelHtml(html, channel)
    }),
  )
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
}
