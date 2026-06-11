// AI-агент оптимизации Яндекс.Директа.
//
// runOptimizer(companyId):
//   1. Синк кампаний + дневной статистики (lib/yandex-direct/sync.ts)
//   2. Срез по ключевым фразам за окно анализа (Reports API)
//   3. Claude Sonnet анализирует срез → JSON-рекомендации
//   4. mode='recommend' → пишем proposed-действия (HR применяет кнопкой)
//      mode='autopilot' → безопасные действия применяем сразу (с лимитами
//      из настроек), всё логируем в yandex_direct_agent_actions
//
// applyAction(actionId, userId) — применить рекомендацию через Direct API.

import { db } from "@/lib/db"
import {
  yandexDirectIntegrations,
  yandexDirectCampaigns,
  yandexDirectCampaignStats,
  yandexDirectAgentActions,
  YANDEX_DIRECT_AGENT_DEFAULTS,
  type YandexDirectAgentSettings,
} from "@/lib/db/schema"
import { and, desc, eq, gte } from "drizzle-orm"
import { YandexDirectClient } from "@/lib/yandex-direct/client"
import { syncCampaigns, syncStats, isoDate } from "@/lib/yandex-direct/sync"
import { callClaudeSonnet } from "@/lib/ai/client"

// Действия, которые агент умеет применять сам (через Direct API).
const APPLICABLE_TYPES = new Set([
  "pause_keyword",
  "add_negative_keywords",
  "set_keyword_bid",
  "pause_campaign",
  "set_daily_budget",
])

// Автопилот применяет только то, что легко откатить руками в Директе.
const AUTOPILOT_SAFE_TYPES = new Set(["pause_keyword", "add_negative_keywords", "set_keyword_bid"])

interface AgentRecommendation {
  type: string
  campaignId?: number
  title: string
  description: string
  impact?: "high" | "medium" | "low"
  payload?: Record<string, unknown>
}

const SYSTEM = `Ты — AI-агент ведения рекламы в Яндекс.Директе. Анализируешь статистику
кампаний и ключевых фраз, находишь утечки бюджета и точки роста.

Типы действий (поле type):
- "pause_keyword" — остановить фразу-пожирателя (payload: {keywordIds: [..], keyword: "..."}).
  Только если фраза набрала достаточно кликов и не даёт конверсий / CPA сильно выше цели.
- "add_negative_keywords" — добавить минус-слова кампании (payload: {words: [".."]}).
- "set_keyword_bid" — изменить ставку фразы (payload: {keywordId: N, bidRub: N, keyword: "..."}).
  Понижать у дорогих без конверсий, повышать у конверсионных с малым охватом.
- "pause_campaign" — остановить кампанию (только при явном сливе бюджета).
- "set_daily_budget" — изменить дневной бюджет (payload: {amountRub: N}).
- "insight" — наблюдение/совет без автодействия (улучшить тексты, посадочную, время показов).

Правила:
- НЕ предлагай действий по фразам с кликами меньше порога minClicksForDecision.
- Каждое действие обосновывай цифрами из данных (CPA, CTR, расход).
- Если данных мало или всё работает хорошо — верни 1-2 insight, не выдумывай проблем.
- Ставки меняй плавно (±20-30%), не более maxCpc.
- Все тексты по-русски, кратко и конкретно.

Отвечай ТОЛЬКО валидным JSON-массивом без markdown:
[{"type":"...","campaignId":N,"title":"...","description":"...","impact":"high|medium|low","payload":{...}}]`

function parseJsonArray<T>(text: string): T[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  const start = cleaned.indexOf("[")
  const end = cleaned.lastIndexOf("]")
  if (start === -1 || end === -1) throw new Error("AI вернул не-JSON ответ")
  return JSON.parse(cleaned.slice(start, end + 1)) as T[]
}

export function getAgentSettings(row: { agentSettingsJson?: YandexDirectAgentSettings | null }): YandexDirectAgentSettings {
  return { ...YANDEX_DIRECT_AGENT_DEFAULTS, ...(row.agentSettingsJson ?? {}) }
}

export interface OptimizerResult {
  campaignsSynced: number
  recommendations: number
  autoApplied: number
  skippedReason?: string
}

export async function runOptimizer(companyId: string): Promise<OptimizerResult> {
  const [integration] = await db
    .select()
    .from(yandexDirectIntegrations)
    .where(eq(yandexDirectIntegrations.companyId, companyId))
    .limit(1)
  if (!integration || !integration.isActive) {
    return { campaignsSynced: 0, recommendations: 0, autoApplied: 0, skippedReason: "not_connected" }
  }
  const settings = getAgentSettings(integration)

  // 1-2. Свежие данные
  const campaignsSynced = await syncCampaigns(companyId)
  await syncStats(companyId, settings.analysisPeriodDays)
  if (campaignsSynced === 0) {
    return { campaignsSynced: 0, recommendations: 0, autoApplied: 0, skippedReason: "no_campaigns" }
  }

  const campaigns = await db
    .select()
    .from(yandexDirectCampaigns)
    .where(eq(yandexDirectCampaigns.companyId, companyId))

  const since = isoDate(new Date(Date.now() - settings.analysisPeriodDays * 24 * 3600 * 1000))
  const stats = await db
    .select()
    .from(yandexDirectCampaignStats)
    .where(and(
      eq(yandexDirectCampaignStats.companyId, companyId),
      gte(yandexDirectCampaignStats.date, since),
    ))

  const client = new YandexDirectClient(companyId)
  const kwStats = await client.getKeywordStats(since, isoDate(new Date()))

  // Сводка для AI: кампании + агрегаты + топ фраз по расходу
  const byCampaign = new Map<number, { impressions: number; clicks: number; cost: number; conversions: number }>()
  for (const s of stats) {
    const agg = byCampaign.get(s.directId) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    agg.impressions += s.impressions; agg.clicks += s.clicks; agg.cost += s.cost; agg.conversions += s.conversions
    byCampaign.set(s.directId, agg)
  }

  const activeCampaigns = campaigns.filter(c => c.state !== "ARCHIVED" && c.state !== "ENDED")
  const campaignSummary = activeCampaigns.map(c => {
    const agg = byCampaign.get(c.directId) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    return {
      campaignId: c.directId,
      name: c.name,
      placement: c.placement,
      state: c.state,
      dailyBudgetRub: c.dailyBudget,
      ...agg,
      ctr: agg.impressions ? +(agg.clicks / agg.impressions * 100).toFixed(2) : 0,
      cpcRub: agg.clicks ? +(agg.cost / agg.clicks).toFixed(2) : 0,
      cpaRub: agg.conversions ? +(agg.cost / agg.conversions).toFixed(2) : null,
    }
  })

  const topKeywords = kwStats
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 80)
    .map(k => ({
      campaignId: k.campaignId,
      keywordId: k.keywordId,
      keyword: k.keyword,
      impressions: k.impressions,
      clicks: k.clicks,
      costRub: +k.cost.toFixed(2),
      conversions: k.conversions,
    }))

  const hasTraffic = campaignSummary.some(c => c.clicks > 0)
  if (!hasTraffic) {
    return { campaignsSynced, recommendations: 0, autoApplied: 0, skippedReason: "no_traffic" }
  }

  // 3. AI-анализ
  const prompt = `Период анализа: последние ${settings.analysisPeriodDays} дней (с ${since}).
Настройки агента: ${JSON.stringify({
    targetCpa: settings.targetCpa ?? null,
    maxCpc: settings.maxCpc ?? null,
    dailyBudgetLimit: settings.dailyBudgetLimit ?? null,
    minClicksForDecision: settings.minClicksForDecision,
  })}

Кампании:
${JSON.stringify(campaignSummary)}

Топ ключевых фраз по расходу:
${JSON.stringify(topKeywords)}

Проанализируй и верни список действий/рекомендаций.`

  const raw = await callClaudeSonnet(prompt, SYSTEM, 4000)
  let recs: AgentRecommendation[]
  try {
    recs = parseJsonArray<AgentRecommendation>(raw)
  } catch {
    recs = []
  }
  recs = recs.filter(r => r.title && r.description && r.type).slice(0, 20)

  // Дедуп: не плодить рекомендации, идентичные ещё не разобранным proposed.
  const pending = await db
    .select()
    .from(yandexDirectAgentActions)
    .where(and(
      eq(yandexDirectAgentActions.companyId, companyId),
      eq(yandexDirectAgentActions.status, "proposed"),
    ))
  const pendingKeys = new Set(pending.map(p => `${p.type}|${p.directCampaignId ?? ""}|${JSON.stringify(p.payload ?? {})}`))

  let autoApplied = 0
  let created = 0
  for (const rec of recs) {
    const key = `${rec.type}|${rec.campaignId ?? ""}|${JSON.stringify(rec.payload ?? {})}`
    if (pendingKeys.has(key)) continue

    const canAutoApply =
      settings.mode === "autopilot" &&
      AUTOPILOT_SAFE_TYPES.has(rec.type) &&
      (rec.type !== "pause_keyword" || settings.pausedByAgentEnabled)

    const [action] = await db
      .insert(yandexDirectAgentActions)
      .values({
        companyId,
        directCampaignId: rec.campaignId ?? null,
        type: rec.type,
        title: rec.title.slice(0, 300),
        description: rec.description.slice(0, 2000),
        payload: rec.payload ?? {},
        impact: rec.impact ?? "medium",
        status: "proposed",
        source: canAutoApply ? "autopilot" : "agent",
      })
      .returning()
    created++

    if (canAutoApply) {
      try {
        await executeAction(client, rec.type, rec.campaignId ?? null, rec.payload ?? {}, settings)
        await db
          .update(yandexDirectAgentActions)
          .set({ status: "applied", appliedAt: new Date() })
          .where(eq(yandexDirectAgentActions.id, action.id))
        autoApplied++
      } catch (err) {
        await db
          .update(yandexDirectAgentActions)
          .set({ status: "failed", error: String(err).slice(0, 1000) })
          .where(eq(yandexDirectAgentActions.id, action.id))
      }
    }
  }

  return { campaignsSynced, recommendations: created, autoApplied }
}

async function executeAction(
  client: YandexDirectClient,
  type: string,
  campaignId: number | null,
  payload: Record<string, unknown>,
  settings: YandexDirectAgentSettings,
): Promise<void> {
  switch (type) {
    case "pause_keyword": {
      const ids = (payload.keywordIds as number[] | undefined) ?? (payload.keywordId ? [Number(payload.keywordId)] : [])
      if (!ids.length) throw new Error("Нет keywordIds в payload")
      await client.suspendKeywords(ids.map(Number))
      return
    }
    case "add_negative_keywords": {
      if (!campaignId) throw new Error("Нет campaignId")
      const words = (payload.words as string[] | undefined) ?? []
      if (!words.length) throw new Error("Нет минус-слов в payload")
      await client.addNegativeKeywords(campaignId, words)
      return
    }
    case "set_keyword_bid": {
      const keywordId = Number(payload.keywordId)
      let bidRub = Number(payload.bidRub)
      if (!keywordId || !bidRub || bidRub <= 0) throw new Error("Нет keywordId/bidRub в payload")
      if (settings.maxCpc && bidRub > settings.maxCpc) bidRub = settings.maxCpc
      await client.setKeywordBid(keywordId, bidRub)
      return
    }
    case "pause_campaign": {
      if (!campaignId) throw new Error("Нет campaignId")
      await client.suspendCampaign(campaignId)
      return
    }
    case "set_daily_budget": {
      if (!campaignId) throw new Error("Нет campaignId")
      let amount = Number(payload.amountRub)
      if (!amount || amount <= 0) throw new Error("Нет amountRub в payload")
      if (settings.dailyBudgetLimit && amount > settings.dailyBudgetLimit) amount = settings.dailyBudgetLimit
      await client.setDailyBudget(campaignId, amount)
      return
    }
    default:
      throw new Error(`Действие «${type}» применяется вручную в Директе`)
  }
}

export async function applyAction(companyId: string, actionId: string, userId: string): Promise<void> {
  const [action] = await db
    .select()
    .from(yandexDirectAgentActions)
    .where(and(
      eq(yandexDirectAgentActions.id, actionId),
      eq(yandexDirectAgentActions.companyId, companyId),
    ))
    .limit(1)
  if (!action) throw new Error("Рекомендация не найдена")
  if (action.status !== "proposed") throw new Error("Рекомендация уже обработана")
  if (!APPLICABLE_TYPES.has(action.type)) throw new Error("Это рекомендация-наблюдение, применяется вручную")

  const [integration] = await db
    .select()
    .from(yandexDirectIntegrations)
    .where(eq(yandexDirectIntegrations.companyId, companyId))
    .limit(1)
  const settings = getAgentSettings(integration ?? {})

  const client = new YandexDirectClient(companyId)
  try {
    await executeAction(client, action.type, action.directCampaignId, (action.payload ?? {}) as Record<string, unknown>, settings)
    await db
      .update(yandexDirectAgentActions)
      .set({ status: "applied", appliedBy: userId, appliedAt: new Date() })
      .where(eq(yandexDirectAgentActions.id, actionId))
  } catch (err) {
    await db
      .update(yandexDirectAgentActions)
      .set({ status: "failed", error: String(err).slice(0, 1000) })
      .where(eq(yandexDirectAgentActions.id, actionId))
    throw err
  }
}

export async function dismissAction(companyId: string, actionId: string): Promise<void> {
  const updated = await db
    .update(yandexDirectAgentActions)
    .set({ status: "dismissed" })
    .where(and(
      eq(yandexDirectAgentActions.id, actionId),
      eq(yandexDirectAgentActions.companyId, companyId),
      eq(yandexDirectAgentActions.status, "proposed"),
    ))
    .returning({ id: yandexDirectAgentActions.id })
  if (!updated.length) throw new Error("Рекомендация не найдена или уже обработана")
}

// Компании с активной интеграцией — для cron-обхода.
export async function listCompaniesWithIntegration(): Promise<string[]> {
  const rows = await db
    .select({ companyId: yandexDirectIntegrations.companyId })
    .from(yandexDirectIntegrations)
    .where(eq(yandexDirectIntegrations.isActive, true))
  return rows.map(r => r.companyId)
}

export async function listRecentActions(companyId: string, limit = 50) {
  return db
    .select()
    .from(yandexDirectAgentActions)
    .where(eq(yandexDirectAgentActions.companyId, companyId))
    .orderBy(desc(yandexDirectAgentActions.createdAt))
    .limit(limit)
}
