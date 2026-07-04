// Лимит AI-токенов/мес для модуля «База знаний» — платформенный дефолт +
// переопределение per-company, с hard-stop перед AI-вызовами.
//
// Раньше DEFAULT_MONTHLY_LIMIT был захардкожен в app/api/ai/usage/route.ts
// и НИЧЕГО не блокировал при превышении (комментарий в коде: "no tariff
// wiring yet"). Теперь:
//   - платформенный дефолт хранится в platform_settings (как trash_retention,
//     см. lib/platform/settings.ts) — можно поменять без деплоя;
//   - компания может переопределить свой лимит в
//     companies.hiring_defaults_json.aiMonthlyTokenLimit (тот же паттерн,
//     что и остальные company-level настройки — см. CompanyHiringDefaults);
//   - checkAiTokenLimit() — hard-stop перед AI-вызовом модуля знаний.

import { eq, and, or, like, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiUsageLog, companies } from "@/lib/db/schema"
import { getPlatformSetting, setPlatformSetting } from "@/lib/platform/settings"

export const AI_MONTHLY_TOKEN_LIMIT_KEY = "ai_monthly_token_limit"
// Прежнее хардкод-значение — теперь платформенный дефолт, если в
// platform_settings ключ не задан.
export const AI_MONTHLY_TOKEN_LIMIT_DEFAULT = 2_000_000

export async function getPlatformAiMonthlyTokenLimit(): Promise<number> {
  try {
    const v = await getPlatformSetting<number>(AI_MONTHLY_TOKEN_LIMIT_KEY)
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : AI_MONTHLY_TOKEN_LIMIT_DEFAULT
  } catch {
    return AI_MONTHLY_TOKEN_LIMIT_DEFAULT
  }
}

export async function setPlatformAiMonthlyTokenLimit(limit: number): Promise<void> {
  await setPlatformSetting(AI_MONTHLY_TOKEN_LIMIT_KEY, Math.max(1, Math.floor(limit)))
}

/** Эффективный лимит компании: override компании, иначе платформенный дефолт. */
export async function getEffectiveAiMonthlyTokenLimit(companyId: string): Promise<number> {
  const platformDefault = await getPlatformAiMonthlyTokenLimit()
  try {
    const [row] = await db
      .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    const override = row?.hiringDefaultsJson?.aiMonthlyTokenLimit
    if (typeof override === "number" && Number.isFinite(override) && override > 0) {
      return Math.floor(override)
    }
  } catch (err) {
    console.error("[token-limits] failed to read company override", err)
  }
  return platformDefault
}

/**
 * Токены за месяц ТОЛЬКО по действиям модуля знаний/обучения — action
 * "knowledge_*" (генерация статей, AI-поиск, публичный/Telegram чат-бот
 * знаний) и "course_*" (AI-курсы — тот же бэкенд знаний/обучения, отдельный
 * префикс action). aiUsageLog — общий журнал по ВСЕМ AI-фичам платформы
 * (чат-бот кандидатов, скоринг и т.д.), поэтому без фильтра по action лимит
 * модуля знаний считал бы чужой расход (guard-находка 05.07).
 */
export async function getMonthTokensUsed(companyId: string): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${aiUsageLog.inputTokens} + ${aiUsageLog.outputTokens}), 0)::int`,
    })
    .from(aiUsageLog)
    .where(and(
      eq(aiUsageLog.tenantId, companyId),
      sql`${aiUsageLog.createdAt} >= ${startOfMonth}`,
      or(like(aiUsageLog.action, "knowledge_%"), like(aiUsageLog.action, "course_%")),
    ))
  return row?.total ?? 0
}

export interface TokenLimitCheck {
  allowed: boolean
  used: number
  limit: number
  message?: string
}

/**
 * Hard-stop перед AI-вызовом модуля знаний. Вызывать ДО обращения к
 * Claude/OpenAI — если allowed=false, вызов делать нельзя, вернуть
 * message пользователю.
 */
export async function checkAiTokenLimit(companyId: string): Promise<TokenLimitCheck> {
  const [limit, used] = await Promise.all([
    getEffectiveAiMonthlyTokenLimit(companyId),
    getMonthTokensUsed(companyId),
  ])
  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      message: `Лимит AI-токенов на этот месяц исчерпан (${used.toLocaleString("ru-RU")} из ${limit.toLocaleString("ru-RU")}). Обратитесь к директору компании — лимит можно увеличить в настройках, или дождитесь начала следующего месяца.`,
    }
  }
  return { allowed: true, used, limit }
}

/** Fire-and-forget логирование расхода токенов — не должно ронять основной запрос. */
export async function logAiUsage(params: {
  tenantId: string
  userId?: string | null
  action: string
  inputTokens?: number
  outputTokens?: number
  model?: string | null
}): Promise<void> {
  try {
    await db.insert(aiUsageLog).values({
      tenantId: params.tenantId,
      userId: params.userId || null,
      action: params.action,
      inputTokens: params.inputTokens ?? 0,
      outputTokens: params.outputTokens ?? 0,
      model: params.model || null,
    })
  } catch (err) {
    console.error("[token-limits] logAiUsage failed", err)
  }
}
