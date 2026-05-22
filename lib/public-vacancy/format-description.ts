// Эвристический парсер описания вакансии из анкеты Company24.
// На вход — plain text (description_json.companyDescription), на выходе —
// массив секций с подзаголовками и параграфами для рендеринга.

const SECTION_HEADERS = [
  "Честный разговор",
  "Что у нас есть",
  "Чего у нас (пока )?нет",
  "Кому это интересно",
  "Эта роль для тех, кто",
  "Что предстоит делать",
  "Зарплата",
  "Условия",
  "О компании",
  "Команда",
  "Требования",
  "Обязанности",
  "Бонусы",
  "Преимущества",
  "Мы предлагаем",
  "Что мы предлагаем",
  "Что мы ждём",
  "Этапы отбора",
  "График работы",
  "Локация",
  "Контакты",
  "Дополнительная информация",
  "По итогам 2025 года",
  "По итогам 2024 года",
  "Цель на 2026 год",
  "Цель на 2025 год",
  "Реальный продукт",
]

export interface Section {
  title?: string
  paragraphs: string[]
}

// Эвристика заголовка. Учитывает что в плотных описаниях из hh.ru заголовки
// чаще всего идут с двоеточием/тире в конце или просто как короткие фразы
// без терминальной пунктуации.
function isLikelyHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 80) return false
  // Заголовок с двоеточием в конце (классический паттерн).
  if (/[:—-]$/.test(trimmed)) {
    const body = trimmed.replace(/[:—-]$/, "").trim()
    return body.length > 0 && body.length <= 70 && body.split(/\s+/).length <= 8
  }
  // Без терминальной пунктуации — короткая фраза.
  if (/[.?!;]$/.test(trimmed)) return false
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount > 8) return false
  if (wordCount === 1 && trimmed.length < 4) return false
  // Если строка целиком в верхнем регистре длиной 2+ слов — это, скорее
  // всего, имя бренда («ГК ОРЛИНК», «ООО РОМАШКА»), не заголовок.
  const upperOnly = /^[A-ZА-ЯЁ\s\d.,«»"'()-]+$/.test(trimmed)
  if (upperOnly && wordCount >= 2 && trimmed.length < 30) return false
  return true
}

// Разбивка длинного параграфа на более короткие куски по последней точке.
// Используется для текстов из hh.ru без явной разметки на абзацы.
function splitLongParagraph(text: string, targetLen = 300, hardLimit = 500): string[] {
  if (text.length <= hardLimit) return [text]
  const sentences = text.split(/(?<=[.!?])\s+(?=[А-ЯA-Z«"])/g)
  const chunks: string[] = []
  let chunk = ""
  for (const sentence of sentences) {
    chunk += (chunk ? " " : "") + sentence
    if (chunk.length >= targetLen) {
      chunks.push(chunk)
      chunk = ""
    }
  }
  if (chunk) chunks.push(chunk)
  return chunks.length > 0 ? chunks : [text]
}

export function formatDescription(text: string): Section[] {
  if (!text) return []

  // 1. Нормализация переводов строк и пробелов.
  let normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim()

  // 2. Явные заголовки из списка — отмечаем их маркерами.
  // На входе из hh.ru текст часто без переводов строк, поэтому заголовок
  // может стоять не только после \n, но и после конца предложения (`.`,
  // `!`, `?`) с пробелом. Заголовок может оканчиваться двоеточием, тире
  // или просто пробелом.
  const headerPattern = new RegExp(
    `(?:^|\\n|(?<=[.!?]\\s))(${SECTION_HEADERS.join("|")})(?=\\s*[:—-]|\\s|,|\\.|$)`,
    "gi",
  )
  normalized = normalized.replace(headerPattern, "\n\n###$1###\n\n")

  // 3. Разбиение на блоки по двойным переводам строк.
  const blocks = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  // 4. Группировка в секции.
  const sections: Section[] = []
  let current: Section = { paragraphs: [] }

  const pushCurrent = () => {
    if (current.title || current.paragraphs.length > 0) {
      sections.push(current)
    }
  }

  // Срезает соединительные знаки в начале параграфа, оставшиеся от
  // заголовка («: текст», «— текст»), и схлопывает двойные пробелы.
  const cleanParagraph = (s: string): string =>
    s.replace(/^[\s:—–-]+/, "").replace(/\s{2,}/g, " ").trim()

  for (const block of blocks) {
    const explicitHeader = block.match(/^###(.+)###$/)

    if (explicitHeader) {
      pushCurrent()
      current = { title: explicitHeader[1].trim(), paragraphs: [] }
      continue
    }

    // Эвристика: короткая строка без пунктуации в конце — это inline-заголовок.
    if (isLikelyHeader(block)) {
      pushCurrent()
      current = { title: block.replace(/[:—-]\s*$/, ""), paragraphs: [] }
      continue
    }

    // Длинные блоки — разбиваем на параграфы по последним точкам.
    const cleaned = cleanParagraph(block)
    if (!cleaned) continue
    if (cleaned.length > 500) {
      current.paragraphs.push(...splitLongParagraph(cleaned))
    } else {
      current.paragraphs.push(cleaned)
    }
  }

  pushCurrent()

  return sections
}
