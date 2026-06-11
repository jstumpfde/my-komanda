// Клиент API Яндекс.Директ v5 (JSON). По образцу lib/hh/client.ts:
// токен из БД per-company, авто-refresh, guard INTEGRATIONS_DISABLED.
//
// Деньги: API принимает/отдаёт суммы в микроединицах (₽ × 1 000 000) —
// конвертация только здесь, наружу всегда рубли.
// YANDEX_DIRECT_SANDBOX=true переключает на песочницу Директа.

import { db } from "@/lib/db"
import { yandexDirectIntegrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { refreshTokens } from "@/lib/yandex-direct/oauth"

const API_BASE = () =>
  process.env.YANDEX_DIRECT_SANDBOX === "true"
    ? "https://api-sandbox.direct.yandex.com/json/v5"
    : "https://api.direct.yandex.com/json/v5"

export const MICRO = 1_000_000

export interface DirectCampaign {
  Id: number
  Name: string
  Type: string
  State: string
  Status: string
  DailyBudget?: { Amount: number; Mode: string } | null
  TextCampaign?: {
    BiddingStrategy?: {
      Search?: { BiddingStrategyType?: string }
      Network?: { BiddingStrategyType?: string }
    }
  } | null
}

export interface DirectKeywordStat {
  campaignId: number
  keywordId: number
  keyword: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
}

export interface DirectDailyStat {
  campaignId: number
  date: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
}

export class YandexDirectClient {
  constructor(private companyId: string) {}

  private async getToken(): Promise<string> {
    const rows = await db
      .select()
      .from(yandexDirectIntegrations)
      .where(eq(yandexDirectIntegrations.companyId, this.companyId))
      .limit(1)
    const row = rows[0]
    if (!row || !row.isActive) throw new Error("Яндекс.Директ не подключён")

    const expiresAt = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : null
    if (expiresAt && expiresAt < Date.now() + 60_000 && row.refreshToken) {
      const tokens = await refreshTokens(row.refreshToken)
      await db
        .update(yandexDirectIntegrations)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? row.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(yandexDirectIntegrations.companyId, this.companyId))
      return tokens.access_token
    }
    return row.accessToken
  }

  // Универсальный вызов сервиса v5: call("campaigns", "get", {...})
  async call<T = unknown>(service: string, method: string, params: unknown): Promise<T> {
    const url = `${API_BASE()}/${service}`
    if (process.env.INTEGRATIONS_DISABLED === "true") {
      console.log("[INTEGRATIONS_DISABLED] Yandex.Direct call skipped:", url, method)
      throw new Error("Яндекс.Директ отключён на стейджинге")
    }

    const token = await this.getToken()
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Language": "ru",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ method, params }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      throw new Error(`Direct API HTTP ${res.status} (${service}.${method})`)
    }
    if (data.error) {
      const e = data.error
      throw new Error(`Direct API error ${e.error_code}: ${e.error_string} — ${e.error_detail}`)
    }
    return data.result as T
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────

  async getCampaigns(): Promise<DirectCampaign[]> {
    const result = await this.call<{ Campaigns?: DirectCampaign[] }>("campaigns", "get", {
      SelectionCriteria: {},
      FieldNames: ["Id", "Name", "Type", "State", "Status", "DailyBudget"],
      TextCampaignFieldNames: ["BiddingStrategy"],
    })
    return result.Campaigns ?? []
  }

  async suspendCampaign(campaignId: number): Promise<void> {
    await this.call("campaigns", "suspend", { SelectionCriteria: { Ids: [campaignId] } })
  }

  async resumeCampaign(campaignId: number): Promise<void> {
    await this.call("campaigns", "resume", { SelectionCriteria: { Ids: [campaignId] } })
  }

  async setDailyBudget(campaignId: number, amountRub: number): Promise<void> {
    await this.call("campaigns", "update", {
      Campaigns: [{
        Id: campaignId,
        DailyBudget: { Amount: Math.round(amountRub * MICRO), Mode: "STANDARD" },
      }],
    })
  }

  async addNegativeKeywords(campaignId: number, words: string[]): Promise<void> {
    // NegativeKeywords в update ЗАМЕНЯЕТ список — поэтому читаем текущие и мерджим.
    const result = await this.call<{ Campaigns?: Array<{ Id: number; NegativeKeywords?: { Items?: string[] } | null }> }>(
      "campaigns", "get",
      { SelectionCriteria: { Ids: [campaignId] }, FieldNames: ["Id", "NegativeKeywords"] },
    )
    const current = result.Campaigns?.[0]?.NegativeKeywords?.Items ?? []
    const merged = Array.from(new Set([...current, ...words.map(w => w.trim()).filter(Boolean)]))
    await this.call("campaigns", "update", {
      Campaigns: [{ Id: campaignId, NegativeKeywords: { Items: merged } }],
    })
  }

  // ── Keywords / Bids ────────────────────────────────────────────────────────

  async suspendKeywords(keywordIds: number[]): Promise<void> {
    await this.call("keywords", "suspend", { SelectionCriteria: { Ids: keywordIds } })
  }

  async setKeywordBid(keywordId: number, bidRub: number): Promise<void> {
    await this.call("bids", "set", {
      Bids: [{ KeywordId: keywordId, Bid: Math.round(bidRub * MICRO) }],
    })
  }

  // ── Создание кампании (поиск или РСЯ) ──────────────────────────────────────

  async addTextCampaign(opts: {
    name: string
    placement: "search" | "network"
    weeklyBudgetRub: number
    negativeKeywords?: string[]
  }): Promise<number> {
    const weeklyMicros = Math.round(opts.weeklyBudgetRub * MICRO)
    const strategy =
      opts.placement === "search"
        ? {
            Search:  { BiddingStrategyType: "WB_MAXIMUM_CLICKS", WbMaximumClicks: { WeeklySpendLimit: weeklyMicros } },
            Network: { BiddingStrategyType: "SERVING_OFF" },
          }
        : {
            Search:  { BiddingStrategyType: "SERVING_OFF" },
            Network: { BiddingStrategyType: "WB_MAXIMUM_CLICKS", WbMaximumClicks: { WeeklySpendLimit: weeklyMicros } },
          }

    const result = await this.call<{ AddResults: Array<{ Id?: number; Errors?: Array<{ Message: string; Details?: string }> }> }>(
      "campaigns", "add",
      {
        Campaigns: [{
          Name: opts.name,
          TextCampaign: { BiddingStrategy: strategy },
          NegativeKeywords: opts.negativeKeywords?.length ? { Items: opts.negativeKeywords } : undefined,
        }],
      },
    )
    const r = result.AddResults[0]
    if (!r?.Id) throw new Error(`Не удалось создать кампанию: ${r?.Errors?.map(e => `${e.Message} ${e.Details ?? ""}`).join("; ") ?? "unknown"}`)
    return r.Id
  }

  async addAdGroup(campaignId: number, name: string, regionIds: number[]): Promise<number> {
    const result = await this.call<{ AddResults: Array<{ Id?: number; Errors?: Array<{ Message: string; Details?: string }> }> }>(
      "adgroups", "add",
      { AdGroups: [{ Name: name, CampaignId: campaignId, RegionIds: regionIds }] },
    )
    const r = result.AddResults[0]
    if (!r?.Id) throw new Error(`Не удалось создать группу: ${r?.Errors?.map(e => `${e.Message} ${e.Details ?? ""}`).join("; ") ?? "unknown"}`)
    return r.Id
  }

  async addTextAds(adGroupId: number, ads: Array<{ title: string; title2?: string; text: string; href: string }>): Promise<number[]> {
    const result = await this.call<{ AddResults: Array<{ Id?: number; Errors?: Array<{ Message: string; Details?: string }> }> }>(
      "ads", "add",
      {
        Ads: ads.map(ad => ({
          AdGroupId: adGroupId,
          TextAd: {
            // Лимиты Директа: Title ≤56, Title2 ≤30, Text ≤81 символов.
            Title: ad.title.slice(0, 56),
            Title2: ad.title2 ? ad.title2.slice(0, 30) : undefined,
            Text: ad.text.slice(0, 81),
            Href: ad.href,
            Mobile: "NO",
          },
        })),
      },
    )
    return result.AddResults.filter(r => r.Id).map(r => r.Id as number)
  }

  async addKeywords(adGroupId: number, keywords: string[]): Promise<number[]> {
    const result = await this.call<{ AddResults: Array<{ Id?: number; Errors?: Array<{ Message: string; Details?: string }> }> }>(
      "keywords", "add",
      { Keywords: keywords.map(k => ({ Keyword: k.slice(0, 4096), AdGroupId: adGroupId })) },
    )
    return result.AddResults.filter(r => r.Id).map(r => r.Id as number)
  }

  // Отправить объявления на модерацию (после add они в статусе DRAFT).
  async moderateAds(adIds: number[]): Promise<void> {
    if (!adIds.length) return
    await this.call("ads", "moderate", { SelectionCriteria: { Ids: adIds } })
  }

  // ── Reports API (статистика) ───────────────────────────────────────────────
  // Отчёты строятся офлайн: 201/202 = «готовится», повторяем с паузой.

  private async fetchReport(body: unknown, attempt = 0): Promise<string> {
    const url = `${API_BASE()}/reports`
    if (process.env.INTEGRATIONS_DISABLED === "true") {
      throw new Error("Яндекс.Директ отключён на стейджинге")
    }
    const token = await this.getToken()
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Language": "ru",
        "Content-Type": "application/json; charset=utf-8",
        processingMode: "auto",
        returnMoneyInMicros: "false",
        skipReportHeader: "true",
        skipReportSummary: "true",
      },
      body: JSON.stringify(body),
    })

    if (res.status === 200) return res.text()
    if ((res.status === 201 || res.status === 202) && attempt < 6) {
      const retryIn = Number(res.headers.get("retryIn") ?? "10")
      await new Promise(r => setTimeout(r, Math.min(retryIn, 30) * 1000))
      return this.fetchReport(body, attempt + 1)
    }
    const text = await res.text().catch(() => "")
    throw new Error(`Direct Reports HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  private static parseTsv(tsv: string): string[][] {
    return tsv
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.split("\t"))
  }

  async getDailyCampaignStats(dateFrom: string, dateTo: string): Promise<DirectDailyStat[]> {
    const tsv = await this.fetchReport({
      params: {
        SelectionCriteria: { DateFrom: dateFrom, DateTo: dateTo },
        FieldNames: ["CampaignId", "Date", "Impressions", "Clicks", "Cost", "Conversions"],
        ReportName: `c24-daily-${dateFrom}-${dateTo}-${Date.now()}`,
        ReportType: "CAMPAIGN_PERFORMANCE_REPORT",
        DateRangeType: "CUSTOM_DATE",
        Format: "TSV",
        IncludeVAT: "YES",
        IncludeDiscount: "NO",
      },
    })
    return YandexDirectClient.parseTsv(tsv).map(cols => ({
      campaignId: Number(cols[0]),
      date: cols[1],
      impressions: Number(cols[2]) || 0,
      clicks: Number(cols[3]) || 0,
      cost: Number(cols[4]) || 0,
      conversions: cols[5] === "--" ? 0 : Number(cols[5]) || 0,
    })).filter(r => Number.isFinite(r.campaignId) && r.campaignId > 0)
  }

  async getKeywordStats(dateFrom: string, dateTo: string): Promise<DirectKeywordStat[]> {
    const tsv = await this.fetchReport({
      params: {
        SelectionCriteria: { DateFrom: dateFrom, DateTo: dateTo },
        FieldNames: ["CampaignId", "CriterionId", "Criterion", "Impressions", "Clicks", "Cost", "Conversions"],
        ReportName: `c24-kw-${dateFrom}-${dateTo}-${Date.now()}`,
        ReportType: "CRITERIA_PERFORMANCE_REPORT",
        DateRangeType: "CUSTOM_DATE",
        Format: "TSV",
        IncludeVAT: "YES",
        IncludeDiscount: "NO",
      },
    })
    return YandexDirectClient.parseTsv(tsv).map(cols => ({
      campaignId: Number(cols[0]),
      keywordId: Number(cols[1]),
      keyword: cols[2] ?? "",
      impressions: Number(cols[3]) || 0,
      clicks: Number(cols[4]) || 0,
      cost: Number(cols[5]) || 0,
      conversions: cols[6] === "--" ? 0 : Number(cols[6]) || 0,
    })).filter(r => Number.isFinite(r.keywordId) && r.keywordId > 0)
  }
}
