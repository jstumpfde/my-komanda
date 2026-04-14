// ── Справочник медианных зарплат по должностям (Q1 2025 → Q1 2026) ─────────
// Источники: hh.ru, DreamJob, Forbes, ГородРабот, CNews

export interface SalaryPeriod {
  min: number
  median: number
  max: number
  period: string
}

export interface ExperienceImpact {
  responseRate: string
  quality: string
  note: string
}

export interface SalaryBenchmark {
  current: SalaryPeriod
  previous: SalaryPeriod
  yoyGrowth: number
  responseRate: {
    withSalary: number
    withoutSalary: number
    belowMarket: string
    inMarket: string
    aboveMarket: string
  }
  experienceImpact: {
    "1-3": ExperienceImpact
    "3-5": ExperienceImpact
    "5+": ExperienceImpact
  }
}

export const salaryBenchmarks: Record<string, SalaryBenchmark> = {
  "Руководитель отдела продаж (РОП)": {
    current: { min: 120000, median: 186000, max: 400000, period: "Q1 2026" },
    previous: { min: 100000, median: 160000, max: 350000, period: "Q1 2025" },
    yoyGrowth: 16,
    responseRate: {
      withSalary: 100, withoutSalary: 52,
      belowMarket: "Ниже рынка — отклики в основном от junior. Ожидайте слабый поток.",
      inMarket: "В рынке — хороший баланс количества и качества откликов.",
      aboveMarket: "Выше рынка — сильные кандидаты откликаются быстро, закроете за 2-3 недели.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий (много откликов)", quality: "Средне-низкое", note: "43% вакансий рынка открыты для 1-3 лет. Много кандидатов, но потребуется жёсткий скрининг." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимальный баланс. Кандидаты с реальным опытом построения отделов." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Мало откликов, но каждый — сильный. Рекомендуем активный поиск + хедхантинг." },
    },
  },
  "Менеджер по продажам": {
    current: { min: 60000, median: 95000, max: 200000, period: "Q1 2026" },
    previous: { min: 55000, median: 86000, max: 180000, period: "Q1 2025" },
    yoyGrowth: 10,
    responseRate: {
      withSalary: 100, withoutSalary: 55,
      belowMarket: "Ниже рынка. Менеджеры по продажам — самая массовая профессия (646 тыс. вакансий в 2025), конкуренция за кадры высокая.",
      inMarket: "В рынке. Стабильный поток откликов.",
      aboveMarket: "Выше рынка. Быстрое закрытие позиции.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Очень высокий", quality: "Низкое-среднее", note: "Массовый сегмент. Нужен AI-скрининг для фильтрации." },
      "3-5": { responseRate: "Высокий", quality: "Среднее-высокое", note: "Хороший баланс." },
      "5+": { responseRate: "Средний", quality: "Высокое", note: "Senior продажники, часто уже РОП-кандидаты." },
    },
  },
  "HR-менеджер": {
    current: { min: 70000, median: 120000, max: 220000, period: "Q1 2026" },
    previous: { min: 60000, median: 105000, max: 200000, period: "Q1 2025" },
    yoyGrowth: 14,
    responseRate: {
      withSalary: 100, withoutSalary: 50,
      belowMarket: "Ниже рынка. HR-рынок дефицитный.",
      inMarket: "В рынке.",
      aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много начинающих HR." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимальный баланс." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "HRD/HRBP уровень." },
    },
  },
  "Разработчик": {
    current: { min: 150000, median: 250000, max: 500000, period: "Q1 2026" },
    previous: { min: 140000, median: 245000, max: 480000, period: "Q1 2025" },
    yoyGrowth: 2,
    responseRate: {
      withSalary: 100, withoutSalary: 40,
      belowMarket: "Критично ниже рынка. IT-кандидаты очень чувствительны к зарплате.",
      inMarket: "В рынке.",
      aboveMarket: "Выше рынка. Быстрое закрытие.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Средний", quality: "Среднее", note: "Junior-вакансий стало меньше на 30-50% за год." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Middle — основной пул рынка." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Senior дефицит, рекомендуем хедхантинг." },
    },
  },
  "Продакт-менеджер": {
    current: { min: 130000, median: 210000, max: 380000, period: "Q1 2026" },
    previous: { min: 120000, median: 195000, max: 350000, period: "Q1 2025" },
    yoyGrowth: 8,
    responseRate: {
      withSalary: 100, withoutSalary: 45,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много переходящих из смежных ролей." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "CPO-уровень." },
    },
  },
  "Маркетолог": {
    current: { min: 65000, median: 110000, max: 200000, period: "Q1 2026" },
    previous: { min: 60000, median: 100000, max: 180000, period: "Q1 2025" },
    yoyGrowth: 10,
    responseRate: {
      withSalary: 100, withoutSalary: 50,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Массовый сегмент." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Хороший баланс." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "CMO-уровень." },
    },
  },
  "Дизайнер": {
    current: { min: 80000, median: 140000, max: 280000, period: "Q1 2026" },
    previous: { min: 75000, median: 125000, max: 250000, period: "Q1 2025" },
    yoyGrowth: 12,
    responseRate: {
      withSalary: 100, withoutSalary: 48,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много начинающих." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Art Director / Lead." },
    },
  },
  "Аналитик": {
    current: { min: 100000, median: 170000, max: 320000, period: "Q1 2026" },
    previous: { min: 90000, median: 155000, max: 300000, period: "Q1 2025" },
    yoyGrowth: 10,
    responseRate: {
      withSalary: 100, withoutSalary: 45,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много переходящих." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Lead / Head of Analytics." },
    },
  },
  "Бухгалтер": {
    current: { min: 55000, median: 85000, max: 160000, period: "Q1 2026" },
    previous: { min: 50000, median: 78000, max: 150000, period: "Q1 2025" },
    yoyGrowth: 9,
    responseRate: {
      withSalary: 100, withoutSalary: 55,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Массовая позиция." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Средний", quality: "Очень высокое", note: "Главбух уровень." },
    },
  },
  "Руководитель проекта": {
    current: { min: 130000, median: 195000, max: 380000, period: "Q1 2026" },
    previous: { min: 120000, median: 175000, max: 350000, period: "Q1 2025" },
    yoyGrowth: 11,
    responseRate: {
      withSalary: 100, withoutSalary: 45,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много переходящих." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Program Manager / Director." },
    },
  },
  "Тестировщик": {
    current: { min: 90000, median: 150000, max: 270000, period: "Q1 2026" },
    previous: { min: 80000, median: 140000, max: 250000, period: "Q1 2025" },
    yoyGrowth: 7,
    responseRate: {
      withSalary: 100, withoutSalary: 45,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много начинающих QA." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "QA Lead / SDET." },
    },
  },
  "DevOps-инженер": {
    current: { min: 160000, median: 240000, max: 470000, period: "Q1 2026" },
    previous: { min: 150000, median: 230000, max: 450000, period: "Q1 2025" },
    yoyGrowth: 4,
    responseRate: {
      withSalary: 100, withoutSalary: 40,
      belowMarket: "Ниже рынка. DevOps — дефицитная специальность.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Средний", quality: "Среднее", note: "Мало junior DevOps на рынке." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Основной пул." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Platform Engineer / SRE Lead." },
    },
  },
  "Системный администратор": {
    current: { min: 85000, median: 125000, max: 210000, period: "Q1 2026" },
    previous: { min: 80000, median: 120000, max: 200000, period: "Q1 2025" },
    yoyGrowth: 4,
    responseRate: {
      withSalary: 100, withoutSalary: 50,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Массовый сегмент." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Средний", quality: "Очень высокое", note: "Ведущий сисадмин / IT-директор." },
    },
  },
  "Контент-менеджер": {
    current: { min: 45000, median: 75000, max: 130000, period: "Q1 2026" },
    previous: { min: 40000, median: 70000, max: 120000, period: "Q1 2025" },
    yoyGrowth: 7,
    responseRate: {
      withSalary: 100, withoutSalary: 55,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Очень высокий", quality: "Среднее", note: "Массовый сегмент." },
      "3-5": { responseRate: "Высокий", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Средний", quality: "Очень высокое", note: "Head of Content." },
    },
  },
  "Юрист": {
    current: { min: 75000, median: 130000, max: 270000, period: "Q1 2026" },
    previous: { min: 70000, median: 120000, max: 250000, period: "Q1 2025" },
    yoyGrowth: 8,
    responseRate: {
      withSalary: 100, withoutSalary: 50,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много начинающих." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "Руководитель юр. отдела." },
    },
  },
  "Финансовый менеджер": {
    current: { min: 110000, median: 160000, max: 320000, period: "Q1 2026" },
    previous: { min: 100000, median: 150000, max: 300000, period: "Q1 2025" },
    yoyGrowth: 7,
    responseRate: {
      withSalary: 100, withoutSalary: 48,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Много переходящих из бухгалтерии." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Низкий", quality: "Очень высокое", note: "CFO-уровень." },
    },
  },
  "Менеджер по закупкам": {
    current: { min: 65000, median: 95000, max: 170000, period: "Q1 2026" },
    previous: { min: 60000, median: 90000, max: 160000, period: "Q1 2025" },
    yoyGrowth: 6,
    responseRate: {
      withSalary: 100, withoutSalary: 55,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Массовый сегмент." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Средний", quality: "Очень высокое", note: "Руководитель закупок." },
    },
  },
  "Логист": {
    current: { min: 55000, median: 85000, max: 150000, period: "Q1 2026" },
    previous: { min: 50000, median: 80000, max: 140000, period: "Q1 2025" },
    yoyGrowth: 6,
    responseRate: {
      withSalary: 100, withoutSalary: 55,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Высокий", quality: "Среднее", note: "Массовый сегмент." },
      "3-5": { responseRate: "Средний", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Средний", quality: "Очень высокое", note: "Руководитель логистики." },
    },
  },
  "Администратор": {
    current: { min: 38000, median: 58000, max: 95000, period: "Q1 2026" },
    previous: { min: 35000, median: 55000, max: 90000, period: "Q1 2025" },
    yoyGrowth: 5,
    responseRate: {
      withSalary: 100, withoutSalary: 60,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Очень высокий", quality: "Среднее", note: "Массовый сегмент." },
      "3-5": { responseRate: "Высокий", quality: "Высокое", note: "Оптимально." },
      "5+": { responseRate: "Средний", quality: "Высокое", note: "Старший администратор / офис-менеджер." },
    },
  },
  "Оператор call-центра": {
    current: { min: 32000, median: 48000, max: 75000, period: "Q1 2026" },
    previous: { min: 30000, median: 45000, max: 70000, period: "Q1 2025" },
    yoyGrowth: 7,
    responseRate: {
      withSalary: 100, withoutSalary: 60,
      belowMarket: "Ниже рынка.", inMarket: "В рынке.", aboveMarket: "Выше рынка.",
    },
    experienceImpact: {
      "1-3": { responseRate: "Очень высокий", quality: "Среднее", note: "Массовый сегмент, высокая текучка." },
      "3-5": { responseRate: "Высокий", quality: "Высокое", note: "Стабильные сотрудники." },
      "5+": { responseRate: "Средний", quality: "Высокое", note: "Руководитель КЦ." },
    },
  },
}

// ── Общая рыночная статистика ───────────────────────────────────────────────

export const marketStats = {
  period: "Q1 2026 vs Q1 2025",
  overallMedianGrowth: 15,
  moscowMedianGrowth: 12,
  salesSectorGrowth: 11,
  remoteMedian: 82300,
  remoteGrowth: 78,
  resumeGrowth: 25,
  newResumeGrowth: 36,
  vacanciesWithoutSalaryLoss: 48,
  juniorVacancyDecline: 40,
  optimalExperience: "3-5 лет",
  source: "hh.ru, DreamJob, Forbes, ГородРабот, CNews — Q1 2026",
}

// ── Коэффициенты для корректировки ──────────────────────────────────────────

export const adjustments = {
  format: { office: 1.1, hybrid: 1.05, remote: 1.0 } as Record<string, number>,
  city: { "Москва": 1.2, "Санкт-Петербург": 1.05, "Удалённо": 1.0, default: 0.7 } as Record<string, number>,
  niche: { SaaS: 1.15, IT: 1.1, digital: 1.05, default: 1.0 } as Record<string, number>,
}

// ── Алиасы для поиска бенчмарков ────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  "роп": "Руководитель отдела продаж (РОП)",
  "руководитель отдела продаж": "Руководитель отдела продаж (РОП)",
  "head of sales": "Руководитель отдела продаж (РОП)",
  "sales manager": "Менеджер по продажам",
  "сейлз": "Менеджер по продажам",
  "продажник": "Менеджер по продажам",
  "hr": "HR-менеджер",
  "эйчар": "HR-менеджер",
  "рекрутер": "HR-менеджер",
  "программист": "Разработчик",
  "developer": "Разработчик",
  "frontend": "Разработчик",
  "backend": "Разработчик",
  "fullstack": "Разработчик",
  "product manager": "Продакт-менеджер",
  "продакт": "Продакт-менеджер",
  "pm": "Руководитель проекта",
  "project manager": "Руководитель проекта",
  "qa": "Тестировщик",
  "тестировщик": "Тестировщик",
  "devops": "DevOps-инженер",
  "сисадмин": "Системный администратор",
}

const CATEGORY_MAP: Record<string, string> = {
  "продажи": "Менеджер по продажам",
  "it": "Разработчик",
  "маркетинг": "Маркетолог",
  "hr": "HR-менеджер",
  "финансы": "Финансовый менеджер",
  "дизайн": "Дизайнер",
  "аналитика": "Аналитик",
  "логистика": "Логист",
  "юридический": "Юрист",
}

// ── Функции ─────────────────────────────────────────────────────────────────

/**
 * Найти бенчмарк по названию должности или категории
 */
export function findBenchmark(title: string, category?: string): SalaryBenchmark | null {
  if (!title && !category) return null

  const normalizedTitle = (title || "").toLowerCase().trim()
  const normalizedCategory = (category || "").toLowerCase().trim()

  // Точное совпадение
  for (const [key, benchmark] of Object.entries(salaryBenchmarks)) {
    if (key.toLowerCase() === normalizedTitle) return benchmark
  }

  // Частичное совпадение
  for (const [key, benchmark] of Object.entries(salaryBenchmarks)) {
    const keyLower = key.toLowerCase()
    if (normalizedTitle.includes(keyLower) || keyLower.includes(normalizedTitle)) {
      return benchmark
    }
  }

  // Алиасы
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (normalizedTitle.includes(alias)) {
      return salaryBenchmarks[key] || null
    }
  }

  // Категория
  for (const [cat, key] of Object.entries(CATEGORY_MAP)) {
    if (normalizedCategory.includes(cat)) {
      return salaryBenchmarks[key] || null
    }
  }

  return null
}

/**
 * Получить скорректированный бенчмарк с поправками на город/формат/нишу
 */
export function getAdjustedBenchmark(
  category: string,
  city: string = "Москва",
  format: string = "remote",
  niche: string = "default",
): { min: number; median: number; max: number; yoyGrowth: number; previousMedian: number; period: string } | null {
  const benchmark = findBenchmark(category)
  if (!benchmark) return null

  const formatKey = format === "Офис" ? "office" : format === "Гибрид" ? "hybrid" : "remote"
  const cityAdj = adjustments.city[city] || adjustments.city.default
  const formatAdj = adjustments.format[formatKey] || 1.0
  const nicheAdj = adjustments.niche[niche] || adjustments.niche.default
  const multiplier = cityAdj * formatAdj * nicheAdj

  return {
    min: Math.round(benchmark.current.min * multiplier / 1000) * 1000,
    median: Math.round(benchmark.current.median * multiplier / 1000) * 1000,
    max: Math.round(benchmark.current.max * multiplier / 1000) * 1000,
    yoyGrowth: benchmark.yoyGrowth,
    previousMedian: Math.round(benchmark.previous.median * multiplier / 1000) * 1000,
    period: benchmark.current.period,
  }
}

/**
 * Применить коэффициенты города и опыта к current-периоду бенчмарка.
 * Возвращает простой {min, median, max} для обратной совместимости с assessSalary.
 */
export function adjustBenchmark(
  benchmark: SalaryBenchmark,
  city?: string,
  experienceYears?: string,
): { min: number; median: number; max: number } {
  const cityAdj = city ? (adjustments.city[city] || adjustments.city.default) : 1.0

  let expCoeff = 1.0
  if (experienceYears) {
    const years = parseInt(experienceYears)
    if (!isNaN(years)) {
      if (years <= 3) expCoeff = 0.7
      else if (years <= 5) expCoeff = 1.0
      else expCoeff = 1.3
    }
  }

  const coeff = cityAdj * expCoeff
  return {
    min: Math.round(benchmark.current.min * coeff / 1000) * 1000,
    median: Math.round(benchmark.current.median * coeff / 1000) * 1000,
    max: Math.round(benchmark.current.max * coeff / 1000) * 1000,
  }
}

/**
 * Оценка зарплатной вилки относительно рынка
 */
export function assessSalary(
  salaryFrom: number,
  salaryTo: number,
  adjusted: { min: number; median: number; max: number },
  benchmark?: SalaryBenchmark,
): { assessment: string; widthWarning: string | null; impactNote: string | null; responseNote: string | null } {
  const midpoint = (salaryFrom + salaryTo) / 2
  const ratio = salaryTo / salaryFrom

  let assessment: string
  let responseNote: string | null = null

  if (midpoint < adjusted.min) {
    assessment = "значительно ниже рынка"
    if (benchmark) responseNote = benchmark.responseRate.belowMarket
  } else if (midpoint < adjusted.median * 0.85) {
    assessment = "ниже рынка"
    if (benchmark) responseNote = benchmark.responseRate.belowMarket
  } else if (midpoint <= adjusted.median * 1.15) {
    assessment = "в рынке"
    if (benchmark) responseNote = benchmark.responseRate.inMarket
  } else if (midpoint <= adjusted.max) {
    assessment = "выше рынка"
    if (benchmark) responseNote = benchmark.responseRate.aboveMarket
  } else {
    assessment = "значительно выше рынка"
    if (benchmark) responseNote = benchmark.responseRate.aboveMarket
  }

  let widthWarning: string | null = null
  if (ratio > 2.5) {
    widthWarning = `Вилка слишком широкая (${ratio.toFixed(1)}x). Рекомендуем сузить — кандидаты не доверяют разбросу больше 2x`
  }

  let impactNote: string | null = null
  if (midpoint < adjusted.median) {
    const pctDiff = Math.round(((adjusted.median - midpoint) / midpoint) * 100)
    impactNote = `При повышении до ${formatSalary(adjusted.median)} отклик может вырасти на ~${Math.min(pctDiff, 60)}%`
  }

  return { assessment, widthWarning, impactNote, responseNote }
}

export function formatSalary(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ₽`
  if (value >= 1000) return `${Math.round(value / 1000)}к ₽`
  return `${value} ₽`
}

/**
 * Предложения по улучшению названия вакансии
 */
export function suggestTitles(title: string): string[] {
  if (!title.trim()) return []

  const suggestions: string[] = []
  const lower = title.toLowerCase().trim()

  const abbreviations: Record<string, string> = {
    "роп": "Руководитель отдела продаж",
    "рок": "Руководитель отдела качества",
    "cto": "Технический директор (CTO)",
    "cfo": "Финансовый директор (CFO)",
    "cmo": "Директор по маркетингу (CMO)",
    "coo": "Операционный директор (COO)",
  }

  for (const [abbr, full] of Object.entries(abbreviations)) {
    if (lower === abbr || lower.startsWith(abbr + " ")) {
      const rest = title.slice(abbr.length).trim()
      suggestions.push(rest ? `${full} ${rest}` : full)
    }
  }

  const hasFormat = /удалённ|remote|офис|гибрид|hybrid/i.test(title)
  if (!hasFormat && title.length < 45) {
    suggestions.push(`${title} (удалённо)`)
  }

  const hasNiche = /b2b|b2c|saas|it|fintech|edtech|e-com|retail/i.test(title)
  if (!hasNiche && title.length < 40) {
    suggestions.push(`${title} (B2B, SaaS)`)
  }

  if (title.length > 50) {
    const shortened = title.replace(/\s*\([^)]*\)\s*$/, "").trim()
    if (shortened.length < title.length && shortened.length >= 10) {
      suggestions.push(shortened)
    }
  }

  return suggestions.slice(0, 3)
}
