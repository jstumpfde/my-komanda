// ─── Best Publication Time (упрощённая первая версия, без AI API) ────────────
//
// Возвращает рекомендацию о лучшем дне/времени для публикации вакансии
// на основе категории должности (определяется по ключевым словам в title).

export interface PublicationTimeResult {
  /** День недели (например, "Понедельник") */
  dayOfWeek: string
  /** Временной интервал (например, "09:00-11:00") */
  time: string
  /** Категория-обоснование (например, "B2B-кандидаты активны утром в начале недели") */
  reasoning: string
}

interface RuleEntry {
  keywords: string[]
  result: PublicationTimeResult
}

const RULES: RuleEntry[] = [
  {
    keywords: ["продаж", "менеджер"],
    result: {
      dayOfWeek: "Понедельник",
      time: "09:00-11:00",
      reasoning: "B2B-кандидаты активны утром в начале недели",
    },
  },
  {
    keywords: ["it", "разработ", "программ", "фронтенд", "бэкенд", "девоп"],
    result: {
      dayOfWeek: "Вторник",
      time: "14:00-16:00",
      reasoning: "IT-кандидаты смотрят hh.ru в обеденное время",
    },
  },
  {
    keywords: ["маркетинг", "smm", "контент"],
    result: {
      dayOfWeek: "Среда",
      time: "10:00-12:00",
      reasoning: "Креативные роли — середина недели, утро",
    },
  },
  {
    keywords: ["hr", "кадр", "рекрутер", "подбор"],
    result: {
      dayOfWeek: "Понедельник",
      time: "10:00-12:00",
      reasoning: "HR ищут работу в начале недели",
    },
  },
  {
    keywords: ["производ", "склад", "логист", "водител"],
    result: {
      dayOfWeek: "Четверг",
      time: "18:00-20:00",
      reasoning: "Кандидаты смотрят после работы",
    },
  },
]

const DEFAULT_RESULT: PublicationTimeResult = {
  dayOfWeek: "Вторник",
  time: "11:00-13:00",
  reasoning: "Универсальное время максимума активности",
}

/**
 * Возвращает рекомендацию о лучшем времени публикации вакансии.
 * Логика — поиск ключевых слов в `title` (lowercase). Первое совпадение выигрывает.
 *
 * @param vacancy объект с полем `title`
 */
export function getBestPublicationTime(
  vacancy: { title?: string | null }
): PublicationTimeResult {
  const title = (vacancy?.title ?? "").toLowerCase()

  if (!title) {
    return DEFAULT_RESULT
  }

  for (const rule of RULES) {
    if (rule.keywords.some(keyword => title.includes(keyword))) {
      return rule.result
    }
  }

  return DEFAULT_RESULT
}
