// Словарь языков для стоп-фактора «Родной язык» (ПОЛНАЯ КОПИЯ подхода
// citizenship-countries.ts, см. native-language-factor-field.tsx и
// stop-factors-matcher.ts::matchNativeLanguage).
//
// Коды — как в hh resume.language[].id (rus/eng/ger/...), НЕ ISO-2 страны.
// Континентов/групп у языков нет — список плоский, произвольный ввод
// разрешён (неизвестный код сохраняется как есть в нижнем регистре).

/** Топ-языки — кнопками в попапе добавления. */
export const QUICK_NATIVE_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "rus", name: "Русский" },
  { code: "bel", name: "Белорусский" },
  { code: "ukr", name: "Украинский" },
  { code: "eng", name: "Английский" },
  { code: "ger", name: "Немецкий" },
  { code: "kaz", name: "Казахский" },
  { code: "uzb", name: "Узбекский" },
]

/**
 * Словарь код (как у hh) → русское название. Покрывает основные языки,
 * встречающиеся в резюме СНГ-региона + крупные мировые языки. Неизвестный
 * ввод сохраняется как есть в нижнем регистре, см. resolveNativeLanguageInput.
 */
export const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  rus: "Русский",
  bel: "Белорусский",
  ukr: "Украинский",
  eng: "Английский",
  ger: "Немецкий",
  fra: "Французский",
  spa: "Испанский",
  ita: "Итальянский",
  por: "Португальский",
  pol: "Польский",
  kaz: "Казахский",
  uzb: "Узбекский",
  kir: "Киргизский",
  taj: "Таджикский",
  tur: "Турецкий",
  tuk: "Туркменский",
  arm: "Армянский",
  aze: "Азербайджанский",
  geo: "Грузинский",
  mol: "Молдавский",
  chi: "Китайский",
  jpn: "Японский",
  kor: "Корейский",
  ara: "Арабский",
  heb: "Иврит",
  hin: "Хинди",
  vie: "Вьетнамский",
  tha: "Тайский",
  ind: "Индонезийский",
}

/** Человекочитаемое имя для чипа/сводки: по словарю, неизвестный код — как есть. */
export function nativeLanguageCodeLabel(code: string): string {
  return NATIVE_LANGUAGE_NAMES[code] ?? code
}

/**
 * Резолвит произвольный пользовательский ввод (код как у hh ИЛИ русское
 * название языка из словаря) в код. Если не находится в словаре —
 * возвращает ввод как есть в нижнем регистре (сохраняем поведение "не
 * ломаем то, что не знаем").
 */
export function resolveNativeLanguageInput(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const lower = trimmed.toLowerCase()
  if (NATIVE_LANGUAGE_NAMES[lower]) return lower
  const byName = Object.entries(NATIVE_LANGUAGE_NAMES)
    .find(([, name]) => name.toLowerCase() === trimmed.toLowerCase())
  if (byName) return byName[0]
  return lower
}
