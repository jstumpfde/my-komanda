// lib/demo-vars.ts
//
// Общий рендер {{переменных}} демо-контента (блоки уроков демо-страницы) +
// производная форма города для фраз с предлогом «в».
//
// До этого модуля demo-client.tsx и course-types.ts держали каждый свою копию
// `text.replace(/\{\{(\w+)\}\}/g, ...)`. В JS `\w` = [A-Za-z0-9_] и НЕ матчит
// кириллицу, поэтому «{{город}}», «{{имя}}» и прочие русские плейсхолдеры не
// подставлялись вообще — кандидат видел сырые «{{город}}» в тексте демо.
// Здесь одна правильная регулярка на всех потребителей.
//
// Переменные города (та же пара, что city/city_in в lib/template-renderer.ts):
//   {{город}}    — именительный падеж, как ввёл HR («Город: Казань»)
//   {{в_городе}} — готовая фраза с предлогом в предложном падеже
//                  («Работа в Казани», safe fallback «в городе Верхние
//                  Мандрики» — lib/city-case-ru.ts)

import { inCityRu } from "./city-case-ru"

// Кириллица/латиница/цифры/подчёркивание — все ключи демо-переменных.
// Дефисы, двоеточия и пр. не матчим: «{x: 1}» и «{{про-дефис}}» — не наши
// плейсхолдеры, оставляем как есть. Экспорт — для подсветки плейсхолдеров в
// редакторах (notion-editor): локальные копии с `\w` кириллицу не матчили.
export const DEMO_PLACEHOLDER_RE = /\{\{([0-9A-Za-z_а-яёА-ЯЁ]+)\}\}/g

/**
 * Подставляет значения map в плейсхолдеры вида {{ключ}}.
 * Неизвестный ключ остаётся литералом (текст не портим), пустое значение
 * подставляется пустой строкой (`??`, не `||`).
 */
export function renderDemoVars(text: string, map: Record<string, string>): string {
  if (!text) return ""
  return text.replace(DEMO_PLACEHOLDER_RE, (match, key: string) => map[key] ?? match)
}

/**
 * Дополняет карту переменных производной «в_городе», выведенной из «город»
 * (если вызывающий код не задал её явно). Города нет/пустой → пустая строка,
 * чтобы «Работа {{в_городе}}» не оставляла сырой плейсхолдер в демо.
 */
export function withCityVars(map: Record<string, string>): Record<string, string> {
  if (map["в_городе"] !== undefined) return map
  return { ...map, "в_городе": inCityRu(map["город"] ?? "") }
}

// ─── Форматтеры значений отдельных переменных ────────────────────────────────

/**
 * {{зарплата}} — диапазон одной строкой: «80 000 – 150 000 ₽», «от 80 000 ₽»,
 * «до 150 000 ₽», при равных границах — одно число. 0/null = «не указано»
 * (та же семантика, что у зарплата_от/зарплата_до в demo-client).
 */
export function salaryRangeRu(min?: number | null, max?: number | null): string {
  const lo = min || 0
  const hi = max || 0
  const fmt = (n: number) => n.toLocaleString("ru-RU")
  if (lo && hi) return lo === hi ? `${fmt(lo)} ₽` : `${fmt(lo)} – ${fmt(hi)} ₽`
  if (lo) return `от ${fmt(lo)} ₽`
  if (hi) return `до ${fmt(hi)} ₽`
  return ""
}

// vacancies.format — кодовые 'office' | 'hybrid' | 'remote' (ярлыки как в
// WORK_FORMATS/funnel-builder, в нижнем регистре — значение стоит посреди фразы).
const WORK_FORMAT_RU: Record<string, string> = {
  office: "офис",
  hybrid: "гибрид",
  remote: "удалёнка",
}

/** {{формат_работы}} из vacancies.format; незнакомый свободный текст — как есть. */
export function workFormatRu(format?: string | null): string {
  if (!format) return ""
  return WORK_FORMAT_RU[format] ?? format
}

// vacancies.schedule — кодовые '5/2' | '2/2' | 'free' | 'shift' | 'rotation' |
// 'other'. «other» расшифровки не имеет — кандидату не показываем.
const SCHEDULE_RU: Record<string, string> = {
  "5/2": "5/2",
  "2/2": "2/2",
  free: "свободный",
  shift: "сменный",
  rotation: "вахта",
  other: "",
}

/** {{график}} из vacancies.schedule; незнакомый свободный текст — как есть. */
export function scheduleRu(schedule?: string | null): string {
  if (!schedule) return ""
  return SCHEDULE_RU[schedule] ?? schedule
}

/**
 * {{лет_на_рынке}} из companies.foundedYear: полных лет с года основания.
 * Компания моложе года, год в будущем или мусор (<1900) → пустая строка.
 */
export function yearsOnMarketRu(foundedYear?: number | null, now: Date = new Date()): string {
  if (!foundedYear || foundedYear < 1900) return ""
  const years = now.getFullYear() - foundedYear
  return years >= 1 ? String(years) : ""
}

// ─── Единая карта переменных демо-страницы ───────────────────────────────────

/**
 * Источник значений — поля из ответа /api/public/demo/[token]
 * (vacancies.* + companies.*). Все поля опциональны: отсутствующее значение
 * даёт пустую строку, НЕ сырой плейсхолдер.
 */
export interface DemoVarsSource {
  candidateName?: string | null
  companyName?: string | null
  vacancyTitle?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  city?: string | null
  format?: string | null          // vacancies.format → {{формат_работы}}
  schedule?: string | null        // vacancies.schedule → {{график}}
  officeAddress?: string | null   // companies.office_address → {{офис}}
  industry?: string | null        // companies.industry → {{отрасль}}
  employeeCount?: number | null   // companies.employee_count → {{сотрудников}}
  foundedYear?: number | null     // companies.founded_year → {{лет_на_рынке}}
  director?: string | null        // companies.director → {{руководитель}}
}

/**
 * Полная карта переменных публичного демо. Единственное место, где определено,
 * какие {{переменные}} знает демо-страница — пикеры (VARIABLES в course-types,
 * TEMPLATE_VARIABLES в demo-templates) и AI-промпты обязаны предлагать только
 * ключи отсюда, иначе кандидат получит сырые скобки.
 */
export function buildDemoVarsMap(src: DemoVarsSource, now: Date = new Date()): Record<string, string> {
  const firstName = src.candidateName?.split(" ")[0] || src.candidateName || ""
  return withCityVars({
    "имя": firstName,
    "имя_кандидата": firstName,
    "компания": src.companyName || "",
    "должность": src.vacancyTitle || "",
    "зарплата_от": src.salaryMin ? src.salaryMin.toLocaleString("ru-RU") : "",
    "зарплата_до": src.salaryMax ? src.salaryMax.toLocaleString("ru-RU") : "",
    "зарплата": salaryRangeRu(src.salaryMin, src.salaryMax),
    "город": src.city || "",
    "формат_работы": workFormatRu(src.format),
    "график": scheduleRu(src.schedule),
    "офис": src.officeAddress || "",
    "отрасль": src.industry || "",
    "сотрудников": src.employeeCount ? String(src.employeeCount) : "",
    "лет_на_рынке": yearsOnMarketRu(src.foundedYear, now),
    "руководитель": src.director || "",
  })
}

// ─── Пикеры переменных редакторов ────────────────────────────────────────────
// ЕДИНЫЙ список для всех пикеров/подсветки (VARIABLES в course-types и
// TEMPLATE_VARIABLES в demo-templates реэкспортируют его). Инвариант: каждый
// key разрешается в buildDemoVarsMap — рекламируем ТОЛЬКО то, что публичное
// демо реально подставит. Переменные без источника в БД (бонус, продукт,
// средний_чек, менеджер_вакансии) отсюда убраны намеренно.

export const DEMO_PICKER_VARIABLES = [
  { key: "имя", label: "Имя кандидата", example: "Иван" },
  { key: "компания", label: "Компания", example: "ТехноГрупп" },
  { key: "должность", label: "Должность", example: "Менеджер по продажам" },
  { key: "зарплата", label: "Зарплата (диапазон)", example: "80 000 – 150 000 ₽" },
  { key: "зарплата_от", label: "Зарплата от", example: "80 000" },
  { key: "зарплата_до", label: "Зарплата до", example: "150 000" },
  { key: "город", label: "Город", example: "Москва" },
  { key: "в_городе", label: "В городе (склонение)", example: "в Москве" },
  { key: "формат_работы", label: "Формат работы", example: "офис" },
  { key: "график", label: "График", example: "5/2" },
  { key: "офис", label: "Адрес офиса", example: "ул. Примерная, 1" },
  { key: "отрасль", label: "Отрасль компании", example: "IT" },
  { key: "лет_на_рынке", label: "Лет на рынке", example: "12" },
  { key: "сотрудников", label: "Сотрудников", example: "150" },
  { key: "руководитель", label: "Руководитель", example: "Анна Петрова" },
] as const

/**
 * Примеры значений для превью/подсветки в редакторах — покрывают ВСЕ ключи
 * buildDemoVarsMap (в пикере «имя_кандидата» не показываем — это синоним
 * «имя», но в существующем контенте шаблонов он встречается).
 */
export const DEMO_VARIABLE_EXAMPLES: Record<string, { label: string; example: string }> = {
  ...Object.fromEntries(DEMO_PICKER_VARIABLES.map((v) => [v.key, { label: v.label, example: v.example }])),
  "имя_кандидата": { label: "Имя кандидата", example: "Иван" },
}

/** Карта «ключ → пример» для рендера превью с примерами (редакторы, витрина). */
export function demoVarExamplesMap(): Record<string, string> {
  return withCityVars(
    Object.fromEntries(Object.entries(DEMO_VARIABLE_EXAMPLES).map(([k, v]) => [k, v.example])),
  )
}
