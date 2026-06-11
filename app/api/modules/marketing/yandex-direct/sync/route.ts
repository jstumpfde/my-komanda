// Ручной синк кампаний и статистики из Директа (кнопка «Обновить»).

import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { yandexDirectIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getAgentSettings } from "@/lib/yandex-direct/agent"
import { syncCampaigns, syncStats } from "@/lib/yandex-direct/sync"

export async function POST() {
  try {
    const user = await requireCompany()
    const [integration] = await db
      .select()
      .from(yandexDirectIntegrations)
      .where(eq(yandexDirectIntegrations.companyId, user.companyId))
      .limit(1)
    if (!integration || !integration.isActive) return apiError("Яндекс.Директ не подключён", 400)

    const settings = getAgentSettings(integration)
    const campaigns = await syncCampaigns(user.companyId)
    const statRows = campaigns > 0 ? await syncStats(user.companyId, settings.analysisPeriodDays) : 0

    return apiSuccess({ campaigns, statRows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/sync]", err)
    return apiError(err instanceof Error ? err.message : "Ошибка синхронизации", 500)
  }
}
