/**
 * Strips inline styles, class names, and non-semantic attributes
 * from HTML produced by Word / Notion / browser copy-paste.
 * Replaces <blockquote> with <p> to remove browser indent/border-left.
 * Safe to call only in browser context (uses document.createElement).
 */
export function cleanHtml(html: string): string {
  const div = document.createElement("div")
  div.innerHTML = html

  // Unwrap blockquote → p (source of the grey left-border indent)
  div.querySelectorAll("blockquote").forEach(bq => {
    const p = document.createElement("p")
    p.innerHTML = bq.innerHTML
    bq.replaceWith(p)
  })

  const walk = (el: Element) => {
    el.removeAttribute("style")
    el.removeAttribute("class")
    Array.from(el.attributes).forEach(attr => {
      if (attr.name !== "href" && attr.name !== "src" && attr.name !== "alt" && attr.name !== "target") {
        el.removeAttribute(attr.name)
      }
    })
    Array.from(el.children).forEach(walk)
  }
  Array.from(div.children).forEach(walk)
  return div.innerHTML
}
