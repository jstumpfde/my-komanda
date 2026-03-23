// Position categories and their adaptive rules

export const POSITION_CATEGORIES = {
  sales_hunter: {
    label: "Хантер / Менеджер по привлечению",
    keywords: ["хантер", "менеджер по продажам", "менеджер по привлечению", "bdm", "business development"],
    defaultFunctions: ["prospecting", "meetings", "closing", "crm_reporting"],
  },
  sales_farmer: {
    label: "Аккаунт-менеджер / Фермер",
    keywords: ["фермер", "аккаунт-менеджер", "account manager", "менеджер по сопровождению", "key account", "клиентский менеджер"],
    defaultFunctions: ["account_management", "meetings", "crm_reporting", "debt_control"],
  },
  sales_closer: {
    label: "Клозер / Менеджер по закрытию",
    keywords: ["клозер", "менеджер по закрытию", "старший менеджер по продажам", "закрытие сделок"],
    defaultFunctions: ["closing", "meetings"],
  },
  sales_universal: {
    label: "Менеджер по продажам (универсал)",
    keywords: ["менеджер по продажам", "продажник", "специалист по продажам", "торговый представитель"],
    defaultFunctions: ["prospecting", "inbound_processing", "meetings", "closing", "crm_reporting"],
  },
  rop: {
    label: "Руководитель отдела продаж (РОП)",
    keywords: ["роп", "руководитель отдела продаж", "head of sales", "коммерческий директор", "начальник отдела продаж"],
    defaultFunctions: [],
  },
  telemarketer: {
    label: "Телемаркетолог / SDR",
    keywords: ["телемаркетолог", "лидогенератор", "sdr", "прозвонщик", "оператор колл-центра", "колл-центр"],
    defaultFunctions: ["prospecting"],
  },
  assistant: {
    label: "Ассистент / Координатор продаж",
    keywords: ["ассистент", "координатор продаж", "sales support", "помощник менеджера"],
    defaultFunctions: ["crm_reporting", "inbound_processing"],
  },
  marketing: {
    label: "Маркетолог / SMM",
    keywords: ["маркетолог", "smm", "таргетолог", "директолог", "контент-менеджер", "pr-менеджер"],
    defaultFunctions: [],
  },
  hr: {
    label: "HR / Рекрутер",
    keywords: ["hr", "рекрутер", "менеджер по персоналу", "специалист по подбору", "хрд"],
    defaultFunctions: [],
  },
  it: {
    label: "IT / Разработчик",
    keywords: ["разработчик", "программист", "developer", "аналитик", "тестировщик", "1с", "devops", "qa"],
    defaultFunctions: [],
  },
  finance: {
    label: "Финансист / Бухгалтер",
    keywords: ["бухгалтер", "финансист", "экономист", "cfo", "главный бухгалтер", "финансовый директор"],
    defaultFunctions: [],
  },
  other: {
    label: "Другая должность",
    keywords: [],
    defaultFunctions: [],
  },
} as const

export type PositionCategory = keyof typeof POSITION_CATEGORIES

export interface ClassificationResult {
  category: PositionCategory
  confidence: "high" | "medium" | "low"
  label: string
  defaultFunctions: readonly string[]
}

// Fuzzy keyword match: check if title contains any keyword
export function classifyPosition(title: string): ClassificationResult {
  if (!title.trim()) return { category: "other", confidence: "low", label: "Другая должность", defaultFunctions: [] }

  const lower = title.toLowerCase().trim()

  for (const [catKey, cat] of Object.entries(POSITION_CATEGORIES)) {
    if (catKey === "other") continue
    const c = cat as unknown as { label: string; keywords: readonly string[]; defaultFunctions: readonly string[] }
    const exactMatch = c.keywords.some((kw) => lower === kw || lower.includes(kw))
    if (exactMatch) {
      const confidence = lower === c.keywords[0] ? "high" : "medium"
      return { category: catKey as PositionCategory, confidence, label: c.label, defaultFunctions: c.defaultFunctions }
    }
  }

  return { category: "other", confidence: "low", label: "Другая должность", defaultFunctions: [] }
}
