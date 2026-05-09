// Нормализация контактов кандидата для дедупликации.
// ТЗ задача 3: один человек создаёт 2 карточки (через hh и через демо-ссылку),
// и они должны схлопнуться по нормализованному телефону / email.

/**
 * Нормализация российского номера в формат `7XXXXXXXXXX`:
 *   "+7 (999) 123-45-67"  → "79991234567"
 *   "8 (999) 123-45-67"   → "79991234567"
 *   "79991234567"         → "79991234567"
 *   "9991234567"          → "79991234567"
 * Иностранные / нераспознаваемые номера возвращаются как «только цифры»
 * (можно сравнивать на полное совпадение, но без «магии» 7/8).
 * Пустой / null → "".
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 11) {
    if (digits.startsWith("8")) return "7" + digits.slice(1)
    return digits
  }
  if (digits.length === 10) return "7" + digits
  return digits
}

/** Email: trim + lowercase. Пустой / null → "". */
export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.trim().toLowerCase()
}

/**
 * SQL-выражения для match'а нормализованного телефона/email прямо в WHERE.
 * Используются в дедупликации (apply route) и админ-репорте.
 *
 * ⚠ Совпадает с алгоритмом normalizePhone() выше для российских номеров,
 * но в SQL не повторяет «10 цифр → 7XXX...» — потому что в БД телефон
 * обычно уже хранится с кодом страны. Если в БД есть кривые «без 7/8»,
 * их подберёт админ-репорт после ручной проверки.
 */
export const PHONE_DIGITS_SQL = `regexp_replace(coalesce(phone, ''), '\\D', '', 'g')`
export const EMAIL_NORM_SQL  = `lower(trim(coalesce(email, '')))`
