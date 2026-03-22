/**
 * Strips inline styles, class names, and non-semantic attributes
 * from HTML produced by Word / Notion / browser copy-paste.
 * Safe to call only in browser context (uses document.createElement).
 */
export function cleanHtml(html: string): string {
  const div = document.createElement("div")
  div.innerHTML = html
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
