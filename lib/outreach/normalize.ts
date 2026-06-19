// Нормализация значений для слияния и дедупа.

const LEGAL_FORMS = /\b(ООО|ОАО|ЗАО|АО|ПАО|ИП|НКО|АНО|ГУП|МУП|ТД|ТК|ООО)\b/gi

/** ИНН → только цифры; валиден если 10 (юрлицо) или 12 (ИП). Иначе "". */
export function normInn(s: unknown): string {
  const d = String(s ?? "").replace(/\D/g, "")
  return d.length === 10 || d.length === 12 ? d : ""
}

/** Вытащить ИНН из строки вида «ООО "Ромашка" / 7712345678». */
export function extractInn(s: unknown): string {
  const m = String(s ?? "").match(/\b(\d{12}|\d{10})\b/)
  return m ? m[1] : ""
}

/** Телефон РФ → +7XXXXXXXXXX (E.164). "" если непохоже на телефон. */
export function normPhone(s: unknown): string {
  let d = String(s ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "")
  d = d.replace(/\D/g, "")
  if (d.length === 11 && (d[0] === "8" || d[0] === "7")) d = "7" + d.slice(1)
  else if (d.length === 10) d = "7" + d
  if (d.length !== 11 || d[0] !== "7") return ""
  return "+" + d
}

/** Email → trim + lowercase; "" если без @. */
export function normEmail(s: unknown): string {
  const e = String(s ?? "").trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ""
}

/** Telegram/ник → @handle (lowercase) или url как есть. */
export function normHandle(s: unknown): string {
  const v = String(s ?? "").trim()
  if (!v) return ""
  if (/^https?:\/\//i.test(v)) return v
  return v.startsWith("@") ? v.toLowerCase() : "@" + v.replace(/^@+/, "").toLowerCase()
}

/** Сайт → нормализованный домен с https. */
export function normSite(s: unknown): string {
  let v = String(s ?? "").trim().toLowerCase()
  if (!v || v === "-" || v === "нет") return ""
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "")
  if (!v.includes(".")) return ""
  return "https://" + v
}

/** Имя для дедупа: верхний регистр, без кавычек/юрформ/лишних пробелов. */
export function normName(s: unknown): string {
  return String(s ?? "")
    .replace(/[«»"'`]/g, " ")
    .replace(LEGAL_FORMS, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Ключ дедупа для строк БЕЗ ИНН: norm(name)|region. */
export function dedupKey(name: unknown, region?: unknown): string {
  const n = normName(name)
  if (!n) return ""
  return n + "|" + normName(region)
}

/** Число из строки («12 200 383 854,26» → 12200383854.26). */
export function parseNum(s: unknown): number | undefined {
  if (s == null || s === "") return undefined
  if (typeof s === "number") return Number.isFinite(s) ? s : undefined
  const cleaned = String(s).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "")
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/** Разбить ячейку с несколькими значениями (телефоны/почты/страны через ; , перенос). */
export function splitMulti(s: unknown): string[] {
  return String(s ?? "")
    .split(/[;,\n\r/]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function cleanStr(s: unknown): string {
  const v = String(s ?? "").replace(/\s+/g, " ").trim()
  return v === "-" ? "" : v
}
