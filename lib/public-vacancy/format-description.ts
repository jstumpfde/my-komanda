// Эвристический парсер описания вакансии из анкеты Company24.
// На вход — plain text (description_json.companyDescription), на выходе —
// массив секций с подзаголовками и параграфами для рендеринга.

const SECTION_HEADERS = [
  "Честный разговор",
  "Что у нас есть",
  "Чего у нас (пока )?нет",
  "Кому это интересно",
  "Что предстоит делать",
  "Зарплата",
  "Условия",
  "О компании",
  "Требования",
  "Обязанности",
  "Бонусы",
  "Преимущества",
  "Мы предлагаем",
  "Что мы ждём",
  "Этапы отбора",
  "Контакты",
]

export interface Section {
  title?: string
  paragraphs: string[]
}

function isLikelyHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 80) return false
  if (/[.?!:;]$/.test(trimmed)) return false
  // Содержит много "обычного" текста — скорее всего это короткая фраза.
  // Заголовком считаем строки без концовки с точкой/вопросом, не слишком длинные,
  // и состоящие в основном из «значимых» слов.
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount > 8) return false
  // Не считаем заголовком строки, состоящие из 1 короткого слова без капитализации
  // если только это не «ВАЖНО», «УСЛОВИЯ» и подобные в верхнем регистре.
  if (wordCount === 1 && trimmed.length < 4) return false
  return true
}

export function formatDescription(text: string): Section[] {
  if (!text) return []

  // 1. Нормализация переводов строк и пробелов.
  let normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim()

  // 2. Явные заголовки из списка — отмечаем их маркерами.
  const headerPattern = new RegExp(
    `(?:^|\\n)\\s*(${SECTION_HEADERS.join("|")})(?=\\s|:|,|—|-|\\.|$)`,
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
      current = { title: block, paragraphs: [] }
      continue
    }

    // Длинные блоки — разбиваем на параграфы покороче (3-4 предложения).
    if (block.length > 600) {
      const sentences = block.split(/(?<=[.!?])\s+(?=[А-ЯA-Z«"])/g)
      const chunks: string[] = []
      let chunk = ""
      for (const sentence of sentences) {
        chunk += (chunk ? " " : "") + sentence
        if (chunk.length > 300) {
          chunks.push(chunk)
          chunk = ""
        }
      }
      if (chunk) chunks.push(chunk)
      current.paragraphs.push(...chunks)
    } else {
      current.paragraphs.push(block)
    }
  }

  pushCurrent()

  return sections
}
