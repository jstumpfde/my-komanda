/**
 * Серверный санитайзер HTML — только regex, без DOM (Node.js / Edge рантайм).
 *
 * Разрешённые теги: p, br, ul, ol, li, h1-h6, strong, em, b, i, u, s,
 *   a (только http/https href), span, div, blockquote, pre, code.
 * Запрещено всё остальное: script, iframe, object, embed, link, style,
 *   form, input, button, meta, base, on*-атрибуты, javascript: href/src.
 *
 * Используется в публичных страницах вакансии для безопасного рендера
 * description из БД (dangerouslySetInnerHTML).
 */

// Теги, которые разрешены; остальные будут вырезаны вместе с содержимым
// (для опасных) или только тег (для неизвестных безобидных).
const DANGEROUS_TAGS = /script|iframe|object|embed|link|style|form|input|button|meta|base|svg|math|xml/i

// Теги, которые удаляем ВМЕСТЕ с содержимым
const DANGEROUS_TAGS_WITH_CONTENT = new RegExp(
  `<(script|iframe|object|embed|style|form)[^>]*>[\\s\\S]*?<\\/\\1>`,
  "gi",
)

/**
 * Санитизирует HTML для безопасного использования в dangerouslySetInnerHTML.
 * - Удаляет <script>/<iframe>/<style>/<form>/... вместе с содержимым.
 * - Вырезает все on*-атрибуты.
 * - Заменяет javascript:/vbscript: в href/src на '#'.
 * - Удаляет неизвестные/опасные теги (оставляет текст внутри).
 * - Разрешённые ссылки только http/https.
 */
export function serverSanitizeHtml(html: string): string {
  if (!html) return ""

  // 1. Удалить опасные теги вместе с их содержимым
  let clean = html.replace(DANGEROUS_TAGS_WITH_CONTENT, "")

  // 2. Удалить оставшиеся опасные одиночные/самозакрывающиеся теги
  clean = clean.replace(/<(link|meta|base|input|button|svg|math)[^>]*\/?>/gi, "")

  // 3. Убрать on*-атрибуты (onerror, onclick, onload, ...)
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")

  // 4. Вырезать javascript:/vbscript: из href и src
  clean = clean.replace(
    /(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi,
    (match, attr, dq, sq, nq) => {
      const val = (dq ?? sq ?? nq ?? "").trim()
      if (/^javascript\s*:/i.test(val) || /^vbscript\s*:/i.test(val) || /^data\s*:/i.test(val)) {
        return `${attr}="#"`
      }
      return match
    },
  )

  // 5. Убрать неизвестные теги целиком (но оставить текст внутри)
  //    Если тег — из DANGEROUS_TAGS — удаляем тег (содержимое уже удалено выше)
  clean = clean.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
    if (DANGEROUS_TAGS.test(tag)) return ""
    return match
  })

  return clean
}
