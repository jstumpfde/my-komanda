export const B2B_ACCOUNTS = [
  {
    id: "1", name: "ГК Ростех", industry: "Промышленность", size: "10000+",
    revenue: "2.1 трлн ₽", status: "active", tier: "enterprise",
    deals: 3, totalValue: 12500000, avgCycle: 120,
    contacts: [
      { name: "Сергей Чемезов", role: "Генеральный директор", influence: "decision_maker", engagement: "low" },
      { name: "Алексей Петров", role: "Директор по закупкам", influence: "decision_maker", engagement: "high" },
      { name: "Мария Иванова", role: "Руководитель IT", influence: "influencer", engagement: "medium" },
      { name: "Дмитрий Козлов", role: "Инженер", influence: "user", engagement: "high" },
    ],
    lastActivity: "2026-04-11",
  },
  {
    id: "2", name: "Сбербанк", industry: "Финансы", size: "10000+",
    revenue: "3.5 трлн ₽", status: "active", tier: "enterprise",
    deals: 2, totalValue: 8700000, avgCycle: 90,
    contacts: [
      { name: "Анна Смирнова", role: "VP Digital", influence: "decision_maker", engagement: "high" },
      { name: "Игорь Волков", role: "Директор по иннов��циям", influence: "champion", engagement: "high" },
      { name: "Елена Новикова", role: "Менеджер проектов", influence: "influencer", engagement: "medium" },
    ],
    lastActivity: "2026-04-12",
  },
  {
    id: "3", name: "Яндекс", industry: "IT", size: "5000-10000",
    revenue: "800 млрд ₽", status: "active", tier: "enterprise",
    deals: 1, totalValue: 4200000, avgCycle: 60,
    contacts: [
      { name: "Павел Кузнецов", role: "CTO", influence: "decision_maker", engagement: "medium" },
      { name: "Ольга Данилова", role: "Head of Procurement", influence: "champion", engagement: "high" },
    ],
    lastActivity: "2026-04-10",
  },
  {
    id: "4", name: "Газпром нефть", industry: "Нефть и газ", size: "10000+",
    revenue: "3.2 трлн ₽", status: "prospect", tier: "enterprise",
    deals: 1, totalValue: 15000000, avgCycle: 180,
    contacts: [
      { name: "Виктор Орлов", role: "Директор по цифровизации", influence: "decision_maker", engagement: "low" },
      { name: "Наталья Белова", role: "Начальник отдела IT", influence: "influencer", engagement: "medium" },
    ],
    lastActivity: "2026-04-08",
  },
  {
    id: "5", name: "X5 Group", industry: "Ритейл", size: "5000-10000",
    revenue: "2.9 трлн ₽", status: "active", tier: "strategic",
    deals: 2, totalValue: 6300000, avgCycle: 75,
    contacts: [
      { name: "Андрей Соколов", role: "COO", influence: "decision_maker", engagement: "high" },
      { name: "Татьяна Морозова", role: "HR Director", influence: "champion", engagement: "high" },
      { name: "Михаил Лебедев", role: "IT Manager", influence: "user", engagement: "medium" },
    ],
    lastActivity: "2026-04-12",
  },
] as const

export const INFLUENCE_ROLES = [
  { id: "decision_maker", label: "ЛПР", color: "#EF4444", icon: "Crown" },
  { id: "champion", label: "Чемпион", color: "#10B981", icon: "Star" },
  { id: "influencer", label: "Влиятель", color: "#3B82F6", icon: "Users" },
  { id: "user", label: "Пользователь", color: "#8B5CF6", icon: "User" },
  { id: "blocker", label: "Блокер", color: "#F59E0B", icon: "ShieldAlert" },
] as const

export const INFLUENCE_MAP = Object.fromEntries(INFLUENCE_ROLES.map((r) => [r.id, r]))

export const ENGAGEMENT_LEVELS = [
  { id: "high", label: "Высокая", color: "#10B981" },
  { id: "medium", label: "Средняя", color: "#F59E0B" },
  { id: "low", label: "Низкая", color: "#EF4444" },
] as const

export const ENGAGEMENT_MAP = Object.fromEntries(ENGAGEMENT_LEVELS.map((e) => [e.id, e]))

export const B2B_DEALS = [
  { id: "1", title: "Внедрение AI-платформы", accountId: "1", accountName: "ГК Ростех", value: 8500000, stage: "proposal", probability: 40, startDate: "2026-01-15", expectedClose: "2026-06-30", daysInPipeline: 87, nextAction: "Презентация для совета директоров 18.04", competitors: ["SAP", "1С"], riskLevel: "medium" },
  { id: "2", title: "Лицензии + поддержка 2026", accountId: "1", accountName: "ГК Ростех", value: 2500000, stage: "negotiation", probability: 70, startDate: "2026-02-01", expectedClose: "2026-04-30", daysInPipeline: 71, nextAction: "Согласование договора с юристами", competitors: [] as string[], riskLevel: "low" },
  { id: "3", title: "Цифровизация HR-процессов", accountId: "2", accountName: "Сбербанк", value: 5200000, stage: "qualifying", probability: 25, startDate: "2026-03-10", expectedClose: "2026-08-15", daysInPipeline: 33, nextAction: "Discovery call с VP Digital 15.04", competitors: ["Workday", "SAP SuccessFactors"], riskLevel: "high" },
  { id: "4", title: "Автоматизация обучения", accountId: "2", accountName: "Сбербанк", value: 3500000, stage: "proposal", probability: 50, startDate: "2026-02-20", expectedClose: "2026-06-01", daysInPipeline: 51, nextAction: "Пилотный проект на 50 сотрудников", competitors: ["iSpring", "GetCourse"], riskLevel: "medium" },
  { id: "5", title: "Корпоративный портал", accountId: "3", accountName: "Яндекс", value: 4200000, stage: "negotiation", probability: 75, startDate: "2026-02-05", expectedClose: "2026-05-15", daysInPipeline: 66, nextAction: "Финальное согласование бюджета", competitors: ["Битрикс24"], riskLevel: "low" },
  { id: "6", title: "Тендер: ERP-система", accountId: "4", accountName: "Газпром нефть", value: 15000000, stage: "new", probability: 10, startDate: "2026-04-01", expectedClose: "2026-12-31", daysInPipeline: 11, nextAction: "Подготовка тендерной документации", competitors: ["SAP", "Oracle", "1С"], riskLevel: "high" },
  { id: "7", title: "HR-платформа для ритейла", accountId: "5", accountName: "X5 Group", value: 3800000, stage: "proposal", probability: 55, startDate: "2026-03-01", expectedClose: "2026-06-15", daysInPipeline: 42, nextAction: "Демо для HR-директора 16.04", competitors: ["HRlink"], riskLevel: "low" },
  { id: "8", title: "Обучение персонала 40K сотрудников", accountId: "5", accountName: "X5 Group", value: 2500000, stage: "qualifying", probability: 30, startDate: "2026-03-20", expectedClose: "2026-07-30", daysInPipeline: 23, nextAction: "Расчёт ROI для COO", competitors: ["Platrum", "GetCourse"], riskLevel: "medium" },
] as const

export const TENDERS = [
  { id: "1", title: "ERP-система для нефтегаза", client: "Газпром нефть", deadline: "2026-05-15", value: 15000000, status: "preparing", competitors: 4 },
  { id: "2", title: "Цифровизация обучения госсектор", client: "Министерство образования", deadline: "2026-06-01", value: 8000000, status: "submitted", competitors: 6 },
  { id: "3", title: "Автоматизация HR ритейл", client: "Магнит", deadline: "2026-04-25", value: 5500000, status: "evaluation", competitors: 3 },
] as const

export const TENDER_STATUSES = [
  { id: "preparing", label: "Подготовка", color: "#F59E0B" },
  { id: "submitted", label: "Подана", color: "#3B82F6" },
  { id: "evaluation", label: "Рассмотрение", color: "#8B5CF6" },
  { id: "won", label: "Выиграна", color: "#10B981" },
  { id: "lost", label: "Проиграна", color: "#EF4444" },
] as const

export const TENDER_STATUS_MAP = Object.fromEntries(TENDER_STATUSES.map((s) => [s.id, s]))

export const WEEKLY_ACTIVITIES = [
  { day: "Пн", meetings: 3, calls: 8, emails: 15, proposals: 1 },
  { day: "Вт", meetings: 2, calls: 12, emails: 20, proposals: 2 },
  { day: "Ср", meetings: 4, calls: 6, emails: 18, proposals: 0 },
  { day: "Чт", meetings: 1, calls: 10, emails: 22, proposals: 1 },
  { day: "Пт", meetings: 3, calls: 9, emails: 16, proposals: 2 },
] as const

export const B2B_FUNNEL = [
  { stage: "Новые", count: 2, value: 15000000, color: "#6B7280" },
  { stage: "Квалификация", count: 2, value: 8700000, color: "#3B82F6" },
  { stage: "Предложение", count: 3, value: 16500000, color: "#8B5CF6" },
  { stage: "Переговоры", count: 2, value: 6700000, color: "#F59E0B" },
] as const

export const TIER_BADGES: Record<string, { label: string; cls: string }> = {
  enterprise: { label: "Enterprise", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  strategic: { label: "Strategic", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
}

export const RISK_COLORS: Record<string, string> = {
  low: "#10B981", medium: "#F59E0B", high: "#EF4444",
}

export function formatValueShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} млн ₽`
  if (v >= 1_000) return `${Math.round(v / 1_000)} тыс ₽`
  return `${v} ₽`
}
