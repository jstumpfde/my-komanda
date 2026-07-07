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

/**
 * Компактный markdown → HTML: заголовки (# .. ####), маркированные/
 * нумерованные списки, pipe-таблицы, параграфы, инлайн-жирный/курсив/код.
 * Не поддерживает произвольный HTML во входных данных — весь текст
 * экранируется перед вставкой разметки.
 */
export function renderTipMarkdown(md: string): string {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  let i = 0
  let listBuffer: { ordered: boolean; items: string[] } | null = null

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
      const sizeCls =
        level === 1
          ? "text-2xl sm:text-3xl font-bold mt-8 mb-3 text-stone-900"
          : level === 2
            ? "text-xl sm:text-2xl font-bold mt-7 mb-3 text-stone-900"
            : level === 3
              ? "text-lg sm:text-xl font-semibold mt-6 mb-2 text-stone-900"
              : "text-base sm:text-lg font-semibold mt-5 mb-2 text-stone-900"
      out.push(`<h${level} class="${sizeCls}">${renderInline(headingMatch[2])}</h${level}>`)
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
    out.push(`<p class="my-3 text-stone-800 leading-relaxed">${buf.map(renderInline).join("<br/>")}</p>`)
  }
  flushList()

  return out.join("")
}
