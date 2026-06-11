// Настройки AI-агента (режим, целевой CPA, лимиты). Меняет только директор.
// GET — текущие настройки; PUT — частичное обновление; DELETE — отключить интеграцию.

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { yandexDirectIntegrations, YANDEX_DIRECT_AGENT_DEFAULTS, type YandexDirectAgentSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { apiError, apiSuccess, requireCompany, requireDirector } from "@/lib/api-helpers"
import { getAgentSettings } from "@/lib/yandex-direct/agent"

export async function GET() {
  try {
    const user = await requireCompany()
    const [integration] = await db
      .select()
      .from(yandexDirectIntegrations)
      .where(eq(yandexDirectIntegrations.companyId, user.companyId))
      .limit(1)
    if (!integration) return apiSuccess({ settings: YANDEX_DIRECT_AGENT_DEFAULTS, connected: false })
    return apiSuccess({ settings: getAgentSettings(integration), connected: integration.isActive })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const [integration] = await db
      .select()
      .from(yandexDirectIntegrations)
      .where(eq(yandexDirectIntegrations.companyId, user.companyId))
      .limit(1)
    if (!integration) return apiError("Яндекс.Директ не подключён", 400)

    const body = await req.json()
    const current = getAgentSettings(integration)

    const next: YandexDirectAgentSettings = {
      ...current,
      mode: body.mode === "autopilot" ? "autopilot" : body.mode === "recommend" ? "recommend" : current.mode,
      targetCpa: body.targetCpa !== undefined ? (Number(body.targetCpa) > 0 ? Number(body.targetCpa) : undefined) : current.targetCpa,
      maxCpc: body.maxCpc !== undefined ? (Number(body.maxCpc) > 0 ? Number(body.maxCpc) : undefined) : current.maxCpc,
      dailyBudgetLimit: body.dailyBudgetLimit !== undefined
        ? (Number(body.dailyBudgetLimit) > 0 ? Number(body.dailyBudgetLimit) : undefined)
        : current.dailyBudgetLimit,
      minClicksForDecision: Math.max(5, Math.min(500, Number(body.minClicksForDecision) || current.minClicksForDecision)),
      analysisPeriodDays: Math.max(3, Math.min(90, Number(body.analysisPeriodDays) || current.analysisPeriodDays)),
      pausedByAgentEnabled: typeof body.pausedByAgentEnabled === "boolean" ? body.pausedByAgentEnabled : current.pausedByAgentEnabled,
    }

    await db
      .update(yandexDirectIntegrations)
      .set({ agentSettingsJson: next, updatedAt: new Date() })
      .where(eq(yandexDirectIntegrations.companyId, user.companyId))

    return apiSuccess({ settings: next })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[yandex-direct/settings]", err)
    return apiError("Не удалось сохранить настройки", 500)
  }
}

export async function DELETE() {
  try {
    const user = await requireDirector()
    await db
      .update(yandexDirectIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(yandexDirectIntegrations.companyId, user.companyId))
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Не удалось отключить интеграцию", 500)
  }
}
