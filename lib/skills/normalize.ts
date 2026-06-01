// Нормализация и дедуп навыков анкеты.
//
// Проблема: «B2B маркетинг», «B2B-маркетинг», «b2b  маркетинг» хранились как
// РАЗНЫЕ теги (точное сравнение строк). Список раздувался дублями, а при
// копировании в AI-профиль (aiRequiredHardSkills) баллы размывались.
//
// Решение: для СРАВНЕНИЯ навыков приводим к канону (нижний регистр, ё→е,
// дефисы/множественные пробелы → один пробел, обрезка). Отображаемый текст
// при этом сохраняем как ввёл пользователь — канон только для дедупа.

export function normalizeSkillKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[-_/]+/g, " ")   // дефис, подчёркивание, слэш → пробел
    .replace(/\s+/g, " ")       // схлопываем пробелы
    .trim()
}

// true, если навык уже есть в списке (по канону), а не по точному совпадению.
export function hasSkill(tags: string[], candidate: string): boolean {
  const key = normalizeSkillKey(candidate)
  return tags.some(t => normalizeSkillKey(t) === key)
}

// Убрать дубли из списка навыков по канону. Сохраняет первое вхождение
// (его отображаемый вид) и исходный порядок.
export function dedupeSkills(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const trimmed = t.trim()
    if (!trimmed) continue
    const key = normalizeSkillKey(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

// Слить два списка навыков без дублей (по канону). Базовый список приоритетен
// по отображаемому виду. Используется при «Заполнить из анкеты» (requiredSkills
// → aiRequiredHardSkills): если навык уже в профиле, повторно не добавляем.
export function mergeSkills(base: string[], extra: string[]): string[] {
  return dedupeSkills([...base, ...extra])
}
