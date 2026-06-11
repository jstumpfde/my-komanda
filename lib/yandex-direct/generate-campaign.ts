// AI-генерация черновика кампании Директа из брифа (Claude Sonnet).
// Черновик не пишется в БД — UI показывает его на редактирование,
// публикация в Директ — отдельным шагом (publish/route.ts).

import { callClaudeSonnet } from "@/lib/ai/client"

export interface CampaignBrief {
  product: string          // что рекламируем (описание товара/услуги/оффера)
  landingUrl: string
  geo: string              // регион словами («Москва», «вся Россия»)
  weeklyBudgetRub: number
  goal?: string            // целевое действие (заявка, звонок, покупка)
  audience?: string        // кто клиент
  advantages?: string      // преимущества/УТП
}

export interface AdDraft {
  title: string   // ≤56 символов
  title2: string  // ≤30 символов
  text: string    // ≤81 символ
}

export interface CampaignDraft {
  campaignName: string
  searchAds: AdDraft[]      // 3 варианта для поиска
  networkAds: AdDraft[]     // 3 варианта для РСЯ (более эмоциональные)
  keywords: string[]        // 20–40 ключевых фраз
  negativeKeywords: string[] // 15–30 минус-слов
  strategyComment: string   // пояснение агента по стратегии запуска
}

const SYSTEM = `Ты — старший специалист по контекстной рекламе Яндекс.Директ с 10-летним опытом.
Составляешь кампании, которые проходят модерацию Директа и дают низкий CPA.

Правила:
- Заголовок 1 (title): максимум 56 символов, содержит ключевой запрос или суть оффера.
- Заголовок 2 (title2): максимум 30 символов, усиливает (цена, скорость, гарантия).
- Текст (text): максимум 81 символ, конкретика и призыв к действию.
- Для поиска — объявления под запрос (релевантность ключам), для РСЯ — шире и эмоциональнее.
- Ключевые фразы: коммерческие («купить», «цена», «заказать», город), без слишком общих
  однословников. Где нужно — операторы Директа ("кавычки", !фикс, +предлог).
- Минус-слова: отсекают нецелевой трафик (бесплатно, своими руками, вакансии, б/у,
  скачать, фото, отзывы — по смыслу ниши).
- Запрещено: превосходные степени без подтверждения («лучший», «№1»), CAPS, лишние «!».

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки:
{
  "campaignName": "...",
  "searchAds": [{"title": "...", "title2": "...", "text": "..."}, ...3 шт],
  "networkAds": [{"title": "...", "title2": "...", "text": "..."}, ...3 шт],
  "keywords": ["...", ...20-40 шт],
  "negativeKeywords": ["...", ...15-30 шт],
  "strategyComment": "2-4 предложения: как запускать, что тестировать, чего ждать"
}`

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("AI вернул не-JSON ответ")
  return JSON.parse(cleaned.slice(start, end + 1)) as T
}

const clampAd = (ad: AdDraft): AdDraft => ({
  title: (ad.title ?? "").slice(0, 56),
  title2: (ad.title2 ?? "").slice(0, 30),
  text: (ad.text ?? "").slice(0, 81),
})

export async function generateCampaignDraft(brief: CampaignBrief): Promise<CampaignDraft> {
  const prompt = `Составь кампанию Яндекс.Директ (поиск + РСЯ) по брифу:

Продукт/услуга: ${brief.product}
Посадочная страница: ${brief.landingUrl}
География: ${brief.geo}
Недельный бюджет: ${brief.weeklyBudgetRub} ₽
Целевое действие: ${brief.goal || "заявка с сайта"}
${brief.audience ? `Аудитория: ${brief.audience}` : ""}
${brief.advantages ? `Преимущества/УТП: ${brief.advantages}` : ""}`

  const raw = await callClaudeSonnet(prompt, SYSTEM, 4000)
  const draft = parseJson<CampaignDraft>(raw)

  return {
    campaignName: (draft.campaignName || brief.product).slice(0, 255),
    searchAds: (draft.searchAds ?? []).slice(0, 5).map(clampAd).filter(a => a.title && a.text),
    networkAds: (draft.networkAds ?? []).slice(0, 5).map(clampAd).filter(a => a.title && a.text),
    keywords: (draft.keywords ?? []).map(k => String(k).trim()).filter(Boolean).slice(0, 100),
    negativeKeywords: (draft.negativeKeywords ?? []).map(k => String(k).trim()).filter(Boolean).slice(0, 100),
    strategyComment: draft.strategyComment ?? "",
  }
}
