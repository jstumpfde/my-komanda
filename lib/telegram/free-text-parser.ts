// lib/telegram/free-text-parser.ts
// Детерминированный rule-based фолбэк-парсер свободного текста для
// @TiketCompany24bot — используется:
//   1) как быстрый путь ДО AI-вызова, если распознан уверенный полный запрос
//      (маршрут + дата) — экономим AI-вызов;
//   2) как фолбэк, когда AI-вызов технически недоступен (aiParseFreeText
//      вернул status: "error") — квота/сеть/прокси. Пользователь НЕ должен
//      замечать отсутствие AI, если rule-based способен разобрать запрос.
//
// Расширенный словарь городов (~150 записей: РФ + СНГ + Европа/Азия/курорты),
// нормализация (регистр, ё→е), матчинг по префиксу от 3 символов и по
// "усечению" русских падежных окончаний (Москву → москв → москва).

// ─── Словарь городов ────────────────────────────────────────────────────────

export const CITY_ALIASES: Record<string, string> = {
  // РФ
  "москва": "MOW", "мск": "MOW", "moscow": "MOW", "mos": "MOW", "msk": "MOW",
  "санкт-петербург": "LED", "спб": "LED", "питер": "LED", "petersburg": "LED", "saint petersburg": "LED", "spb": "LED",
  "сочи": "AER", "адлер": "AER", "sochi": "AER",
  "казань": "KZN", "kazan": "KZN",
  "екатеринбург": "SVX", "екб": "SVX", "ekaterinburg": "SVX",
  "новосибирск": "OVB", "novosibirsk": "OVB",
  "краснодар": "KRR", "krasnodar": "KRR",
  "калининград": "KGD", "kaliningrad": "KGD",
  "уфа": "UFA", "ufa": "UFA",
  "самара": "KUF", "samara": "KUF",
  "ростов": "ROV", "ростов-на-дону": "ROV", "rostov": "ROV",
  "красноярск": "KJA", "krasnoyarsk": "KJA",
  "пермь": "PEE", "perm": "PEE",
  "воронеж": "VOZ", "voronezh": "VOZ",
  "минеральные воды": "MRV", "минводы": "MRV",
  "тюмень": "TJM", "tyumen": "TJM",
  "иркутск": "IKT", "irkutsk": "IKT",
  "владивосток": "VVO", "vladivostok": "VVO",
  "омск": "OMS", "omsk": "OMS",
  "нижний новгород": "GOJ", "нижний": "GOJ", "nizhny novgorod": "GOJ",
  "волгоград": "VOG", "volgograd": "VOG",
  "анапа": "AAQ", "anapa": "AAQ",
  "челябинск": "CEK", "chelyabinsk": "CEK",
  "барнаул": "BAX", "barnaul": "BAX",
  "томск": "TOF", "tomsk": "TOF",
  "хабаровск": "KHV", "khabarovsk": "KHV",
  "мурманск": "MMK", "murmansk": "MMK",
  "белгород": "EGO", "belgorod": "EGO",
  "саратов": "RTW", "saratov": "RTW",
  "сургут": "SGC", "surgut": "SGC",
  "магнитогорск": "MQF",
  "ижевск": "IJK", "izhevsk": "IJK",
  "махачкала": "MCX", "makhachkala": "MCX",
  "грозный": "GRV", "grozny": "GRV",
  "нижневартовск": "NJC",
  "норильск": "NSK", "norilsk": "NSK",
  "петрозаводск": "PES",
  "калуга": "CLJ",
  "чебоксары": "CSY",
  "ульяновск": "ULY",
  "нальчик": "NAL",
  "владикавказ": "OGZ",

  // СНГ
  "минск": "MSQ", "minsk": "MSQ",
  "киев": "IEV", "kyiv": "IEV", "kiev": "IEV",
  "кишинёв": "KIV", "кишинев": "KIV", "chisinau": "KIV",
  "ереван": "EVN", "yerevan": "EVN",
  "тбилиси": "TBS", "tbilisi": "TBS",
  "баку": "GYD", "baku": "GYD",
  "алматы": "ALA", "almaty": "ALA",
  "астана": "NQZ", "astana": "NQZ",
  "ташкент": "TAS", "tashkent": "TAS",
  "бишкек": "FRU", "bishkek": "FRU",
  "душанбе": "DYU", "dushanbe": "DYU",
  "ашхабад": "ASB", "ashgabat": "ASB",

  // Европа
  "мюнхен": "MUC", "munich": "MUC", "muenchen": "MUC", "münchen": "MUC",
  "берлин": "BER", "berlin": "BER",
  "франкфурт": "FRA", "frankfurt": "FRA",
  "гамбург": "HAM", "hamburg": "HAM",
  "лондон": "LON", "london": "LON",
  "париж": "PAR", "paris": "PAR",
  "рим": "ROM", "rome": "ROM", "roma": "ROM",
  "милан": "MIL", "milan": "MIL", "milano": "MIL",
  "барселона": "BCN", "barcelona": "BCN",
  "мадрид": "MAD", "madrid": "MAD",
  "амстердам": "AMS", "amsterdam": "AMS",
  "прага": "PRG", "prague": "PRG", "praha": "PRG",
  "вена": "VIE", "vienna": "VIE", "wien": "VIE",
  "цюрих": "ZRH", "zurich": "ZRH",
  "женева": "GVA", "geneva": "GVA",
  "стамбул": "IST", "istanbul": "IST",
  "анталья": "AYT", "antalya": "AYT",
  "хельсинки": "HEL", "helsinki": "HEL",
  "стокгольм": "STO", "stockholm": "STO",
  "осло": "OSL", "oslo": "OSL",
  "копенгаген": "CPH", "copenhagen": "CPH",
  "рейкьявик": "REK", "reykjavik": "REK",
  "варшава": "WAW", "warsaw": "WAW",
  "будапешт": "BUD", "budapest": "BUD",
  "белград": "BEG", "belgrade": "BEG",
  "софия": "SOF", "sofia": "SOF",
  "афины": "ATH", "athens": "ATH",
  "лиссабон": "LIS", "lisbon": "LIS",
  "дублин": "DUB", "dublin": "DUB",
  "брюссель": "BRU", "brussels": "BRU",
  "ницца": "NCE", "nice": "NCE",

  // Ближний Восток / Африка
  "дубай": "DXB", "dubai": "DXB",
  "абу-даби": "AUH", "abu dhabi": "AUH",
  "доха": "DOH", "doha": "DOH",
  "шарм-эль-шейх": "SSH", "шарм": "SSH", "sharm el sheikh": "SSH",
  "хургада": "HRG", "hurghada": "HRG",
  "каир": "CAI", "cairo": "CAI",
  "тель-авив": "TLV", "tel aviv": "TLV",

  // Азия / курорты
  "бангкок": "BKK", "bangkok": "BKK",
  "пхукет": "HKT", "phuket": "HKT",
  "паттайя": "UTP", "pattaya": "UTP",
  "бали": "DPS", "денпасар": "DPS", "bali": "DPS", "denpasar": "DPS",
  "токио": "TYO", "tokyo": "TYO",
  "пекин": "BJS", "beijing": "BJS",
  "шанхай": "SHA", "shanghai": "SHA",
  "сеул": "SEL", "seoul": "SEL",
  "дели": "DEL", "delhi": "DEL",
  "мумбаи": "BOM", "mumbai": "BOM",
  "гоа": "GOI", "goa": "GOI",
  "куала-лумпур": "KUL", "kuala lumpur": "KUL",
  "сингапур": "SIN", "singapore": "SIN",
  "ханой": "HAN", "hanoi": "HAN",
  "хошимин": "SGN", "ho chi minh": "SGN",

  // Америка
  "нью-йорк": "NYC", "new york": "NYC",
  "лос-анджелес": "LAX", "los angeles": "LAX",
  "майами": "MIA", "miami": "MIA",
}

const KNOWN_IATA_CODES = new Set(Object.values(CITY_ALIASES))

// ─── Нормализация и матчинг города ──────────────────────────────────────────

function normalizeCityToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

export type CityMatch = { iata: string } | { ambiguous: string[] } | null

/** Пытается сопоставить ОДНУ нормализованную строку с городом: точное
 *  совпадение → префиксный матчинг (в обе стороны, от 3 символов) →
 *  усечение с конца по 1 символу (грубый стемминг падежных окончаний
 *  русского языка: "москву"→"москв" совпадает по префиксу с "москва"). */
function matchSingleCandidate(norm: string): CityMatch {
  if (!norm) return null

  if (CITY_ALIASES[norm]) return { iata: CITY_ALIASES[norm] }

  let candidate = norm
  while (candidate.length >= 3) {
    if (CITY_ALIASES[candidate]) return { iata: CITY_ALIASES[candidate] }

    const matches = new Set<string>()
    for (const [alias, iata] of Object.entries(CITY_ALIASES)) {
      if (alias.length < 3) continue
      if (alias.startsWith(candidate) || candidate.startsWith(alias)) matches.add(iata)
    }
    if (matches.size === 1) return { iata: [...matches][0] }
    if (matches.size > 1) return { ambiguous: [...matches] }

    candidate = candidate.slice(0, -1)
  }
  return null
}

/** Сопоставляет фразу (возможно, с "хвостом" лишних слов) с городом.
 *  Пробует: целую фразу → первые 3/2 слова → первое слово. Также распознаёт
 *  "голый" известный IATA-код (3 заглавные буквы, входящий в словарь значений). */
export function matchCityPhrase(rawPhrase: string): CityMatch {
  const trimmed = rawPhrase.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (/^[A-Z]{3}$/.test(upper) && KNOWN_IATA_CODES.has(upper)) return { iata: upper }

  const words = normalizeCityToken(trimmed).split(" ").filter(Boolean)
  if (words.length === 0) return null

  const candidates = [
    words.join(" "),
    words.slice(0, 3).join(" "),
    words.slice(0, 2).join(" "),
    words[0],
  ]
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!c || seen.has(c)) continue
    seen.add(c)
    const result = matchSingleCandidate(c)
    if (result) return result
  }
  return null
}

/** Строгое точное сопоставление (без префиксного матчинга/угадывания) — для
 *  команд /поиск и /следить, где пользователь либо пишет явный IATA-код,
 *  либо полное известное название; неоднозначность здесь не нужна. */
export function resolveCityExact(raw: string): string | null {
  const s = raw.trim()
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase()
  const norm = normalizeCityToken(s)
  return CITY_ALIASES[norm] ?? null
}

function ambiguousMessage(codes: string[]): string {
  return `Не уверен, какой город вы имеете в виду: ${codes.join(" или ")}? Уточните, пожалуйста (можно IATA-кодом).`
}

// ─── Даты ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
  "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setUTCHours(0, 0, 0, 0)
  return c
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() + days)
  return c
}

/** Строит YYYY-MM-DD из день/месяц/(год?), сегодня — если год не указан и
 *  результат уже прошёл, откатывает на год вперёд (не хардкодим "2026"). */
function buildIso(day: number, month: number, year: number | undefined, today: Date): string | null {
  if (!day || !month || day > 31 || month > 12) return null
  let y = year ?? today.getUTCFullYear()
  if (year != null && year < 100) y += 2000
  const candidate = new Date(Date.UTC(y, month - 1, day))
  if (year == null && candidate < startOfDay(today)) {
    candidate.setUTCFullYear(candidate.getUTCFullYear() + 1)
  }
  return iso(candidate)
}

/** Ближайшие суббота-воскресенье от today (включительно, если сегодня —
 *  суббота). Вычисляется от переданной даты, не хардкодится. */
export function nextWeekend(today: Date): { from: string; to: string } {
  const d = startOfDay(today)
  const day = d.getUTCDay() // 0=вс..6=сб
  const daysUntilSat = day === 6 ? 0 : (6 - day) % 7
  const sat = addDays(d, daysUntilSat)
  const sun = addDays(sat, 1)
  return { from: iso(sat), to: iso(sun) }
}

export interface DateExtraction {
  from: string
  to?: string
  matchStart: number
  matchEnd: number
}

/** Ищет ПЕРВОЕ дата-подобное выражение в тексте (не привязано к началу/концу
 *  строки — в отличие от parseDateArg в tiket-bot.ts, который парсит только
 *  весь аргумент команды целиком). Возвращает диапазон символов совпадения,
 *  чтобы вызывающий код мог вырезать его перед извлечением городов. */
export function extractDate(text: string, today: Date = new Date()): DateExtraction | null {
  // 1) Относительные даты
  let m = text.match(/послезавтра/iu)
  if (m) {
    const d = addDays(startOfDay(today), 2)
    return { from: iso(d), matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }
  m = text.match(/завтра/iu)
  if (m) {
    const d = addDays(startOfDay(today), 1)
    return { from: iso(d), matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }
  m = text.match(/на\s+выходн(?:ые|ых)/iu)
  if (m) {
    const { from, to } = nextWeekend(today)
    return { from, to, matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }

  // 2) "с D по D месяца"
  m = text.match(/с\s+(\d{1,2})\s+по\s+(\d{1,2})\s+([а-яё]+)/iu)
  if (m) {
    const monthWord = m[3].toLowerCase().replace(/ё/g, "е")
    const month = MONTHS[monthWord]
    if (month) {
      const from = buildIso(Number(m[1]), month, undefined, today)
      const to = buildIso(Number(m[2]), month, undefined, today)
      if (from && to) return { from, to, matchStart: m.index!, matchEnd: m.index! + m[0].length }
    }
  }

  // 3) Полный числовой диапазон "D.M[.Y]-D.M[.Y]" (или через "/")
  m = text.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\s*[-–—]\s*(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/)
  if (m) {
    const from = buildIso(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined, today)
    const to = buildIso(Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : (m[3] ? Number(m[3]) : undefined), today)
    if (from && to) return { from, to, matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }

  // 4) Короткий диапазон "D-D.M[.Y]" — месяц указан один раз, в конце
  m = text.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/)
  if (m) {
    const month = Number(m[3])
    const year = m[4] ? Number(m[4]) : undefined
    const from = buildIso(Number(m[1]), month, year, today)
    const to = buildIso(Number(m[2]), month, year, today)
    if (from && to) return { from, to, matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }

  // 5) Одна дата "D.M[.Y]" или "D/M[/Y]"
  m = text.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/)
  if (m) {
    const from = buildIso(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined, today)
    if (from) return { from, matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }

  // 6) "D месяца" (родительный падеж, без года)
  m = text.match(/(\d{1,2})\s+([а-яё]+)/iu)
  if (m) {
    const monthWord = m[2].toLowerCase().replace(/ё/g, "е")
    const month = MONTHS[monthWord]
    if (month) {
      const from = buildIso(Number(m[1]), month, undefined, today)
      if (from) return { from, matchStart: m.index!, matchEnd: m.index! + m[0].length }
    }
  }

  return null
}

// ─── Бюджет ─────────────────────────────────────────────────────────────────

export interface BudgetExtraction {
  amount: number
  matchStart: number
  matchEnd: number
}

/** "до 6 тысяч" / "до 6к" / "6000 руб" / "до 6000" → сумма в рублях. */
export function extractBudget(text: string): BudgetExtraction | null {
  // "до N тысяч/тыс/к/k" (с "до" или без). \b не годится после кириллицы
  // (ASCII-only word boundary) — ограничиваем явно: конец строки или не-буква.
  let m = text.match(/(?:до\s+)?(\d[\d ]{0,6})\s*(тысяч|тыс\.?|к|k)(?![а-яa-z])/iu)
  if (m) {
    const amount = Number(m[1].replace(/\s/g, "")) * 1000
    if (amount > 0) return { amount, matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }
  // "до N" (число целиком, без единицы, не являющееся началом даты)
  m = text.match(/до\s+(\d[\d ]{2,6})\b(?!\s*[.\/]\d)/iu)
  if (m) {
    const amount = Number(m[1].replace(/\s/g, ""))
    if (amount > 0) return { amount, matchStart: m.index!, matchEnd: m.index! + m[0].length }
  }
  return null
}

// ─── Города в тексте ────────────────────────────────────────────────────────

function cleanupCityPhrase(raw: string): string {
  return raw
    .trim()
    .replace(/^(в|во|до|из|с|со|к)\s+/iu, "")
    .replace(/[\s\-–—.,!?]+$/u, "")
    .trim()
}

interface CityPairResult {
  status: "ok"
  origin: string | null
  destination: string | null
}
interface AmbiguousResult {
  status: "ambiguous"
  message: string
}

function resolvePair(rawOrigin: string, rawDest: string): CityPairResult | AmbiguousResult {
  const origin = matchCityPhrase(cleanupCityPhrase(rawOrigin))
  const dest = matchCityPhrase(cleanupCityPhrase(rawDest))
  if (origin && "ambiguous" in origin) return { status: "ambiguous", message: ambiguousMessage(origin.ambiguous) }
  if (dest && "ambiguous" in dest) return { status: "ambiguous", message: ambiguousMessage(dest.ambiguous) }
  return { status: "ok", origin: origin?.iata ?? null, destination: dest?.iata ?? null }
}

/** Извлекает маршрут из текста БЕЗ даты/бюджета (их нужно вырезать заранее).
 *  Порядок паттернов — от самых явных к самым общим. */
export function extractCities(text: string): CityPairResult | AmbiguousResult {
  const t = text.trim()
  if (!t) return { status: "ok", origin: null, destination: null }

  let m = t.match(/из\s+(.+?)\s+в\s+(.+)/iu)
  if (m) return resolvePair(m[1], m[2])

  m = t.match(/откуда\s+(.+?)\s+куда\s+(.+)/iu)
  if (m) return resolvePair(m[1], m[2])

  m = t.match(/(.+?)\s[-–—]\s(.+)/u)
  if (m) return resolvePair(m[1], m[2])

  m =
    t.match(/билет(?:ы|ов)?\s+(?:в|до)\s+(.+)/iu) ||
    t.match(/(?:^|\s)в\s+(.+)/iu) ||
    t.match(/(?:^|\s)до\s+(.+)/iu)
  if (m) {
    const dest = matchCityPhrase(cleanupCityPhrase(m[1]))
    if (dest && "ambiguous" in dest) return { status: "ambiguous", message: ambiguousMessage(dest.ambiguous) }
    return { status: "ok", origin: null, destination: dest?.iata ?? null }
  }

  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 2) return resolvePair(words[0], words[1])

  return { status: "ok", origin: null, destination: null }
}

// ─── Главная функция ────────────────────────────────────────────────────────

export interface RuleParsedQuery {
  originIata: string | null
  destinationIata: string | null
  dateFrom: string | null
  dateTo: string | null
  maxPriceRub: number | null
}

export type RuleParseOutcome =
  | { status: "ok"; data: RuleParsedQuery; confident: boolean }
  | { status: "ambiguous"; message: string }
  | { status: "no_match" }

/** Rule-based фолбэк-разбор свободного текста. НЕ гейтит AI-путь — вызывается
 *  как быстрый путь ДО AI (если результат "уверенный", т.е. маршрут+дата
 *  распознаны целиком) и как фолбэк, если AI-вызов технически недоступен. */
export function parseFreeTextRuleBased(rawText: string, today: Date = new Date()): RuleParseOutcome {
  let text = rawText

  const dateResult = extractDate(text, today)
  if (dateResult) {
    text = text.slice(0, dateResult.matchStart) + " " + text.slice(dateResult.matchEnd)
  }

  const budgetResult = extractBudget(text)
  if (budgetResult) {
    text = text.slice(0, budgetResult.matchStart) + " " + text.slice(budgetResult.matchEnd)
  }

  const cityResult = extractCities(text)
  if (cityResult.status === "ambiguous") return cityResult

  const data: RuleParsedQuery = {
    originIata: cityResult.origin,
    destinationIata: cityResult.destination,
    dateFrom: dateResult?.from ?? null,
    dateTo: dateResult?.to ?? null,
    maxPriceRub: budgetResult?.amount ?? null,
  }

  const hasAnySignal = data.originIata || data.destinationIata || data.dateFrom || data.maxPriceRub
  if (!hasAnySignal) return { status: "no_match" }

  const confident = Boolean(data.originIata && data.destinationIata && data.dateFrom)
  return { status: "ok", data, confident }
}
