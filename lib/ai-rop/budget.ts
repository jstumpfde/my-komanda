/**
 * §4.4 бюджет-гард — порт call-agent lib/budget.ts. Лимиты живут в
 * rop_settings.settings.budget (JSONB, per-company), учёт — таблица
 * rop_usage_events (Drizzle, миграция 0276 — без ленивого CREATE TABLE
 * оригинала, схема уже есть).
 *
 * Поведение (без изменений от оригинала):
 *  - перед каждым LLM/ASR вызовом checkBudget(companyId, kind);
 *  - action='stop' и лимит превышен → throw BudgetExceededError (пайплайн
 *    помечает звонок budget_exceeded/failed);
 *  - action='notify_only' и превышен → не бросает, просто allowed:false;
 *  - после вызова recordUsage(...) пишет строку в rop_usage_events.
 */
import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropUsageEvents } from "@/lib/db/schema"
import { getRopSettings, getSettingsJson, patchSettingsJson } from "./settings"
import type { RopUsageKind } from "./types"

export type BudgetAction = "stop" | "notify_only"

export class BudgetExceededError extends Error {
  constructor(public kind: RopUsageKind, public limit: number, public used: number) {
    super(`Бюджет AI-РОП исчерпан для ${kind}: использовано ${used}, лимит ${limit}`)
    this.name = "BudgetExceededError"
  }
}

export interface RopBudgetSettings {
  maxAnthropicTokens: number | null
  maxOpenaiSeconds: number | null
  maxOpenaiChatTokens: number | null
  maxYandexSttSeconds: number | null
  action: BudgetAction
}

export interface UsageSummary {
  anthropicTokens: number
  openaiSeconds: number
  openaiChatTokens: number
  yandexSttSeconds: number
  periodStart: string // YYYY-MM-01 (UTC)
}

const DEFAULT_BUDGET: RopBudgetSettings = {
  maxAnthropicTokens: null,
  maxOpenaiSeconds: null,
  maxOpenaiChatTokens: null,
  maxYandexSttSeconds: null,
  action: "stop",
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isNaN(n) ? null : n
}

/** Прочитать бюджетные лимиты компании (rop_settings.settings.budget). */
export async function getCompanyBudget(companyId: string): Promise<RopBudgetSettings> {
  const row = await getRopSettings(companyId)
  const b = getSettingsJson(row).budget ?? {}
  return {
    maxAnthropicTokens: numOrNull(b.maxAnthropicTokens),
    maxOpenaiSeconds: numOrNull(b.maxOpenaiSeconds),
    maxOpenaiChatTokens: numOrNull(b.maxOpenaiChatTokens),
    maxYandexSttSeconds: numOrNull(b.maxYandexSttSeconds),
    action: b.action === "notify_only" ? "notify_only" : "stop",
  }
}

/** Обновить бюджетные лимиты (merge в rop_settings.settings.budget). */
export async function setCompanyBudget(
  companyId: string,
  patch: Partial<RopBudgetSettings>
): Promise<RopBudgetSettings> {
  const current = await getCompanyBudget(companyId)
  const next: RopBudgetSettings = { ...DEFAULT_BUDGET, ...current, ...patch }
  await patchSettingsJson(companyId, { budget: next })
  return next
}

/** Накопленный расход компании за текущий календарный месяц (UTC). */
export async function getMonthlyUsage(companyId: string): Promise<UsageSummary> {
  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const rows = await db
    .select({
      kind: ropUsageEvents.kind,
      total: sql<number>`COALESCE(SUM(${ropUsageEvents.units}), 0)::int`,
    })
    .from(ropUsageEvents)
    .where(and(eq(ropUsageEvents.tenantId, companyId), gte(ropUsageEvents.createdAt, periodStart)))
    .groupBy(ropUsageEvents.kind)

  const map: Record<string, number> = {}
  for (const r of rows) map[r.kind] = Number(r.total ?? 0)

  return {
    anthropicTokens: map["anthropic_tokens"] ?? 0,
    openaiSeconds: map["openai_seconds"] ?? 0,
    openaiChatTokens: map["openai_chat_tokens"] ?? 0,
    yandexSttSeconds: map["yandex_stt_seconds"] ?? 0,
    periodStart: periodStart.toISOString().slice(0, 10),
  }
}

function pickLimit(b: RopBudgetSettings, kind: RopUsageKind): number | null {
  switch (kind) {
    case "anthropic_tokens": return b.maxAnthropicTokens
    case "openai_seconds": return b.maxOpenaiSeconds
    case "openai_chat_tokens": return b.maxOpenaiChatTokens
    case "yandex_stt_seconds": return b.maxYandexSttSeconds
    default: return null
  }
}

function pickUsage(u: UsageSummary, kind: RopUsageKind): number {
  switch (kind) {
    case "anthropic_tokens": return u.anthropicTokens
    case "openai_seconds": return u.openaiSeconds
    case "openai_chat_tokens": return u.openaiChatTokens
    case "yandex_stt_seconds": return u.yandexSttSeconds
    default: return 0
  }
}

/**
 * Проверка ПЕРЕД дорогим вызовом. limit==null/<=0 → лимит не задан, всегда allowed.
 * action='stop' и превышен → бросает BudgetExceededError. 'notify_only' → allowed:false, reason.
 */
export async function checkBudget(
  companyId: string,
  kind: RopUsageKind
): Promise<{ allowed: boolean; reason?: string }> {
  const [budget, usage] = await Promise.all([getCompanyBudget(companyId), getMonthlyUsage(companyId)])
  const limit = pickLimit(budget, kind)
  if (limit == null || limit <= 0) return { allowed: true }

  const used = pickUsage(usage, kind)
  if (used >= limit) {
    if (budget.action === "stop") throw new BudgetExceededError(kind, limit, used)
    return { allowed: false, reason: `${kind}: использовано ${used} / лимит ${limit}` }
  }
  return { allowed: true }
}

/** Записать расход в rop_usage_events. Не бросает — сбой учёта не должен ронять пайплайн. */
export async function recordUsage(
  companyId: string,
  kind: RopUsageKind,
  units: number,
  callId?: string | null
): Promise<void> {
  if (!units || units <= 0) return
  try {
    await db.insert(ropUsageEvents).values({
      tenantId: companyId,
      kind,
      units: Math.round(units),
      callId: callId ?? null,
    })
  } catch (e) {
    console.warn(`[ai-rop/budget] recordUsage failed (${kind}, ${units}):`, (e as Error).message)
  }
}
