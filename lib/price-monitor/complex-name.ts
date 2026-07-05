// Эвристика извлечения названия ЖК/резорта из заголовка листинга Airbnb.
// Хозяева обычно пишут "Sea view Apartments by Mida Grande 4+*" или
// "Apartments in Bang Tao Beach Residence" — вытаскиваем именно название
// комплекса. Если явного маркера комплекса нет — возвращаем null (не
// выдумываем несуществующее название).
//
// NB: это ЧИСТО вспомогательная авто-подсказка (заполняет поле, которое
// потом можно вручную поправить/очистить) — НЕ основной механизм группировки
// «мой ЖК» (см. docs/architecture/PRICE-MONITOR-VISION-2026-07.md: комплекс
// определяется курацией/радиусом, а не по имени).

const MAX_LENGTH = 40

// Маркеры-предлоги, после которых обычно идёт название комплекса.
// Порядок важен: более специфичные — раньше.
const MARKER_PATTERNS: RegExp[] = [
  // англ.: "... by X", "... at X", "... in X"
  /\bby\s+(.+)$/i,
  /\bat\s+(.+)$/i,
  /\bin\s+(.+)$/i,
  // рус.: "... в комплексе X", "... на курорте X", "... в X"
  /\bв\s+комплексе\s+(.+)$/i,
  /\bна\s+курорте\s+(.+)$/i,
  /\bв\s+(.+)$/i,
]

// "X Resort" / "X Residence" / "X Condo" — сам суффикс входит в название.
// Регистрозависимо: и слова кандидата, и сам суффикс должны быть с большой
// буквы (Title Case) — так это обычно и пишут для настоящего имени комплекса
// ("Mida Grande Resort"). Суффикс с маленькой буквы ("modern condo", "cozy
// resort") — это описание типа жилья, а не название ЖК, пропускаем.
const SUFFIX_PATTERN = /\b([A-ZА-ЯЁ][\w'-]*(?:\s+[A-ZА-ЯЁ][\w'-]*){0,4}\s+(?:Resort|Residences?|Condo(?:minium)?s?))\b/

// Хвостовые квалификаторы/шум, которые нужно обрезать с концов кандидата:
// размеры комнат (4+*, 2br, 1-bedroom), площадь (58m2, 58 m²), виды
// (Pool View, Sea view, Ocean View), общие слова (Apartment(s), Villa, Studio),
// звёзды/квалификаторы (4+*), одиночные числа.
const TRAILING_NOISE = [
  /\d+\s*\+?\s*\*+/g, // "4+*", "5*"
  /\b\d+\s*(?:br|bedroom|bed|bath|bathroom)s?\b/gi, // "2br", "1-bedroom"
  /\b\d+\s*m2\b/gi,
  /\b\d+\s*m²/gi,
  /\bpool\s*view\b/gi,
  /\bsea\s*view\b/gi,
  /\bocean\s*view\b/gi,
  /\bmountain\s*view\b/gi,
  /\bgarden\s*view\b/gi,
  /\bapartments?\b/gi,
  /\bvilla[s]?\b/gi,
  /\bstudio[s]?\b/gi,
  /\bcondo(?:minium)?[s]?\b/gi,
]

function stripPunctuationEdges(value: string): string {
  return value.replace(/^[\s,.\-–—:;]+/, "").replace(/[\s,.\-–—:;]+$/, "")
}

function cleanCandidate(raw: string): string | null {
  let candidate = raw

  // Обрезаем по запятой — то, что после запятой, обычно уточнение (Pool View и т.п).
  const commaIdx = candidate.indexOf(",")
  if (commaIdx !== -1) candidate = candidate.slice(0, commaIdx)

  // Убираем известный шум (может встречаться и до, и после названия).
  for (const pattern of TRAILING_NOISE) {
    candidate = candidate.replace(pattern, " ")
  }

  candidate = candidate.replace(/\s{2,}/g, " ")
  candidate = stripPunctuationEdges(candidate)

  if (!candidate) return null
  if (candidate.length > MAX_LENGTH) candidate = candidate.slice(0, MAX_LENGTH)
  candidate = stripPunctuationEdges(candidate)

  // Кандидат должен содержать хотя бы одну букву (не только цифры/символы).
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(candidate)) return null
  // Слишком короткое (1 символ) — не похоже на название.
  if (candidate.length < 2) return null

  return candidate
}

export function extractComplexName(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  if (!trimmed) return null

  // Сначала пробуем суффиксный паттерн "X Resort/Residence/Condo" — он более
  // надёжен, т.к. явно указывает на комплекс, а не на маркер-предлог.
  const suffixMatch = trimmed.match(SUFFIX_PATTERN)
  if (suffixMatch) {
    const cleaned = cleanCandidate(suffixMatch[1])
    if (cleaned) return cleaned
  }

  for (const pattern of MARKER_PATTERNS) {
    const match = trimmed.match(pattern)
    if (!match) continue
    const cleaned = cleanCandidate(match[1])
    if (cleaned) return cleaned
  }

  return null
}
