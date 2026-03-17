export type SourceType = "hh" | "avito" | "telegram" | "whatsapp" | "vk" | "site" | "qr" | "referral" | "custom"

export interface UtmParams {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  utm_term: string
}

export interface TrackedLink {
  id: string
  name: string
  vacancyId: string
  vacancyName: string
  sourceType: SourceType
  account: string
  color: string
  utm: UtmParams
  fullUrl: string
  shortUrl: string
  clicks: number
  responses: number
  conversion: number
  createdAt: Date
  auto?: boolean
}

export interface LinkAnalytics {
  dailyClicks: { date: string; clicks: number; responses: number }[]
  funnelStages: { stage: string; count: number }[]
  candidates: { name: string; stage: string; date: Date }[]
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  hh: "hh.ru",
  avito: "Авито",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  vk: "VK",
  site: "Сайт компании",
  qr: "QR-код",
  referral: "Реферал",
  custom: "Своё",
}

export const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  hh: "#ef4444",
  avito: "#22c55e",
  telegram: "#06b6d4",
  whatsapp: "#22c55e",
  vk: "#3b82f6",
  site: "#f59e0b",
  qr: "#8b5cf6",
  referral: "#10b981",
  custom: "#6b7280",
}

export const DEFAULT_UTM_BY_SOURCE: Record<SourceType, Partial<UtmParams>> = {
  hh: { utm_source: "hh", utm_medium: "job_board" },
  avito: { utm_source: "avito", utm_medium: "job_board" },
  telegram: { utm_source: "telegram", utm_medium: "social" },
  whatsapp: { utm_source: "whatsapp", utm_medium: "messenger" },
  vk: { utm_source: "vk", utm_medium: "social" },
  site: { utm_source: "website", utm_medium: "organic" },
  qr: { utm_source: "qr", utm_medium: "offline" },
  referral: { utm_source: "referral", utm_medium: "referral" },
  custom: { utm_source: "", utm_medium: "" },
}

export const DEFAULT_TRACKED_LINKS: TrackedLink[] = [
  {
    id: "lnk-1", name: "TG канал март", vacancyId: "1", vacancyName: "Менеджер по продажам",
    sourceType: "telegram", account: "@romashka_hr", color: "#06b6d4",
    utm: { utm_source: "telegram", utm_medium: "social", utm_campaign: "весна_2026", utm_content: "hr_channel_march", utm_term: "менеджер_продаж" },
    fullUrl: "/vacancy/manager?utm_source=telegram&utm_campaign=vesna_2026", shortUrl: "hrf.link/tg1m",
    clicks: 234, responses: 67, conversion: 29, createdAt: new Date(2026, 2, 1),
  },
  {
    id: "lnk-2", name: "WA рассылка", vacancyId: "1", vacancyName: "Менеджер по продажам",
    sourceType: "whatsapp", account: "+7 999 123-45-67", color: "#22c55e",
    utm: { utm_source: "whatsapp", utm_medium: "messenger", utm_campaign: "весна_2026", utm_content: "wa_blast", utm_term: "" },
    fullUrl: "/vacancy/manager?utm_source=whatsapp&utm_campaign=vesna_2026", shortUrl: "hrf.link/wa2",
    clicks: 89, responses: 31, conversion: 35, createdAt: new Date(2026, 2, 5),
  },
  {
    id: "lnk-3", name: "hh основной", vacancyId: "1", vacancyName: "Менеджер по продажам",
    sourceType: "hh", account: "anna@romashka.ru", color: "#ef4444",
    utm: { utm_source: "hh", utm_medium: "job_board", utm_campaign: "auto", utm_content: "", utm_term: "" },
    fullUrl: "/vacancy/manager?utm_source=hh", shortUrl: "hrf.link/hh1",
    clicks: 612, responses: 213, conversion: 35, createdAt: new Date(2026, 1, 15), auto: true,
  },
  {
    id: "lnk-4", name: "Сайт компании", vacancyId: "1", vacancyName: "Менеджер по продажам",
    sourceType: "site", account: "—", color: "#f59e0b",
    utm: { utm_source: "website", utm_medium: "organic", utm_campaign: "career_page", utm_content: "", utm_term: "" },
    fullUrl: "/vacancy/manager?utm_source=website", shortUrl: "hrf.link/site1",
    clicks: 56, responses: 22, conversion: 39, createdAt: new Date(2026, 2, 10),
  },
]

export function generateShortCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let code = ""
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export function getMockAnalytics(linkId: string): LinkAnalytics {
  return {
    dailyClicks: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 13 + i)
      return { date: `${d.getDate()}.${d.getMonth() + 1}`, clicks: 5 + Math.floor(Math.random() * 30), responses: 2 + Math.floor(Math.random() * 12) }
    }),
    funnelStages: [
      { stage: "Переход", count: 120 }, { stage: "Отклик", count: 45 },
      { stage: "Демонстрация", count: 18 }, { stage: "Интервью", count: 6 }, { stage: "Нанят", count: 2 },
    ],
    candidates: Array.from({ length: 8 }, (_, i) => ({
      name: `Кандидат ${i + 1}`, stage: ["Воронка", "Демо", "Интервью", "Нанят"][i % 4],
      date: new Date(Date.now() - i * 3 * 86400000),
    })),
  }
}
