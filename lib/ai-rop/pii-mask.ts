// Минимизация ПДн в исходящих запросах к зарубежным AI-провайдерам (152-ФЗ,
// трансграничная передача персональных данных) — НЕ задача полной анонимизации.
// Порт call-agent lib/pii-mask.ts, 1:1 (чистая логика, БД не трогает).

import { maskNamesAndAddresses } from "./ner-mask";

/**
 * Телефоны РФ: +7/8/7 + 10 цифр, с разделителями (пробел/дефис/точка/скобки),
 * а также сплошные 10-11-значные последовательности, похожие на телефон.
 */
const PHONE_RE = /(?<!\d)(?:\+?7|8)?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}(?!\d)/g;

/** Стандартный (нестрогий) email-паттерн. */
const EMAIL_RE = /\S+@\S+\.\S+/g;

/**
 * Заменяет телефоны и email в тексте на плейсхолдеры перед отправкой в
 * зарубежный AI-сервис.
 *
 * extra — необязательный список уже известных точных значений (например
 * телефон клиента из CRM в разных нормализациях) — заменяются ДО применения
 * regex-паттернов, точным совпадением без учёта регистра, на [ЗНАЧЕНИЕ].
 */
export function maskPII(text: string, extra?: string[]): string {
  if (!text) return text;
  let result = text;

  if (extra && extra.length > 0) {
    // Сначала длинные значения — чтобы короткая подстрока не «съела» часть длинной
    // (например если extra содержит и "+79991234567" и "9991234567").
    const values = [...new Set(extra.filter((v) => v && v.trim().length > 0))].sort((a, b) => b.length - a.length);
    for (const value of values) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "gi"), "[ЗНАЧЕНИЕ]");
    }
  }

  // Email — до телефонов: иначе цифры в локальной части email (ivan1990@...)
  // теоретически могли бы зацепить фрагмент под телефонный паттерн.
  result = result.replace(EMAIL_RE, "[EMAIL]");
  result = result.replace(PHONE_RE, "[ТЕЛЕФОН]");

  return result;
}

/**
 * Приводит телефон к чистым цифрам с единым форматом: ведущая 8 → 7 (11 цифр),
 * 10-значный номер без кода страны → добавляем ведущую 7. Для СРАВНЕНИЯ
 * телефонов между собой (например транскрипт vs значение из CRM-карточки),
 * не для отправки наружу.
 */
export function normalizePhone(s: string): string {
  let digits = (s || "").replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "8" || digits[0] === "7")) {
    digits = "7" + digits.slice(1);
  } else if (digits.length === 10) {
    digits = "7" + digits;
  }
  return digits;
}

/** NER (имена/адреса) + regex (телефон/email) — полный слой маскирования перед AI. */
export async function maskPIIFull(text: string, extra?: string[]): Promise<string> {
  const nerMasked = await maskNamesAndAddresses(text);
  return maskPII(nerMasked, extra);
}
