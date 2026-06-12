// Парсер описания вакансии из анкеты Company24 (v3, Группа 31).
// Вход — plain text (description_json.companyDescription), выход — массив
// секций с заголовками и параграфами для рендеринга.
//
// История: v1 (Группа 16) и v2 (Группа 18) использовали агрессивную
// эвристику «короткая строка без точки в конце = заголовок». Это ломало
// списки вида «готов работать,/понимает X,/чувствует Y,» — каждый пункт
// превращался в отдельный «заголовок» с 0 параграфами, и текст выглядел
// как набор оборванных строк.
//
// v3 идея: единственный надёжный сигнал — пустая строка между параграфами
// (\n\n). Доверяем ей. Заголовком считаем только то, в чём мы УВЕРЕНЫ:
//   1. Явные имена секций из SECTION_HEADERS (стандартные блоки анкеты)
//   2. Полностью КАПСОВЫЕ короткие строки («ВАЖНО», «ПРО ДОХОД»)
//   3. Короткие строки, заканчивающиеся двоеточием
// Всё остальное — параграф, даже если короткий или без точки в конце.

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
  "Реальный продукт",
  "Продукт",
  "ВАЖНО",
  "ПРО ДОХОД",
]

export interface Section {
  title?:      string
  paragraphs: string[]
}

const SECTION_HEADERS_NORM = new Set(
  SECTION_HEADERS.map(h => h.toLowerCase().replace(/[()?]/g, "").replace(/\s+/g, " ").trim()),
)

// Только то, в чём УВЕРЕНЫ: явные имена секций, капсовые маркеры или строка
// с двоеточием в конце. Все остальные «короткие фразы без точки» — это
// нормальные параграфы или элементы списка, НЕ заголовки.
function isHeaderBlock(block: string): boolean {
  // Заголовок — это один логический «кусок» без переносов внутри.
  if (block.includes("\n")) return false
  const t = block.trim()
  if (!t) return false
  if (t.length > 80) return false

  // 1. Явный заголовок из словаря (case-insensitive, без знаков препинания).
  const stripped = t.replace(/[:—–\-.,]+$/, "").toLowerCase().replace(/\s+/g, " ").trim()
  if (SECTION_HEADERS_NORM.has(stripped)) return true

  // 2. Полностью капсовая короткая строка (кириллица или латиница) длиной до
  //    30 символов: «ВАЖНО», «ПРО ДОХОД», «О КОМПАНИИ».
  //    Требуем минимум 5 БУКВ или наличие пробела — иначе короткие
  //    аббревиатуры в перечислениях («США», «ОАЭ») ложно попадают в
  //    заголовки.
  if (t.length <= 30 && /^[A-ZА-ЯЁ\s\d.,!?«»"'()–—-]+$/.test(t) && /[A-ZА-ЯЁ]/.test(t)) {
    const letterCount = (t.match(/[A-ZА-ЯЁ]/g) ?? []).length
    if (letterCount >= 5 || /\s/.test(t)) return true
  }

  // 3. Двоеточие в конце короткой строки — типичный паттерн «Условия:» /
  //    «Обязанности:». Но только если внутри нет точек и не несколько слов
  //    типа предложения.
  if (/[:]$/.test(t) && t.length <= 60 && !/[.!?]/.test(t.slice(0, -1))) {
    return true
  }

  return false
}

function stripHeaderTail(s: string): string {
  return s.replace(/[\s:—–-]+$/, "").trim()
}

// Группировка очень коротких подряд идущих «строк-фрагментов» в один
// параграф. Это lifeline для списков, где каждый item был отдельным
// блоком через \n\n: «готов работать,\n\nпонимает X,\n\nчувствует Y,». В
// итоге склеиваем их через \n чтобы рендер с whitespace-pre-line показал
// их как маркированный (визуально) список.
function looksLikeListItem(s: string): boolean {
  const t = s.trim()
  if (t.length === 0 || t.length > 160) return false
  // Должна не быть полным предложением (без точки в конце или с запятой).
  return /[,;]$/.test(t) || (!/[.!?]$/.test(t) && t.length < 120)
}

// Группа 32: знаковые маркеры-заголовки, которые в hh-описаниях часто
// идут сплошняком в середине параграфа без переводов строк. Вставляем
// `\n\n` перед ними, чтобы основной splitter сработал.
const INLINE_HEADER_MARKERS = [
  "Что мы предлагаем",
  "Мы предлагаем",
  "Что мы ждём",
  "Условия",
  "Обязанности",
  "Требования",
  "О компании",
  "О нас",
  "Команда",
  "Бонусы",
  "Преимущества",
  "Этапы отбора",
  "График работы",
  "Локация",
  "Контакты",
  "Дополнительная информация",
  "Зарплата",
  "Реальный продукт",
]

function injectHeaderBreaks(text: string): string {
  // Маркер должен идти после конца предложения (.!?) + пробел/перенос, и
  // дальше обязательно `:` или `—` чтобы не ловить случайные упоминания
  // («о компании говорить рано» НЕ заголовок, а «О компании:» — да).
  // Вставляем \n\n ДО и ПОСЛЕ заголовка с двоеточием — чтобы он стал
  // отдельным блоком (isHeaderBlock его подхватит).
  // Примечание: используем capture-группу вместо lookbehind (?<=) —
  // lookbehind не поддерживается Safari < 16.4.
  const escaped = INLINE_HEADER_MARKERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  const re = new RegExp(`([.!?]\\s|\\n)(${escaped})\\s*([:—])\\s*`, "g")
  return text.replace(re, "$1\n\n$2$3\n\n")
}

export function formatDescription(text: string): Section[] {
  if (!text) return []

  // 1. Нормализация переводов строк. Внутри блока сохраняем \n — это
  //    может быть «мягкий» перенос внутри логического абзаца.
  let normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()

  if (!normalized) return []

  // 1a. Группа 32: hh-описания приходят сплошной строкой. Вставляем `\n\n`
  //     перед знаковыми маркерами секций, чтобы splitter их разделил.
  normalized = injectHeaderBreaks(normalized)

  // 2. Главное разбиение — по пустой строке (\n\n).
  const rawBlocks = normalized
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)

  // 2a. Fallback: текст без \n\n совсем. Разбиваем по \n или по
  //     предложениям (по 2-3) — лишь бы не показать одним абзацем.
  let blocks: string[]
  if (rawBlocks.length <= 1) {
    blocks = splitFallback(rawBlocks[0] ?? normalized)
  } else {
    blocks = rawBlocks
  }

  // 2b. Группа 32: если блок длинный (>400 символов) без внутренних \n —
  //     это сплошная стена, дробим её на чанки по 2-3 предложения. Иначе
  //     UI покажет неразрывный мегапараграф. Заголовочные блоки трогать
  //     не нужно — они короткие и пройдут через isHeaderBlock как есть.
  blocks = blocks.flatMap(b => {
    if (b.length > 400 && !b.includes("\n")) return splitFallback(b)
    return [b]
  })

  // 3. Группировка в секции.
  const sections: Section[] = []
  let current: Section = { paragraphs: [] }

  const pushCurrent = () => {
    if (current.title || current.paragraphs.length > 0) {
      sections.push(current)
    }
  }

  // 3a. Склеивание серии коротких «список-фрагментов» в один параграф.
  const merged: string[] = []
  let listBuf: string[] = []

  const flushList = () => {
    if (listBuf.length === 0) return
    if (listBuf.length === 1) {
      merged.push(listBuf[0])
    } else {
      merged.push(listBuf.join("\n"))
    }
    listBuf = []
  }

  for (const block of blocks) {
    if (block.includes("\n")) {
      // Многострочный блок — не трогаем, флешим предыдущий список.
      flushList()
      merged.push(block)
      continue
    }
    if (isHeaderBlock(block)) {
      flushList()
      merged.push(block)
      continue
    }
    if (looksLikeListItem(block)) {
      listBuf.push(block)
    } else {
      flushList()
      merged.push(block)
    }
  }
  flushList()

  // 4. Превращаем merged в секции.
  for (const block of merged) {
    if (isHeaderBlock(block)) {
      pushCurrent()
      current = { title: stripHeaderTail(block), paragraphs: [] }
      continue
    }
    current.paragraphs.push(block)
  }
  pushCurrent()

  return sections
}

// Fallback для текстов без явных \n\n: разбиваем по \n, иначе по
// предложениям (по 2-3), чтобы блок не остался одним мегапараграфом.
function splitFallback(text: string): string[] {
  const byNewline = text.split(/\n+/).map(s => s.trim()).filter(Boolean)
  if (byNewline.length >= 3) return byNewline

  // Разбиваем на предложения по паттерну «.!? пробел Заглавная».
  // Вместо lookbehind (?<=) — захватываем завершающий пунктуационный символ
  // в capture-группу и возвращаем его обратно при склейке через matchAll.
  // Это совместимо с Safari < 16.4, где (?<=) кидает SyntaxError.
  const normalized2 = text.replace(/\s+/g, " ")
  const sentenceRe = /([.!?])\s+(?=[A-ZА-ЯЁ«"])/g
  const sentences: string[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = sentenceRe.exec(normalized2)) !== null) {
    // m.index — позиция начала совпадения (символ .!?)
    // включаем пунктуацию в текущее предложение
    sentences.push(normalized2.slice(lastIdx, m.index + 1).trim())
    lastIdx = m.index + m[0].length
  }
  sentences.push(normalized2.slice(lastIdx).trim())
  // Отбрасываем пустые предложения (на стыках/мусоре).
  const filteredSentences = sentences.map(s => s.trim()).filter(Boolean)
  if (filteredSentences.length <= 1) return [text.trim()]

  const chunks: string[] = []
  let buf: string[] = []
  for (const s of filteredSentences) {
    buf.push(s)
    if (buf.length >= 3 || buf.join(" ").length > 280) {
      chunks.push(buf.join(" "))
      buf = []
    }
  }
  if (buf.length) chunks.push(buf.join(" "))
  return chunks
}
