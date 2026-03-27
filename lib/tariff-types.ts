export interface TariffFeatures {
  branding: boolean
  customDomain: boolean
  aiVideoInterview: boolean
  api: boolean
}

export interface Tariff {
  id: string
  name: string
  price: number // руб/мес, 0 = бесплатно
  trialDays: number
  maxVacancies: number
  maxCandidates: number
  features: TariffFeatures
  badge?: string // "Популярный", "Лучший выбор" и т.д.
  badgeColor?: string
  active: boolean
  description?: string
  personalManager?: boolean
  prioritySupport?: boolean
  aiRecruiterName?: boolean
}

export interface ClientCompany {
  id: string
  name: string
  tariffId: string
  vacanciesUsed: number
  candidatesUsed: number
  paidUntil: Date
  manager: string
  status: "active" | "trial" | "overdue" | "churned"
  email: string
}

export const DEFAULT_TARIFFS: Tariff[] = [
  {
    id: "solo",
    name: "Solo",
    price: 14900,
    trialDays: 0,
    maxVacancies: 1,
    maxCandidates: 400,
    features: { branding: false, customDomain: false, aiVideoInterview: false, api: false },
    active: true,
  },
  {
    id: "starter",
    name: "Starter",
    price: 24900,
    trialDays: 0,
    maxVacancies: 3,
    maxCandidates: 1200,
    features: { branding: false, customDomain: false, aiVideoInterview: false, api: false },
    active: true,
  },
  {
    id: "business",
    name: "Business",
    price: 49900,
    trialDays: 0,
    maxVacancies: 10,
    maxCandidates: 4000,
    features: { branding: true, customDomain: false, aiVideoInterview: true, api: false },
    badge: "Популярный",
    badgeColor: "bg-primary text-primary-foreground",
    active: true,
    prioritySupport: true,
    aiRecruiterName: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 99900,
    trialDays: 0,
    maxVacancies: 999,
    maxCandidates: 10000,
    features: { branding: true, customDomain: true, aiVideoInterview: true, api: true },
    active: true,
    personalManager: true,
    prioritySupport: true,
    aiRecruiterName: true,
  },
]

export const DEFAULT_CLIENTS: ClientCompany[] = [
  {
    id: "c-1",
    name: "ООО Ромашка",
    tariffId: "business",
    vacanciesUsed: 7,
    candidatesUsed: 847,
    paidUntil: new Date(2026, 3, 1),
    manager: "Анна Иванова",
    status: "active",
    email: "hr@romashka.ru",
  },
  {
    id: "c-2",
    name: "TechCorp",
    tariffId: "pro",
    vacanciesUsed: 12,
    candidatesUsed: 3420,
    paidUntil: new Date(2026, 4, 15),
    manager: "Дмитрий Козлов",
    status: "active",
    email: "elena@techcorp.ru",
  },
  {
    id: "c-3",
    name: "СтройМонтаж",
    tariffId: "starter",
    vacanciesUsed: 2,
    candidatesUsed: 156,
    paidUntil: new Date(2026, 2, 10),
    manager: "Анна Иванова",
    status: "overdue",
    email: "hr@stroimontazh.ru",
  },
]

export function formatPrice(price: number): string {
  if (price === 0) return "Бесплатно"
  return `${price.toLocaleString("ru-RU")} ₽/мес`
}
