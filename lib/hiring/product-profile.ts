// Профиль продукта/продаж на уровне компании (ТЗ №1). Хранится в
// companies.hiring_defaults_json.productProfiles[]. Найм использует его
// самодостаточно (seed для генерации анкет/Портрета/демо — отдельные ТЗ).
// Здесь — только модель + хелперы. Без связи с вакансией и sales-модулем.

// Подсказки для поля «Тип продаж / отрасль». Это НЕ закрытый список — поле
// со свободным вводом, сюда можно вписать любую отрасль. Массив лишь наполняет
// автоподсказки (datalist) частыми вариантами из разных сфер.
export const SALES_TYPES = [
  // IT / digital
  "B2B IT", "SaaS", "CRM", "Автоматизация бизнеса", "Digital-агентство", "Веб-разработка",
  // Производство / промышленность
  "Металлоконструкции", "Промышленное оборудование", "Станки и инструмент", "Промышленное строительство",
  // Стройка / недвижимость
  "Строительные материалы", "Строительство домов", "Ремонт и отделка", "Недвижимость",
  // Товары
  "Товары народного потребления", "Оптовая торговля", "Розничная торговля", "Мебель",
  // Услуги
  "B2B-услуги", "Юридические услуги", "Бухгалтерские услуги", "Маркетинговые услуги",
  "Логистика", "Образование", "Медицина", "HoReCa",
] as const

export type DealCycle = "1d" | "2-7d" | "1-4w" | "1-3m" | "3m+"
export const DEAL_CYCLES: { v: DealCycle; label: string }[] = [
  { v: "1d",    label: "В тот же день" },
  { v: "2-7d",  label: "2–7 дней" },
  { v: "1-4w",  label: "1–4 недели" },
  { v: "1-3m",  label: "1–3 месяца" },
  { v: "3m+",   label: "3 месяца и дольше" },
]

export type SalesChannel = "cold" | "inbound" | "partners" | "referrals" | "events" | "other"
export const SALES_CHANNELS: { v: SalesChannel; label: string }[] = [
  { v: "cold",      label: "Холодные продажи" },
  { v: "inbound",   label: "Входящие лиды" },
  { v: "partners",  label: "Партнёры" },
  { v: "referrals", label: "Рекомендации" },
  { v: "events",    label: "Мероприятия" },
  { v: "other",     label: "Другое" },
]

export interface ProductCheckRange {
  min: number          // нижняя граница чека, ₽
  max: number | null   // верхняя (null = «и выше»)
  recurring: boolean   // подписка/recurring vs разовый
}

export interface ProductProfile {
  id: string
  name: string
  productDescription: string
  salesType: string
  checkRange: ProductCheckRange
  dealCycle: string
  icp: string
  channels: string[]
  objections: string[]
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `pp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function makeProductProfile(name = "Основной продукт"): ProductProfile {
  return {
    id: uuid(),
    name,
    productDescription: "",
    salesType: "",
    checkRange: { min: 0, max: null, recurring: false },
    dealCycle: "1-4w",
    icp: "",
    channels: [],
    objections: [],
  }
}

/** Терпимая нормализация прочитанного из JSON (старые компании / битые данные). */
export function normalizeProductProfiles(raw: unknown): ProductProfile[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const cr = (p.checkRange && typeof p.checkRange === "object" ? p.checkRange : {}) as Record<string, unknown>
      return {
        id: typeof p.id === "string" && p.id ? p.id : uuid(),
        name: typeof p.name === "string" ? p.name : "",
        productDescription: typeof p.productDescription === "string" ? p.productDescription : "",
        salesType: typeof p.salesType === "string" ? p.salesType : "",
        checkRange: {
          min: typeof cr.min === "number" ? cr.min : 0,
          max: typeof cr.max === "number" ? cr.max : null,
          recurring: cr.recurring === true,
        },
        dealCycle: typeof p.dealCycle === "string" ? p.dealCycle : "1-4w",
        icp: typeof p.icp === "string" ? p.icp : "",
        channels: Array.isArray(p.channels) ? p.channels.filter((c): c is string => typeof c === "string") : [],
        objections: Array.isArray(p.objections) ? p.objections.filter((o): o is string => typeof o === "string") : [],
      }
    })
}
