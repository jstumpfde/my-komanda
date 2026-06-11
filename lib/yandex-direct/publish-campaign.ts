// Публикация AI-черновика в Директ: кампания (поиск и/или РСЯ) → группа →
// объявления → ключи → отправка на модерацию. Создаём ОТДЕЛЬНЫЕ кампании
// под поиск и РСЯ (раздельные стратегии и ставки — стандарт ведения).

import { db } from "@/lib/db"
import { yandexDirectCampaigns } from "@/lib/db/schema"
import { YandexDirectClient } from "@/lib/yandex-direct/client"
import type { CampaignDraft } from "@/lib/yandex-direct/generate-campaign"

export interface PublishOptions {
  draft: CampaignDraft
  landingUrl: string
  regionIds: number[]        // регионы показа (геобаза Яндекса: 213 Москва, 2 СПб, 225 Россия)
  weeklyBudgetRub: number
  placements: Array<"search" | "network">
}

export interface PublishResult {
  campaigns: Array<{ placement: string; directId: number; adIds: number[]; keywordIds: number[] }>
}

export async function publishDraft(companyId: string, opts: PublishOptions): Promise<PublishResult> {
  const client = new YandexDirectClient(companyId)
  const result: PublishResult = { campaigns: [] }

  for (const placement of opts.placements) {
    const isSearch = placement === "search"
    const ads = isSearch ? opts.draft.searchAds : opts.draft.networkAds
    if (!ads.length) continue

    const name = `${opts.draft.campaignName} — ${isSearch ? "Поиск" : "РСЯ"} [AI]`
    const campaignId = await client.addTextCampaign({
      name,
      placement,
      // Бюджет делим поровну между площадками
      weeklyBudgetRub: Math.max(300, Math.round(opts.weeklyBudgetRub / opts.placements.length)),
      negativeKeywords: opts.draft.negativeKeywords,
    })

    const adGroupId = await client.addAdGroup(campaignId, "Группа 1 (AI)", opts.regionIds)
    const adIds = await client.addTextAds(
      adGroupId,
      ads.map(a => ({ title: a.title, title2: a.title2 || undefined, text: a.text, href: opts.landingUrl })),
    )
    const keywordIds = await client.addKeywords(adGroupId, opts.draft.keywords)
    await client.moderateAds(adIds)

    await db.insert(yandexDirectCampaigns).values({
      companyId,
      directId: campaignId,
      name,
      campaignType: "TEXT_CAMPAIGN",
      placement,
      state: "ON",
      status: "MODERATION",
      createdByAgent: true,
    }).onConflictDoNothing()

    result.campaigns.push({ placement, directId: campaignId, adIds, keywordIds })
  }

  if (!result.campaigns.length) throw new Error("Не выбрано ни одной площадки или нет объявлений в черновике")
  return result
}
