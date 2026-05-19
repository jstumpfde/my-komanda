// Стоп-слова и word-boundaries матчер.
//
// Раньше использовался .includes(w), что давало false positives на
// substring'ах: «интернет» содержит «нет», «внеплановый» содержит «не»,
// и т.п. После инцидента 04.05.2026 (19 кандидатов ошибочно в rejected)
// — только полные слова или точные многословные фразы, ограниченные
// whitespace.
//
// Используется в двух местах:
//   - lib/followup/should-stop.ts — lazy-stop в cron-дожиме (проверка
//     anketa_answers перед отправкой касания);
//   - lib/hh/scan-incoming.ts — реактивная отмена при входящем hh-сообщении.

export const STOP_WORDS = [
  "нет", "неинтересно", "не интересно", "не нужно", "не хочу", "не подходит",
  "отказ", "остановит", "прекрат", "спасибо нет", "уже работаю", "нашел работу",
  "нашла работу", "не актуально",
]

export function matchStopWord(text: string): boolean {
  // Нормализация: вся пунктуация → пробел, схлопываем пробелы.
  const norm = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!norm) return false
  for (const w of STOP_WORDS) {
    // Внутренние пробелы фразы становятся \s+ для устойчивости к множественным пробелам.
    const escaped = w.toLowerCase().replace(/\s+/g, "\\s+")
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u")
    if (re.test(norm)) return true
  }
  return false
}
