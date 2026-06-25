// Выжимка описания компании для блока «О компании» в вакансии.
// Описание компании в настройках может быть длинным «питчем» (с условиями,
// «Что мы даём», требованиями, буллет-списками). В вакансию тянем только
// вводную часть про компанию/продукт, отрезая секции условий/требований.
// Детерминированно, без AI (решение Юрия). Настройки компании не меняются —
// выжимка только при подтягивании в вакансию.

// Маркеры начала секций, которым НЕ место в блоке «О компании» вакансии.
const STOP_SECTION = /^(что мы даём|что мы предлагаем|мы предлагаем|что вы получ|что ты получ|ищем человек|ищем того|кого ищем|кого мы ищем|требовани|обязанност|условия|задачи|чем предстоит|что нужно|от вас|ваши задачи|мы ждём)/i

const MAX_CHARS = 600

export function shortenCompanyDescription(text: string | null | undefined): string {
  if (!text) return ""
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const kept: string[] = []

  for (const p of paras) {
    if (STOP_SECTION.test(p)) break
    // Параграф из ≥2 буллетов — это перечисление условий/требований, не «о компании».
    const bullets = p.split("\n").filter((l) => /^\s*[—\-•*·]/.test(l)).length
    if (bullets >= 2) break
    kept.push(p)
    if (kept.join("\n\n").length >= MAX_CHARS) break
  }

  let out = (kept.length ? kept : paras.slice(0, 1)).join("\n\n").trim()
  if (out.length > MAX_CHARS + 120) out = out.slice(0, MAX_CHARS).replace(/\s+\S*$/, "") + "…"
  return out
}
