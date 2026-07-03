// Словарь стран/континентов для стоп-фактора «Гражданство» (UX-переделка,
// см. citizenship-factor-field.tsx и stop-factors-matcher.ts::matchCitizenship).
//
// Коды — ISO-2 в верхнем регистре. Континент хранится в чипе как
// "continent:<key>" (например "continent:europe", "continent:cis") — матчер
// разворачивает его в список стран на лету (см. комментарий в матчере).

/** Топ-5 быстрых стран — кнопками в попапе добавления. */
export const QUICK_CITIZENSHIP_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "RU", name: "Россия" },
  { code: "BY", name: "Беларусь" },
  { code: "KZ", name: "Казахстан" },
  { code: "UZ", name: "Узбекистан" },
  { code: "KG", name: "Киргизия" },
]

/**
 * Словарь ISO-2 → русское название. Покрывает страны СНГ + крупные
 * направления (не претендует на все 195 стран мира — неизвестный ввод
 * сохраняется как есть в верхнем регистре, см. resolveCitizenshipInput).
 */
export const CITIZENSHIP_COUNTRY_NAMES: Record<string, string> = {
  // СНГ
  RU: "Россия",
  BY: "Беларусь",
  KZ: "Казахстан",
  UZ: "Узбекистан",
  KG: "Киргизия",
  TJ: "Таджикистан",
  TM: "Туркменистан",
  AM: "Армения",
  AZ: "Азербайджан",
  MD: "Молдова",
  // Прочие популярные в найме СНГ-региона
  UA: "Украина",
  GE: "Грузия",
  // Европа
  DE: "Германия",
  FR: "Франция",
  IT: "Италия",
  ES: "Испания",
  GB: "Великобритания",
  PL: "Польша",
  NL: "Нидерланды",
  PT: "Португалия",
  SE: "Швеция",
  NO: "Норвегия",
  FI: "Финляндия",
  DK: "Дания",
  CH: "Швейцария",
  AT: "Австрия",
  CZ: "Чехия",
  SK: "Словакия",
  HU: "Венгрия",
  RO: "Румыния",
  BG: "Болгария",
  GR: "Греция",
  RS: "Сербия",
  HR: "Хорватия",
  LT: "Литва",
  LV: "Латвия",
  EE: "Эстония",
  IE: "Ирландия",
  BE: "Бельгия",
  CY: "Кипр",
  // Азия
  CN: "Китай",
  IN: "Индия",
  JP: "Япония",
  KR: "Южная Корея",
  TR: "Турция",
  IL: "Израиль",
  AE: "ОАЭ",
  SA: "Саудовская Аравия",
  TH: "Таиланд",
  VN: "Вьетнам",
  ID: "Индонезия",
  PH: "Филиппины",
  MY: "Малайзия",
  SG: "Сингапур",
  PK: "Пакистан",
  MN: "Монголия",
  // Северная Америка
  US: "США",
  CA: "Канада",
  MX: "Мексика",
  // Южная Америка
  BR: "Бразилия",
  AR: "Аргентина",
  CL: "Чили",
  CO: "Колумбия",
  PE: "Перу",
  // Африка
  EG: "Египет",
  ZA: "ЮАР",
  MA: "Марокко",
  NG: "Нигерия",
  KE: "Кения",
  // Океания
  AU: "Австралия",
  NZ: "Новая Зеландия",
}

/** Состав СНГ (без Украины и Грузии — вышли из состава) + стран-участниц ЗСТ СНГ. */
export const CIS_COUNTRY_CODES = ["RU", "BY", "KZ", "UZ", "KG", "TJ", "TM", "AM", "AZ", "MD"]

const EUROPE_CODES = [
  "DE", "FR", "IT", "ES", "GB", "PL", "NL", "PT", "SE", "NO", "FI", "DK",
  "CH", "AT", "CZ", "SK", "HU", "RO", "BG", "GR", "RS", "HR", "LT", "LV",
  "EE", "IE", "BE", "CY", "UA", "MD",
]
const ASIA_CODES = [
  "CN", "IN", "JP", "KR", "TR", "IL", "AE", "SA", "TH", "VN", "ID", "PH",
  "MY", "SG", "PK", "MN", "KZ", "UZ", "KG", "TJ", "TM", "AM", "AZ", "GE",
]
const AFRICA_CODES = ["EG", "ZA", "MA", "NG", "KE"]
const NORTH_AMERICA_CODES = ["US", "CA", "MX"]
const SOUTH_AMERICA_CODES = ["BR", "AR", "CL", "CO", "PE"]
const OCEANIA_CODES = ["AU", "NZ"]

/** Континент/пресет → набор ISO-2 кодов. Ключ используется в чипе как "continent:<key>". */
export const CONTINENT_COUNTRY_CODES: Record<string, string[]> = {
  europe:         EUROPE_CODES,
  asia:           ASIA_CODES,
  africa:         AFRICA_CODES,
  north_america:  NORTH_AMERICA_CODES,
  south_america:  SOUTH_AMERICA_CODES,
  oceania:        OCEANIA_CODES,
  cis:            CIS_COUNTRY_CODES,
}

/** Континент/пресет → русское название для UI (кнопки, чипы, сводка). */
export const CONTINENT_LABELS: Record<string, string> = {
  europe:         "Европа",
  asia:           "Азия",
  africa:         "Африка",
  north_america:  "Сев. Америка",
  south_america:  "Юж. Америка",
  oceania:        "Океания",
  cis:            "СНГ",
}

/** Префикс континент-кода в чипах, напр. "continent:europe". */
export const CONTINENT_CODE_PREFIX = "continent:"

export function isContinentCode(code: string): boolean {
  return code.startsWith(CONTINENT_CODE_PREFIX)
}

export function continentKeyFromCode(code: string): string {
  return code.slice(CONTINENT_CODE_PREFIX.length)
}

export function continentCode(key: string): string {
  return `${CONTINENT_CODE_PREFIX}${key}`
}

/** Разворачивает континент-код в список ISO-2 стран. Неизвестный ключ → []. */
export function expandContinentCode(code: string): string[] {
  if (!isContinentCode(code)) return [code]
  const key = continentKeyFromCode(code)
  return CONTINENT_COUNTRY_CODES[key] ?? []
}

/** Человекочитаемое имя для чипа/сводки: страна по словарю, континент по CONTINENT_LABELS,
 *  неизвестный ISO-2 — как есть (верхний регистр). */
export function citizenshipCodeLabel(code: string): string {
  if (isContinentCode(code)) {
    const key = continentKeyFromCode(code)
    return CONTINENT_LABELS[key] ?? key
  }
  return CITIZENSHIP_COUNTRY_NAMES[code] ?? code
}

/**
 * Резолвит произвольный пользовательский ввод (ISO-2 код ИЛИ русское
 * название страны из словаря) в ISO-2 код. Если не находится в словаре —
 * возвращает ввод как есть в верхнем регистре (сохраняем поведение "не ломаем
 * то, что не знаем").
 */
export function resolveCitizenshipInput(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const upper = trimmed.toUpperCase()
  if (CITIZENSHIP_COUNTRY_NAMES[upper]) return upper
  const byName = Object.entries(CITIZENSHIP_COUNTRY_NAMES)
    .find(([, name]) => name.toLowerCase() === trimmed.toLowerCase())
  if (byName) return byName[0]
  return upper
}
