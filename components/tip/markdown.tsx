// Мини-рендер markdown для разбора «Типология» (resultMd от AI).
// В репозитории нет react-markdown/remark/marked — по образцу
// app/(public)/demo/[token]/demo-client.tsx (renderContentWithTables)
// собственный компактный конвертер: заголовки, жирный/курсив, списки,
// параграфы и pipe-таблицы. Без произвольного HTML от модели — весь
// пользовательский текст экранируется, поддерживается только сама разметка,
// которую генерирует наш промпт.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Инлайн-разметка внутри строки: **жирный**, *курсив*/_курсив_, `код`.
function renderInline(s: string): string {
  let html = escapeHtml(s)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
  html = html.replace(/_(.+?)_/g, "<em>$1</em>")
  html = html.replace(/`(.+?)`/g, "<code class=\"px-1 py-0.5 rounded bg-stone-100 text-[0.9em]\">$1</code>")
  return html
}

// Соответствие текст-маркеру -> визуальный «плюс/минус»-блок. Абзац,
// начинающийся с одного из этих префиксов, рендерится цветным скруглённым
// блоком вместо обычного параграфа (журнальная вёрстка, задача "приукрасить
// отчёт"). Маркер вырезается из текста блока.
const PLUS_MINUS_PATTERNS: { re: RegExp; kind: "plus" | "minus" }[] = [
  { re: /^В\s+плюсе\s*[:—-]?\s*/i, kind: "plus" },
  { re: /^Плюс\s*:\s*/i, kind: "plus" },
  { re: /^В\s+минусе\s*[:—-]?\s*/i, kind: "minus" },
  { re: /^Минус\s*:\s*/i, kind: "minus" },
]

function matchPlusMinus(text: string): { kind: "plus" | "minus"; rest: string } | null {
  for (const { re, kind } of PLUS_MINUS_PATTERNS) {
    if (re.test(text)) {
      return { kind, rest: text.replace(re, "") }
    }
  }
  return null
}

function renderPlusMinusBlock(kind: "plus" | "minus", paragraphText: string): string {
  const isPlus = kind === "plus"
  const label = isPlus ? "В плюсе" : "В минусе"
  const wrapperCls = isPlus
    ? "my-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3"
    : "my-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3"
  const labelCls = isPlus ? "mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700" : "mb-1 text-xs font-bold uppercase tracking-wide text-amber-700"
  const textCls = "text-stone-800 leading-relaxed"
  return `<div class="${wrapperCls}"><p class="${labelCls}">${label}</p><p class="${textCls}">${renderInline(paragraphText)}</p></div>`
}

/** Заголовок в стиле "## Текст" -> { id (slug), text }. Для оглавления/якорей. */
function slugifyHeading(text: string, seen: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    || "section"
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

function isPipeTableRow(s: string): boolean {
  const t = s.trim()
  if (!(t.startsWith("|") && t.endsWith("|"))) return false
  return (t.match(/\|/g) || []).length >= 2
}

function isPipeTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()))
}

function parsePipeRow(s: string): string[] {
  const t = s.trim().replace(/^\||\|$/g, "")
  return t.split("|").map((c) => c.trim())
}

function renderPipeTable(rows: string[][]): string {
  let headerCells: string[] | null = null
  let body = rows
  if (rows.length >= 2 && isPipeTableSeparator(rows[1])) {
    headerCells = rows[0]
    body = rows.slice(2).filter((r) => !isPipeTableSeparator(r))
  } else if (rows.length >= 1) {
    headerCells = rows[0]
    body = rows.slice(1).filter((r) => !isPipeTableSeparator(r))
  }

  const thead = headerCells
    ? `<thead><tr>${headerCells
        .map(
          (c) =>
            `<th class="px-3 py-2 text-left text-[13px] font-semibold bg-stone-50 text-stone-700 border-b border-stone-200">${renderInline(c)}</th>`,
        )
        .join("")}</tr></thead>`
    : ""
  const tbody = `<tbody>${body
    .map(
      (r) =>
        `<tr class="odd:bg-white even:bg-stone-50/50">${r
          .map(
            (c) =>
              `<td class="px-3 py-2 align-top text-sm text-stone-800 border-b border-stone-100">${renderInline(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("")}</tbody>`

  return `<div class="my-4 overflow-x-auto rounded-lg border border-stone-200"><table class="w-full border-collapse text-left">${thead}${tbody}</table></div>`
}

export interface TipTocEntry {
  id: string
  text: string
}

export interface TipMarkdownResult {
  html: string
  toc: TipTocEntry[]
}

/**
 * Компактный markdown → HTML: заголовки (# .. ####), маркированные/
 * нумерованные списки, pipe-таблицы, параграфы, инлайн-жирный/курсив/код.
 * Не поддерживает произвольный HTML во входных данных — весь текст
 * экранируется перед вставкой разметки.
 *
 * Журнальная вёрстка (задача "приукрасить отчёт"):
 *  - заголовки h2 получают id (слаг) для оглавления/якорей — см.
 *    renderTipMarkdownWithToc;
 *  - параграфы, начинающиеся с «В плюсе»/«Плюс:» или «В минусе»/«Минус:»,
 *    рендерятся цветными скруглёнными блоками (зелёный/янтарный фон) вместо
 *    обычного текста;
 *  - при передаче quotes — 2-3 цитаты-выноски вставляются между секциями
 *    markdown (равномерно, см. renderTipMarkdownWithToc).
 */
export function renderTipMarkdown(md: string, quotes: string[] = []): string {
  return renderTipMarkdownWithToc(md, quotes).html
}

/** Декоративная выноска-цитата (крупный шрифт, кавычки). */
function renderPullQuote(quote: string): string {
  return `<blockquote class="relative my-8 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-6 py-5 sm:px-8 sm:py-6"><span class="pointer-events-none absolute left-3 top-1 font-serif text-5xl leading-none text-amber-300 sm:text-6xl">&ldquo;</span><p class="relative z-10 pl-4 text-lg font-semibold italic leading-snug text-stone-800 sm:pl-6 sm:text-xl">${renderInline(quote)}</p></blockquote>`
}

/**
 * Полная версия рендера: возвращает HTML и оглавление (h2 -> id) плюс
 * равномерно распределяет цитаты-выноски (quotes) между h2-секциями.
 */
export function renderTipMarkdownWithToc(md: string, quotes: string[] = []): TipMarkdownResult {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  const toc: TipTocEntry[] = []
  const slugSeen = new Map<string, number>()
  let i = 0
  let listBuffer: { ordered: boolean; items: string[] } | null = null

  // Считаем сколько всего h2 встретится, чтобы равномерно раскидать цитаты
  // по границам секций (перед h2 с индексом, кратным шагу).
  const h2Total = lines.filter((l) => /^##\s+/.test(l.trim())).length
  const cleanQuotes = quotes.map((q) => q.trim()).filter(Boolean).slice(0, 3)
  let h2Seen = 0
  let quoteIdx = 0
  const insertQuoteSlots = new Set<number>()
  if (cleanQuotes.length > 0 && h2Total > 1) {
    const step = Math.max(1, Math.floor(h2Total / (cleanQuotes.length + 1)))
    for (let q = 1; q <= cleanQuotes.length; q++) {
      const slot = q * step
      if (slot < h2Total) insertQuoteSlots.add(slot)
    }
  }

  const flushList = () => {
    if (!listBuffer) return
    const tag = listBuffer.ordered ? "ol" : "ul"
    const cls = listBuffer.ordered
      ? "list-decimal pl-5 my-3 space-y-1.5 marker:text-stone-400"
      : "list-disc pl-5 my-3 space-y-1.5 marker:text-stone-400"
    out.push(
      `<${tag} class="${cls}">${listBuffer.items
        .map((it) => `<li class="text-stone-800 leading-relaxed">${renderInline(it)}</li>`)
        .join("")}</${tag}>`,
    )
    listBuffer = null
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === "") {
      flushList()
      i++
      continue
    }

    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      const text = headingMatch[2]

      if (level === 2) {
        h2Seen++
        if (insertQuoteSlots.has(h2Seen - 1) && quoteIdx < cleanQuotes.length) {
          out.push(renderPullQuote(cleanQuotes[quoteIdx]))
          quoteIdx++
        }
      }

      const sizeCls =
        level === 1
          ? "text-2xl sm:text-3xl font-bold mt-8 mb-3 text-stone-900"
          : level === 2
            ? "text-xl sm:text-2xl font-bold mt-7 mb-3 text-stone-900 scroll-mt-20"
            : level === 3
              ? "text-lg sm:text-xl font-semibold mt-6 mb-2 text-stone-900"
              : "text-base sm:text-lg font-semibold mt-5 mb-2 text-stone-900"

      if (level === 2) {
        const id = slugifyHeading(text, slugSeen)
        toc.push({ id, text })
        out.push(`<h${level} id="${id}" class="${sizeCls}">${renderInline(text)}</h${level}>`)
      } else {
        out.push(`<h${level} class="${sizeCls}">${renderInline(text)}</h${level}>`)
      }
      i++
      continue
    }

    if (isPipeTableRow(line) && i + 1 < lines.length && isPipeTableRow(lines[i + 1])) {
      flushList()
      const buf: string[] = []
      while (i < lines.length && isPipeTableRow(lines[i])) {
        buf.push(lines[i])
        i++
      }
      out.push(renderPipeTable(buf.map(parsePipeRow)))
      continue
    }

    const bulletMatch = /^[-*•]\s+(.*)$/.exec(trimmed)
    if (bulletMatch) {
      if (!listBuffer || listBuffer.ordered) {
        flushList()
        listBuffer = { ordered: false, items: [] }
      }
      listBuffer.items.push(bulletMatch[1])
      i++
      continue
    }

    const orderedMatch = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (orderedMatch) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList()
        listBuffer = { ordered: true, items: [] }
      }
      listBuffer.items.push(orderedMatch[1])
      i++
      continue
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      flushList()
      out.push('<hr class="my-6 border-stone-200" />')
      i++
      continue
    }

    flushList()
    // Обычный параграф — собираем подряд идущие непустые строки без спецразметки.
    const buf: string[] = [trimmed]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !isPipeTableRow(lines[i])
    ) {
      buf.push(lines[i].trim())
      i++
    }
    const paragraphText = buf.join(" ")
    const plusMinus = matchPlusMinus(paragraphText)
    if (plusMinus) {
      out.push(renderPlusMinusBlock(plusMinus.kind, plusMinus.rest))
    } else {
      out.push(`<p class="my-3 text-stone-800 leading-relaxed">${buf.map(renderInline).join("<br/>")}</p>`)
    }
  }
  flushList()

  return { html: out.join(""), toc }
}
