/** Общие форматтеры модуля AI-РОП (порт мелких helpers из ca-src, без "use client" — можно звать и в server, и в client компонентах). */

export function formatDuration(sec: number): string {
  if (!sec) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

export function formatTotalMinutes(sec: number): string {
  if (!sec) return "—"
  const totalMin = Math.round(sec / 60)
  if (totalMin === 0) return "<1 мин"
  if (totalMin < 60) return `${totalMin} мин`
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  return mins ? `${hours} ч ${mins} мин` : `${hours} ч`
}

/** Postgres timestamptz приходит как Date | string — приводим к Date безопасно. */
export function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export function formatDateTime(v: Date | string | null | undefined): string {
  const d = toDate(v)
  if (!d) return "—"
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
}

export function formatDateShort(v: Date | string | null | undefined): string {
  const d = toDate(v)
  if (!d) return "—"
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function todayIso(): string {
  return isoDate(new Date())
}

export function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
