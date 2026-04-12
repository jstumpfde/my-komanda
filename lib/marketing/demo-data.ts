// Каналы
export const MARKETING_CHANNELS = [
  {
    id: "yandex", name: "Яндекс.Директ", icon: "Search", color: "#FF0000",
    budget: 150000, spent: 127500, impressions: 45200, clicks: 3120,
    leads: 89, conversions: 23, ctr: 6.9, cpa: 5543, status: "active",
  },
  {
    id: "vk", name: "VK Реклама", icon: "Users", color: "#0077FF",
    budget: 80000, spent: 68400, impressions: 128000, clicks: 4870,
    leads: 134, conversions: 31, ctr: 3.8, cpa: 2206, status: "active",
  },
  {
    id: "telegram", name: "Telegram Ads", icon: "Send", color: "#26A5E4",
    budget: 50000, spent: 43200, impressions: 67000, clicks: 2010,
    leads: 67, conversions: 15, ctr: 3.0, cpa: 2880, status: "active",
  },
  {
    id: "seo", name: "SEO / Органика", icon: "Globe", color: "#10B981",
    budget: 30000, spent: 30000, impressions: 89000, clicks: 12400,
    leads: 210, conversions: 45, ctr: 13.9, cpa: 667, status: "active",
  },
  {
    id: "email", name: "Email-рассылка", icon: "Mail", color: "#8B5CF6",
    budget: 15000, spent: 12800, impressions: 8500, clicks: 1870,
    leads: 52, conversions: 18, ctr: 22.0, cpa: 711, status: "active",
  },
  {
    id: "referral", name: "Реферальная программа", icon: "Gift", color: "#F59E0B",
    budget: 25000, spent: 18900, impressions: 0, clicks: 0,
    leads: 38, conversions: 28, ctr: 0, cpa: 675, status: "active",
  },
] as const

// Сидированные данные по дням (стабильные — не random)
export const LEADS_BY_DAY = [
  { date: "2026-04-01", yandex: 3, vk: 5, telegram: 2, seo: 7, email: 2, referral: 1 },
  { date: "2026-04-02", yandex: 2, vk: 4, telegram: 3, seo: 8, email: 1, referral: 0 },
  { date: "2026-04-03", yandex: 4, vk: 6, telegram: 1, seo: 5, email: 3, referral: 2 },
  { date: "2026-04-04", yandex: 3, vk: 3, telegram: 4, seo: 9, email: 1, referral: 1 },
  { date: "2026-04-05", yandex: 5, vk: 7, telegram: 2, seo: 6, email: 2, referral: 0 },
  { date: "2026-04-06", yandex: 1, vk: 2, telegram: 1, seo: 4, email: 1, referral: 1 },
  { date: "2026-04-07", yandex: 2, vk: 3, telegram: 2, seo: 3, email: 0, referral: 0 },
  { date: "2026-04-08", yandex: 4, vk: 5, telegram: 3, seo: 8, email: 2, referral: 2 },
  { date: "2026-04-09", yandex: 3, vk: 6, telegram: 1, seo: 7, email: 3, referral: 1 },
  { date: "2026-04-10", yandex: 5, vk: 8, telegram: 4, seo: 10, email: 1, referral: 3 },
  { date: "2026-04-11", yandex: 2, vk: 4, telegram: 2, seo: 6, email: 2, referral: 0 },
  { date: "2026-04-12", yandex: 3, vk: 5, telegram: 3, seo: 8, email: 1, referral: 1 },
  { date: "2026-04-13", yandex: 1, vk: 3, telegram: 1, seo: 4, email: 0, referral: 1 },
  { date: "2026-04-14", yandex: 2, vk: 2, telegram: 2, seo: 3, email: 1, referral: 0 },
  { date: "2026-04-15", yandex: 4, vk: 7, telegram: 3, seo: 9, email: 3, referral: 2 },
  { date: "2026-04-16", yandex: 3, vk: 5, telegram: 2, seo: 7, email: 2, referral: 1 },
  { date: "2026-04-17", yandex: 5, vk: 6, telegram: 4, seo: 11, email: 1, referral: 2 },
  { date: "2026-04-18", yandex: 2, vk: 4, telegram: 1, seo: 5, email: 2, referral: 0 },
  { date: "2026-04-19", yandex: 3, vk: 3, telegram: 3, seo: 6, email: 1, referral: 1 },
  { date: "2026-04-20", yandex: 1, vk: 2, telegram: 1, seo: 3, email: 0, referral: 0 },
  { date: "2026-04-21", yandex: 2, vk: 4, telegram: 2, seo: 5, email: 1, referral: 1 },
  { date: "2026-04-22", yandex: 4, vk: 6, telegram: 3, seo: 8, email: 3, referral: 2 },
  { date: "2026-04-23", yandex: 3, vk: 5, telegram: 2, seo: 7, email: 2, referral: 1 },
  { date: "2026-04-24", yandex: 5, vk: 7, telegram: 4, seo: 10, email: 1, referral: 3 },
  { date: "2026-04-25", yandex: 2, vk: 3, telegram: 1, seo: 5, email: 2, referral: 0 },
  { date: "2026-04-26", yandex: 1, vk: 2, telegram: 2, seo: 4, email: 0, referral: 1 },
  { date: "2026-04-27", yandex: 2, vk: 3, telegram: 1, seo: 3, email: 1, referral: 0 },
  { date: "2026-04-28", yandex: 4, vk: 5, telegram: 3, seo: 9, email: 2, referral: 2 },
  { date: "2026-04-29", yandex: 3, vk: 6, telegram: 2, seo: 7, email: 3, referral: 1 },
  { date: "2026-04-30", yandex: 5, vk: 8, telegram: 4, seo: 12, email: 1, referral: 2 },
]

// Кампании
export const CAMPAIGNS = [
  { id: "1", name: "Весенняя акция -20%", channel: "yandex", status: "active", budget: 45000, spent: 38200, leads: 34, startDate: "2026-04-01", endDate: "2026-04-30" },
  { id: "2", name: "Ретаргет посетителей сайта", channel: "vk", status: "active", budget: 25000, spent: 19800, leads: 47, startDate: "2026-04-05", endDate: "2026-04-25" },
  { id: "3", name: "Запуск нового продукта", channel: "telegram", status: "active", budget: 30000, spent: 24100, leads: 28, startDate: "2026-04-10", endDate: "2026-04-20" },
  { id: "4", name: "SEO оптимизация блога", channel: "seo", status: "active", budget: 30000, spent: 30000, leads: 89, startDate: "2026-03-01", endDate: "2026-04-30" },
  { id: "5", name: "Рассылка по базе клиентов", channel: "email", status: "completed", budget: 5000, spent: 5000, leads: 23, startDate: "2026-04-01", endDate: "2026-04-07" },
  { id: "6", name: "Холодная рассылка IT-директорам", channel: "email", status: "paused", budget: 10000, spent: 4200, leads: 12, startDate: "2026-04-08", endDate: "2026-04-30" },
] as const

// AI рекомендации
export const AI_RECOMMENDATIONS = [
  { type: "success", text: "SEO показывает лучший CPA (667 ₽). Рекомендую увеличить бюджет на контент-маркетинг." },
  { type: "warning", text: "Яндекс.Директ: CPA вырос на 12% за неделю. Проверьте минус-слова и посадочные страницы." },
  { type: "info", text: "VK Реклама генерирует больше всего лидов. Попробуйте look-alike аудитории для масштабирования." },
  { type: "success", text: "Email-рассылка: Open Rate 22% — выше среднего по рынку (15-18%). Хорошие заголовки!" },
] as const

export const CHANNEL_MAP = Object.fromEntries(MARKETING_CHANNELS.map((c) => [c.id, c]))
