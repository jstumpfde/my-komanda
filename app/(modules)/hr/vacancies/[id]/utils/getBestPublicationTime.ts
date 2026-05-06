export interface PublicationTimeResult {
  dayOfWeek: string
  time: string
  reasoning: string
}

interface RuleEntry {
  keywords: string[]
  result: PublicationTimeResult
}

const RULES: RuleEntry[] = [
  { keywords: ["продаж", "sales", "b2b"], result: { dayOfWeek: "Понедельник", time: "09:00–11:00", reasoning: "B2B-кандидаты активны утром в начале недели" } },
  { keywords: ["it", "разработ", "программ", "фронтенд", "бэкенд", "devops", "frontend", "backend", "qa", "тестировщик"], result: { dayOfWeek: "Вторник", time: "14:00–16:00", reasoning: "IT-кандидаты смотрят hh.ru в обеденное время" } },
  { keywords: ["маркетинг", "smm", "контент", "pr"], result: { dayOfWeek: "Среда", time: "10:00–12:00", reasoning: "Креативные роли — середина недели, утро" } },
  { keywords: ["hr", "кадр", "рекрутер", "подбор"], result: { dayOfWeek: "Понедельник", time: "10:00–12:00", reasoning: "HR ищут работу в начале недели" } },
  { keywords: ["производ", "склад", "логист", "водител", "грузчик", "оператор"], result: { dayOfWeek: "Четверг", time: "18:00–20:00", reasoning: "Кандидаты смотрят после работы" } },
  { keywords: ["финанс", "бухгалт", "экономист", "аналитик"], result: { dayOfWeek: "Вторник", time: "10:00–12:00", reasoning: "Финансовые специалисты активны утром" } },
  { keywords: ["дизайн", "ux", "ui"], result: { dayOfWeek: "Среда", time: "11:00–13:00", reasoning: "Креативные специалисты — середина недели" } },
  { keywords: ["юрист", "правов"], result: { dayOfWeek: "Понедельник", time: "10:00–12:00", reasoning: "Юристы активны в начале рабочей недели" } },
  { keywords: ["руковод", "директор", "head", "lead", "ceo", "cto"], result: { dayOfWeek: "Вторник", time: "09:00–11:00", reasoning: "Топ-менеджеры смотрят вакансии рано утром" } },
  { keywords: ["продавец", "консультант", "официант", "бариста", "повар", "кассир"], result: { dayOfWeek: "Пятница", time: "16:00–19:00", reasoning: "Сервисные роли — конец недели, после работы" } },
  { keywords: ["ассистент", "секретарь", "помощник"], result: { dayOfWeek: "Вторник", time: "10:00–12:00", reasoning: "Административные роли — утро вторника" } },
]

const DEFAULT_RESULT: PublicationTimeResult = { dayOfWeek: "Вторник", time: "11:00–13:00", reasoning: "Универсальное время максимума активности" }

export function getBestPublicationTime(vacancy: { title?: string | null }): PublicationTimeResult {
  const title = (vacancy?.title ?? "").toLowerCase()
  if (!title) return DEFAULT_RESULT
  for (const rule of RULES) {
    if (rule.keywords.some(k => title.includes(k))) return rule.result
  }
  return DEFAULT_RESULT
}
