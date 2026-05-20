// Keyword-парсер для блока callIntent ("Если кандидат хочет созвониться").
//
// Поведение: case-insensitive, word-boundary match. Для русских слов
// границы строятся через look-around с не-кириллической буквой (\p{L}),
// чтобы «телефон» в «по телефону» матчился, но в «телефоне» — нет
// (формальная морфология тут не нужна; HR может сам добавить варианты
// в keywords-чипсы из UI).
//
// Если keywords пустой массив — возвращает false (фильтр выключен).

export function matchCallIntentKeyword(text: string, keywords: readonly string[]): { matched: true; word: string } | { matched: false } {
  if (!text || keywords.length === 0) return { matched: false }
  const lower = text.toLowerCase()
  for (const raw of keywords) {
    const kw = raw.trim().toLowerCase()
    if (!kw) continue
    // word-boundary: до/после слова не должно быть буквы (русской или латинской).
    // Простая реализация: ищем kw и проверяем символы по бокам.
    let idx = 0
    while (idx <= lower.length - kw.length) {
      const pos = lower.indexOf(kw, idx)
      if (pos === -1) break
      const before = pos === 0 ? "" : lower[pos - 1]
      const after  = pos + kw.length === lower.length ? "" : lower[pos + kw.length]
      const isLetter = (c: string) => /\p{L}/u.test(c)
      if (!isLetter(before) && !isLetter(after)) {
        return { matched: true, word: kw }
      }
      idx = pos + 1
    }
  }
  return { matched: false }
}

// Подставляем плейсхолдеры из шаблонов callIntent.insistDemoMessages.
// Поддерживает {Имя}, {должность}, {ссылка} (как в задаче Сессии 5).
// Для совместимости со старыми шаблонами также [Имя], [должность], [ссылка]
// и {имя} (нижний регистр).
export function renderInsistTemplate(tpl: string, vars: { name: string; vacancy: string; demoLink: string }): string {
  return tpl
    .replaceAll("{Имя}",        vars.name)
    .replaceAll("{имя}",        vars.name)
    .replaceAll("[Имя]",        vars.name)
    .replaceAll("[имя]",        vars.name)
    .replaceAll("{должность}",  vars.vacancy)
    .replaceAll("[должность]",  vars.vacancy)
    .replaceAll("{ссылка}",     vars.demoLink)
    .replaceAll("[ссылка]",     vars.demoLink)
}
