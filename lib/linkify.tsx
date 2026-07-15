/**
 * lib/linkify.tsx
 *
 * Безопасная линкификация URL в тексте сообщений чата (пузыри переписки hh).
 * НЕ используем dangerouslySetInnerHTML — текст разбивается на сегменты
 * (обычный текст / URL), URL-сегменты рендерятся как <a>, остальное — как
 * текст. Это исключает XSS: содержимое сообщения кандидата никогда не
 * интерпретируется как HTML.
 *
 * Переносы строк сохраняются вызывающей стороной через whitespace-pre-wrap
 * на контейнере (текстовые сегменты содержат \n как есть).
 *
 * splitLinkifySegments — чистая функция без React (юнит-тестируется);
 * linkifyText — обёртка, возвращающая массив ReactNode для рендера.
 */

import type { ReactNode } from "react"

export interface LinkifySegment {
  type: "text" | "url"
  value: string
}

// http(s)://… до пробела/«<»; хвостовая пунктуация (.,:;!?)]}'" ) в URL не
// включается (частый случай «ссылка в конце предложения.»).
const URL_RE = /https?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"]/g

/** Разбивает текст на сегменты «обычный текст»/«URL». Чистая, без React. */
export function splitLinkifySegments(text: string): LinkifySegment[] {
  const segments: LinkifySegment[] = []
  if (!text) return segments
  const re = new RegExp(URL_RE.source, "g")
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) })
    }
    segments.push({ type: "url", value: m[0] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) })
  }
  return segments
}

/**
 * Возвращает массив ReactNode: URL-сегменты — кликабельные <a>
 * (target=_blank, безопасный rel), остальное — обычный текст. Клик по ссылке
 * не всплывает (stopPropagation), чтобы не задеть обработчики родителя.
 */
export function linkifyText(text: string): ReactNode[] {
  return splitLinkifySegments(text).map((seg, i) =>
    seg.type === "url" ? (
      <a
        key={i}
        href={seg.value}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className="underline text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-all"
      >
        {seg.value}
      </a>
    ) : (
      <span key={i}>{seg.value}</span>
    ),
  )
}
