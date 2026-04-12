export const QC_CHECKLIST = [
  { id: "greeting", label: "Приветствие", weight: 10, description: "Представился, назвал компанию" },
  { id: "needs", label: "Выявление потребностей", weight: 20, description: "Задал открытые вопросы, выслушал" },
  { id: "presentation", label: "Презентация", weight: 20, description: "Рассказал о продукте/услуге под потребность" },
  { id: "objections", label: "Работа с возражениями", weight: 20, description: "Отработал возражения по технике" },
  { id: "closing", label: "Закрытие", weight: 15, description: "Предложил следующий шаг, назначил встречу" },
  { id: "crm", label: "Заполнение CRM", weight: 5, description: "Внёс данные в CRM после звонка" },
  { id: "tone", label: "Тон и вежливость", weight: 10, description: "Доброжелательный, без конфликтов" },
] as const

export const QC_CALLS = [
  {
    id: "1", managerName: "Алексей Иванов", clientName: "ООО Ромашка",
    date: "2026-04-12T09:15:00", duration: 340, type: "incoming",
    totalScore: 87,
    scores: { greeting: 10, needs: 18, presentation: 16, objections: 18, closing: 12, crm: 5, tone: 8 } as Record<string, number>,
    aiSummary: "Менеджер хорошо выявил потребности клиента и провёл презентацию. Немного поспешил с закрытием — стоило задать ещё 1-2 уточняющих вопроса. Тон уверенный, профессиональный.",
    aiRecommendations: ["Больше открытых вопросов перед закрытием", "Использовать технику 'мост' при переходе к цене"],
    sentiment: "positive", result: "meeting_set",
  },
  {
    id: "2", managerName: "Мария Петрова", clientName: "ИП Сидоров",
    date: "2026-04-12T09:45:00", duration: 215, type: "outgoing",
    totalScore: 72,
    scores: { greeting: 8, needs: 14, presentation: 15, objections: 12, closing: 10, crm: 5, tone: 8 } as Record<string, number>,
    aiSummary: "Звонок прошёл хорошо, но менеджер пропустил этап выявления потребностей и сразу перешёл к презентации. Возражение 'дорого' отработано шаблонно.",
    aiRecommendations: ["Не пропускать выявление потребностей", "Подготовить 3-4 варианта отработки 'дорого'"],
    sentiment: "neutral", result: "callback",
  },
  {
    id: "3", managerName: "Дмитрий Козлов", clientName: "ЗАО ТехноГрупп",
    date: "2026-04-12T10:30:00", duration: 180, type: "outgoing",
    totalScore: 45,
    scores: { greeting: 6, needs: 8, presentation: 10, objections: 6, closing: 5, crm: 3, tone: 7 } as Record<string, number>,
    aiSummary: "Слабый звонок. Менеджер читал скрипт монотонно, не слушал клиента. Когда клиент сказал 'не интересно', не попытался вернуть внимание. CRM не заполнен.",
    aiRecommendations: ["Тренировка активного слушания", "Курс по работе с отказами", "Контроль заполнения CRM"],
    sentiment: "negative", result: "rejected",
  },
  {
    id: "4", managerName: "Алексей Иванов", clientName: "ГК Вектор",
    date: "2026-04-12T11:00:00", duration: 420, type: "incoming",
    totalScore: 93,
    scores: { greeting: 10, needs: 20, presentation: 18, objections: 18, closing: 14, crm: 5, tone: 8 } as Record<string, number>,
    aiSummary: "Отличный звонок. Менеджер глубоко разобрался в потребности, предложил точное решение. Закрытие через назначение встречи с демонстрацией. Эталонный звонок для обучения.",
    aiRecommendations: ["Использовать как пример для обучения новых менеджеров"],
    sentiment: "positive", result: "meeting_set",
  },
  {
    id: "5", managerName: "Елена Волкова", clientName: "ООО СтройМир",
    date: "2026-04-12T11:30:00", duration: 290, type: "incoming",
    totalScore: 78,
    scores: { greeting: 9, needs: 16, presentation: 14, objections: 16, closing: 11, crm: 4, tone: 8 } as Record<string, number>,
    aiSummary: "Хороший звонок. Менеджер спокойно отработала возражения, но презентация была слишком общей — не адаптирована под строительную отрасль клиента.",
    aiRecommendations: ["Готовить отраслевые кейсы перед звонком", "Упомянуть клиентов из той же отрасли"],
    sentiment: "positive", result: "proposal_sent",
  },
  {
    id: "6", managerName: "Мария Петрова", clientName: "ИП Новиков",
    date: "2026-04-12T13:15:00", duration: 155, type: "outgoing",
    totalScore: 65,
    scores: { greeting: 8, needs: 12, presentation: 12, objections: 10, closing: 8, crm: 5, tone: 10 } as Record<string, number>,
    aiSummary: "Менеджер была вежлива и приятна в общении, но не хватило напористости при закрытии. Клиент сказал 'подумаю' и менеджер не попыталась закрыть конкретным следующим шагом.",
    aiRecommendations: ["Всегда предлагать конкретный следующий шаг", "Техника 'альтернативное закрытие'"],
    sentiment: "neutral", result: "thinking",
  },
  {
    id: "7", managerName: "Дмитрий Козлов", clientName: "ООО Прайм",
    date: "2026-04-12T14:00:00", duration: 95, type: "outgoing",
    totalScore: 38,
    scores: { greeting: 5, needs: 6, presentation: 8, objections: 4, closing: 5, crm: 2, tone: 8 } as Record<string, number>,
    aiSummary: "Критически слабый звонок. Менеджер не представился полностью, не выявил потребности, при первом возражении сразу сдался. Рекомендуется повторное обучение.",
    aiRecommendations: ["Пройти базовый курс продаж заново", "Назначить наставника", "Ежедневный разбор 2 звонков"],
    sentiment: "negative", result: "rejected",
  },
  {
    id: "8", managerName: "Елена Волкова", clientName: "ЗАО МедТех",
    date: "2026-04-12T14:30:00", duration: 380, type: "incoming",
    totalScore: 85,
    scores: { greeting: 10, needs: 18, presentation: 16, objections: 16, closing: 13, crm: 5, tone: 7 } as Record<string, number>,
    aiSummary: "Хороший звонок с глубоким погружением в тему. Единственный минус — под конец менеджер начала торопиться, что повлияло на тон.",
    aiRecommendations: ["Следить за темпом в конце длинных звонков"],
    sentiment: "positive", result: "proposal_sent",
  },
]

export const MANAGER_RATINGS = [
  { name: "Алексей Иванов", calls: 24, avgScore: 90, trend: "up" as const, bestSkill: "needs", worstSkill: "crm" },
  { name: "Елена Волкова", calls: 18, avgScore: 81, trend: "up" as const, bestSkill: "objections", worstSkill: "tone" },
  { name: "Мария Петрова", calls: 21, avgScore: 68, trend: "stable" as const, bestSkill: "tone", worstSkill: "closing" },
  { name: "Дмитрий Козлов", calls: 15, avgScore: 42, trend: "down" as const, bestSkill: "tone", worstSkill: "needs" },
]

export const CALL_RESULTS_QC = [
  { id: "meeting_set", label: "Встреча назначена", color: "#10B981" },
  { id: "proposal_sent", label: "КП отправлено", color: "#3B82F6" },
  { id: "callback", label: "Перезвонить", color: "#8B5CF6" },
  { id: "thinking", label: "Думает", color: "#F59E0B" },
  { id: "rejected", label: "Отказ", color: "#EF4444" },
] as const

export const RESULT_MAP_QC = Object.fromEntries(CALL_RESULTS_QC.map((r) => [r.id, r]))
export const CHECKLIST_MAP = Object.fromEntries(QC_CHECKLIST.map((c) => [c.id, c]))

export const WEEKLY_SCORES = [
  { day: "Пн", greeting: 8.5, needs: 15, presentation: 14, objections: 13, closing: 10 },
  { day: "Вт", greeting: 8.8, needs: 16, presentation: 15, objections: 14, closing: 11 },
  { day: "Ср", greeting: 8.2, needs: 14, presentation: 13, objections: 12, closing: 9 },
  { day: "Чт", greeting: 9.0, needs: 17, presentation: 16, objections: 15, closing: 12 },
  { day: "Пт", greeting: 8.7, needs: 15, presentation: 14, objections: 14, closing: 11 },
] as const

export function scoreColor(score: number): string {
  if (score >= 80) return "#10B981"
  if (score >= 60) return "#F59E0B"
  return "#EF4444"
}

export function scoreLabel(score: number): string {
  if (score >= 90) return "Отличный звонок"
  if (score >= 75) return "Хороший звонок"
  if (score >= 50) return "Требует работы"
  return "Критический"
}

export function formatDurationQC(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export const SENTIMENT_EMOJI_QC: Record<string, string> = {
  positive: "😊", neutral: "😐", negative: "😞",
}
