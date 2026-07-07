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

// P0-22: editable дефолт, который и применяется как DEFAULT для колонки
// vacancies.stop_words_json. Совпадает с тем, что предложил Юрий в ТЗ.
// «нет» и «спасибо» УБРАНЫ из дефолта (Юрий 07.07): матчинг этого списка —
// ПОДСТРОЧНЫЙ (см. matchStopWordList ниже), и «работаю в интерНЕТе» /
// «СПАСИБО, очень интересно!» давали ложный авто-отказ вежливым кандидатам.
// Явную форму «нет спасибо» держим отдельной фразой — matchStopWordList
// нормализует пунктуацию, поэтому она ловит и «Нет, спасибо» с запятой.
// С прод-данных оба одиночных слова вычищены 07.07 (33 вакансии).
export const DEFAULT_STOP_WORDS_V2 = [
  "неактуально", "не подходит", "неинтересно",
  "не интересно", "не интересует", "не актуально", "не актуальна",
  "отменяю", "отказ", "отказываюсь", "не рассматриваю", "нет спасибо",
]

// F6: word-boundary матч по ПЕРЕДАННОМУ списку (baseline настраивается на
// платформе). matchStopWord ниже — обёртка на код-сиде STOP_WORDS (sync-фолбэк).
export function matchStopWordWith(text: string, words: readonly string[]): boolean {
  // Нормализация: вся пунктуация → пробел, схлопываем пробелы.
  const norm = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!norm) return false
  for (const w of words) {
    // Внутренние пробелы фразы становятся \s+ для устойчивости к множественным пробелам.
    const escaped = w.toLowerCase().replace(/\s+/g, "\\s+")
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u")
    if (re.test(norm)) return true
  }
  return false
}

export function matchStopWord(text: string): boolean {
  return matchStopWordWith(text, STOP_WORDS)
}

// P0-22: editable список из vacancies.stop_words_json. Юрий явно попросил
// case-insensitive substring match (а не word-boundary как в matchStopWord
// выше). Внимание: substring чувствителен к false positives — «интернет»
// содержит «нет», «внеплановый» содержит «не». Список редактируется HR'ом,
// и от него ожидается, что он будет вписывать только осмысленные стоп-фразы.
// Возвращает первое попавшееся слово (для логирования) или null.
export function matchStopWordList(text: string, list: string[]): string | null {
  if (!list || list.length === 0) return null
  // Нормализация пунктуации (как в matchStopWordWith): «Нет, спасибо» → «нет спасибо».
  // Иначе подстрочный матч фразы с пробелом («нет спасибо») не ловил запятую,
  // а «Нет, спасибо» — самая частая короткая форма отказа в переписке (гвард 07.07).
  const norm = (t: string) =>
    t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()
  const normText = norm(text)
  for (const raw of list) {
    const w = norm(raw)
    if (!w) continue
    if (normText.includes(w)) return raw
  }
  return null
}
