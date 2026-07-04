// Сводка для страницы /marketing/yandex-direct: статус интеграции,
// кампании из локального зеркала, статистика за период, рекомендации агента.

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import {
  yandexDirectIntegrations,
  yandexDirectCampaigns,
  yandexDirectCampaignStats,
} from "@/lib/db/schema"
import { and, desc, eq, gte } from "drizzle-orm"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { getAgentSettings, listRecentActions } from "@/lib/yandex-direct/agent"
import { isoDate } from "@/lib/yandex-direct/sync"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const daysParam = Number(new URL(req.url).searchParams.get("days"))
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 14

    const [integration] = await db
      .select()
      .from(yandexDirectIntegrations)
      .where(eq(yandexDirectIntegrations.companyId, user.companyId))
      .limit(1)

    if (!integration || !integration.isActive) {
      return apiSuccess({
        connected: false,
        configured: Boolean(process.env.YANDEX_DIRECT_CLIENT_ID && process.env.YANDEX_DIRECT_CLIENT_SECRET),
      })
    }

    const campaigns = await db
      .select()
      .from(yandexDirectCampaigns)
      .where(eq(yandexDirectCampaigns.companyId, user.companyId))
      .orderBy(desc(yandexDirectCampaigns.updatedAt))

    const since = isoDate(new Date(Date.now() - days * 24 * 3600 * 1000))
    const stats = await db
      .select()
      .from(yandexDirectCampaignStats)
      .where(and(
        eq(yandexDirectCampaignStats.companyId, user.companyId),
        gte(yandexDirectCampaignStats.date, since),
      ))

    const actions = await listRecentActions(user.companyId, 50)

    return apiSuccess({
      connected: true,
      yandexLogin: integration.yandexLogin,
      lastSyncedAt: integration.lastSyncedAt,
      settings: getAgentSettings(integration),
      campaigns,
      stats,
      actions,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/overview]", err)
    return apiError("Internal server error", 500)
  }
}
