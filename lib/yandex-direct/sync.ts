// Синк кампаний и дневной статистики Директа в локальные таблицы.
// Вызывается из API «Обновить» и из cron yandex-direct-agent.

import { db } from "@/lib/db"
import {
  yandexDirectIntegrations,
  yandexDirectCampaigns,
  yandexDirectCampaignStats,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { YandexDirectClient, MICRO, type DirectCampaign } from "@/lib/yandex-direct/client"

function placementOf(c: DirectCampaign): string {
  const s = c.TextCampaign?.BiddingStrategy
  if (!s) return "mixed"
  const searchOff = s.Search?.BiddingStrategyType === "SERVING_OFF"
  const networkOff = s.Network?.BiddingStrategyType === "SERVING_OFF"
  if (searchOff && !networkOff) return "network"
  if (!searchOff && networkOff) return "search"
  return "mixed"
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function syncCampaigns(companyId: string): Promise<number> {
  const client = new YandexDirectClient(companyId)
  const campaigns = await client.getCampaigns()

  for (const c of campaigns) {
    const values = {
      companyId,
      directId: c.Id,
      name: c.Name,
      campaignType: c.Type,
      placement: placementOf(c),
      state: c.State,
      status: c.Status,
      dailyBudget: c.DailyBudget?.Amount ? c.DailyBudget.Amount / MICRO : null,
      raw: c as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    }
    await db
      .insert(yandexDirectCampaigns)
      .values(values)
      .onConflictDoUpdate({
        target: [yandexDirectCampaigns.companyId, yandexDirectCampaigns.directId],
        set: {
          name: values.name,
          campaignType: values.campaignType,
          placement: values.placement,
          state: values.state,
          status: values.status,
          dailyBudget: values.dailyBudget,
          raw: values.raw,
          updatedAt: values.updatedAt,
        },
      })
  }

  // Кампании, удалённые в Директе, помечаем архивом (не удаляем строки —
  // статистика и журнал агента ссылаются на direct_id).
  const liveIds = campaigns.map(c => c.Id)
  if (liveIds.length > 0) {
    await db
      .update(yandexDirectCampaigns)
      .set({ state: "ARCHIVED", updatedAt: new Date() })
      .where(and(
        eq(yandexDirectCampaigns.companyId, companyId),
        sql`${yandexDirectCampaigns.directId} NOT IN (${sql.join(liveIds.map(id => sql`${id}`), sql`, `)})`,
      ))
  }

  await db
    .update(yandexDirectIntegrations)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(yandexDirectIntegrations.companyId, companyId))

  return campaigns.length
}

export async function syncStats(companyId: string, days: number): Promise<number> {
  const client = new YandexDirectClient(companyId)
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 3600 * 1000)
  const stats = await client.getDailyCampaignStats(isoDate(from), isoDate(to))

  for (const s of stats) {
    await db
      .insert(yandexDirectCampaignStats)
      .values({
        companyId,
        directId: s.campaignId,
        date: s.date,
        impressions: s.impressions,
        clicks: s.clicks,
        cost: s.cost,
        conversions: s.conversions,
      })
      .onConflictDoUpdate({
        target: [yandexDirectCampaignStats.companyId, yandexDirectCampaignStats.directId, yandexDirectCampaignStats.date],
        set: {
          impressions: s.impressions,
          clicks: s.clicks,
          cost: s.cost,
          conversions: s.conversions,
        },
      })
  }
  return stats.length
}
