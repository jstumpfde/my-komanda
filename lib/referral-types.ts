export type ReferrerType = "employee" | "freelancer" | "blogger" | "agency" | "tg_channel" | "other"
export type ReferrerStatus = "active" | "paused" | "blocked"

export interface PayoutTrigger {
  id: string
  label: string
  enabled: boolean
  amount: number
  emoji: string
}

export interface ReferralCandidate {
  id: string
  name: string
  vacancy: string
  stage: string
  addedAt: Date
  payouts: { trigger: string; amount: number; date: Date }[]
}

export interface Referrer {
  id: string
  name: string
  contact: string
  type: ReferrerType
  status: ReferrerStatus
  candidates: ReferralCandidate[]
  totalEarned: number
  link: string
  createdAt: Date
}

export const REFERRER_TYPE_LABELS: Record<ReferrerType, string> = {
  employee: "Сотрудник",
  freelancer: "HR-фрилансер",
  blogger: "Блогер",
  agency: "Агентство",
  tg_channel: "TG-канал",
  other: "Другое",
}

export const REFERRER_TYPE_COLORS: Record<ReferrerType, string> = {
  employee: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  freelancer: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  blogger: "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800",
  agency: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  tg_channel: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
  other: "bg-muted text-muted-foreground border-border",
}

export const STATUS_LABELS: Record<ReferrerStatus, string> = {
  active: "Активен",
  paused: "На паузе",
  blocked: "Заблокирован",
}

export const DEFAULT_TRIGGERS: PayoutTrigger[] = [
  { id: "funnel", label: "Попал в воронку", enabled: true, amount: 500, emoji: "📥" },
  { id: "demo", label: "Прошёл демонстрацию", enabled: false, amount: 0, emoji: "🎥" },
  { id: "interview", label: "Прошёл интервью", enabled: false, amount: 0, emoji: "🎤" },
  { id: "hired", label: "Вышел на работу", enabled: true, amount: 3000, emoji: "🎉" },
  { id: "probation", label: "Прошёл испытательный срок ⭐", enabled: true, amount: 7000, emoji: "⭐" },
]

function makeCandidate(id: string, name: string, vacancy: string, stage: string, daysAgo: number, payouts: { trigger: string; amount: number; daysAgo: number }[]): ReferralCandidate {
  return {
    id,
    name,
    vacancy,
    stage,
    addedAt: new Date(Date.now() - daysAgo * 86400000),
    payouts: payouts.map(p => ({ trigger: p.trigger, amount: p.amount, date: new Date(Date.now() - p.daysAgo * 86400000) })),
  }
}

export const DEFAULT_REFERRERS: Referrer[] = [
  {
    id: "ref-ivanov",
    name: "Иванов А.",
    contact: "ivanov@romashka.ru",
    type: "employee",
    status: "active",
    totalEarned: 21000,
    link: "/ref/ref-ivanov",
    createdAt: new Date(2025, 10, 1),
    candidates: [
      makeCandidate("rc1", "Смирнов Олег", "Менеджер по продажам", "Нанят", 60, [
        { trigger: "Попал в воронку", amount: 500, daysAgo: 60 },
        { trigger: "Вышел на работу", amount: 3000, daysAgo: 30 },
        { trigger: "Прошёл испытательный срок", amount: 7000, daysAgo: 5 },
      ]),
      makeCandidate("rc2", "Кузнецова Мария", "Менеджер по продажам", "Нанят", 45, [
        { trigger: "Попал в воронку", amount: 500, daysAgo: 45 },
        { trigger: "Вышел на работу", amount: 3000, daysAgo: 14 },
      ]),
      makeCandidate("rc3", "Попов Игорь", "Менеджер по продажам", "Нанят", 30, [
        { trigger: "Попал в воронку", amount: 500, daysAgo: 30 },
        { trigger: "Вышел на работу", amount: 3000, daysAgo: 7 },
      ]),
      ...Array.from({ length: 9 }, (_, i) => makeCandidate(`rc${4 + i}`, `Кандидат ${4 + i}`, "Менеджер по продажам", ["Воронка", "Квалификация", "Демо", "Интервью"][i % 4], 10 + i * 3, [
        { trigger: "Попал в воронку", amount: 500, daysAgo: 10 + i * 3 },
      ])),
    ],
  },
  {
    id: "ref-tg-hrjobs",
    name: "@hr_jobs",
    contact: "https://t.me/hr_jobs",
    type: "tg_channel",
    status: "active",
    totalEarned: 31200,
    link: "/ref/ref-tg-hrjobs",
    createdAt: new Date(2025, 9, 15),
    candidates: Array.from({ length: 89 }, (_, i) => makeCandidate(`tg${i}`, `Кандидат TG-${i + 1}`, "Различные", i < 8 ? "Нанят" : i < 30 ? "Интервью" : "Воронка", i * 2, [
      { trigger: "Попал в воронку", amount: 500, daysAgo: i * 2 },
      ...(i < 8 ? [{ trigger: "Вышел на работу", amount: 3000, daysAgo: Math.max(1, i) }] : []),
    ])),
  },
  {
    id: "ref-kadry",
    name: "ООО Кадры",
    contact: "info@kadry.ru",
    type: "agency",
    status: "active",
    totalEarned: 47500,
    link: "/ref/ref-kadry",
    createdAt: new Date(2025, 8, 1),
    candidates: Array.from({ length: 28 }, (_, i) => makeCandidate(`ag${i}`, `Кандидат Аг-${i + 1}`, "Различные", i < 5 ? "Нанят" : i < 12 ? "Интервью" : "Воронка", i * 3, [
      { trigger: "Попал в воронку", amount: 500, daysAgo: i * 3 },
      ...(i < 5 ? [{ trigger: "Вышел на работу", amount: 3000, daysAgo: Math.max(1, i * 2) }, { trigger: "Прошёл испытательный срок", amount: 7000, daysAgo: Math.max(1, i) }] : []),
    ])),
  },
]

export function getReferrerById(id: string): Referrer | null {
  return DEFAULT_REFERRERS.find(r => r.id === id) || null
}

export function generateRefLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let code = ""
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
