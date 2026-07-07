// ─── Статистика рынка hh.ru для шага «Анализ рынка» мастера вакансии ───────
//
// Юрий 07.07: раньше step-market.tsx показывал ПОЛНОСТЬЮ выдуманные данные —
// захардкоженные "медианные зарплаты" по категориям и "топ-3 похожих вакансий"
// с реальными брендами (Сбер, Яндекс, Тинькофф…) и выдуманными зарплатами.
// Репутационный риск. Здесь — расчёт реальной медианы/вилки по выборке
// вакансий hh (только RUR, gross как есть — hh не отдаёт net), без каких-либо
// захардкоженных чисел.
//
// hh.ru НЕ отдаёт количество откликов по чужим вакансиям — цифры откликов
// сюда сознательно не входят.

export interface HhSalaryLike {
  from?: number | null
  to?: number | null
  currency?: string | null
  gross?: boolean | null
}

export interface MarketSalaryStats {
  // Кол-во вакансий из выборки, у которых удалось взять RUR-зарплату
  // (использованы для расчёта медианы/вилки). Может быть 0.
  sampleSize: number
  salaryMedian: number | null
  salaryFrom: number | null
  salaryTo: number | null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return sorted[mid]
}

// Из объекта salary hh получаем одно репрезентативное число для медианы:
// если есть и from, и to — берём середину вилки; если только одно — берём его.
function representativeValue(s: HhSalaryLike): number | null {
  const from = typeof s.from === "number" && s.from > 0 ? s.from : null
  const to = typeof s.to === "number" && s.to > 0 ? s.to : null
  if (from != null && to != null) return Math.round((from + to) / 2)
  if (from != null) return from
  if (to != null) return to
  return null
}

// Считает медиану и вилку (мин/макс "from"/"to" по выборке) ТОЛЬКО по вакансиям
// с валютой RUR (USD/EUR/... и т.п. отбрасываем — иначе цифры несопоставимы
// без курса, а гадать курс не будем). gross->net конверсию НЕ делаем: hh сам
// показывает "gross" пометкой, а не приводит к net — показываем как есть,
// байт-в-байт с тем, что видно на hh.
export function computeMarketSalaryStats(salaries: Array<HhSalaryLike | null | undefined>): MarketSalaryStats {
  const rurSalaries = salaries.filter(
    (s): s is HhSalaryLike => !!s && (s.currency == null || s.currency === "RUR"),
  )

  const representatives: number[] = []
  const froms: number[] = []
  const tos: number[] = []

  for (const s of rurSalaries) {
    const rep = representativeValue(s)
    if (rep != null) representatives.push(rep)
    if (typeof s.from === "number" && s.from > 0) froms.push(s.from)
    if (typeof s.to === "number" && s.to > 0) tos.push(s.to)
  }

  return {
    sampleSize: representatives.length,
    salaryMedian: median(representatives),
    salaryFrom: froms.length ? Math.min(...froms) : null,
    salaryTo: tos.length ? Math.max(...tos) : null,
  }
}

// Форматирует salary-объект hh в человеческую строку "как на hh" —
// используется для карточек похожих вакансий.
export function formatHhSalary(s: HhSalaryLike | null | undefined): string {
  if (!s) return "Не указана"
  const from = typeof s.from === "number" && s.from > 0 ? s.from : null
  const to = typeof s.to === "number" && s.to > 0 ? s.to : null
  const currency = s.currency === "RUR" || !s.currency ? "₽" : s.currency
  const grossSuffix = s.gross ? " (до вычета налога)" : ""
  const fmt = (n: number) => n.toLocaleString("ru-RU")

  if (from != null && to != null) return `${fmt(from)} – ${fmt(to)} ${currency}${grossSuffix}`
  if (from != null) return `от ${fmt(from)} ${currency}${grossSuffix}`
  if (to != null) return `до ${fmt(to)} ${currency}${grossSuffix}`
  return "Не указана"
}
