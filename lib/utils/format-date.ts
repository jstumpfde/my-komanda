/**
 * Утилита форматирования даты на русском языке
 */

/**
 * Форматирует дату в строку формата "12 мая 2026, 14:30" на русском языке.
 *
 * @param date — объект Date или ISO-строка
 * @returns строка вида "12 мая 2026, 14:30"
 */
export function formatDateRu(date: Date | string): string {
  const d: Date = typeof date === "string" ? new Date(date) : date

  const datePartRaw: string = d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  // Локаль ru-RU добавляет суффикс " г." — убираем его для формата "12 мая 2026"
  const datePart: string = datePartRaw.replace(/\s*г\.?$/, "").trim()

  const timePart: string = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${datePart}, ${timePart}`
}
