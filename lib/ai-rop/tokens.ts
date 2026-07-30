/**
 * Токены AI-РОП — единая валюта баланса компании (порт call-agent lib/tokens.ts).
 * Баланс = SUM(delta) по rop_token_ledger. Начисления: тариф (plan_grant),
 * пополнение (topup), бонус промокода (promo_bonus), ручная правка (manual/adjust).
 * Списание: 1 токен за разобранный звонок (reason='call', delta=-1), идемпотентно
 * по (tenantId, reason='call', refCallId).
 *
 * Настройки биллинга (enforce/lowThreshold/periodEnd/notifyEnabled/planId/autoRenew) —
 * БЫЛО tenants.settings.token_billing, СТАЛО rop_settings.settings.tokenBilling
 * (per-company, через lib/ai-rop/settings.ts). planId/тарифы (rop_plans) и
 * промокоды (rop_promos) теперь uuid (не bigint, как в оригинале).
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropTokenLedger, ropPlans, ropPromos, type RopTokenLedger } from "@/lib/db/schema"
import { getRopSettings, getSettingsJson, patchSettingsJson } from "./settings"

export type TokenReason = "plan_grant" | "topup" | "promo_bonus" | "call" | "manual" | "adjust"

/** Текущий баланс компании. */
export async function getBalance(companyId: string): Promise<number> {
  const [r] = await db
    .select({ bal: sql<number>`COALESCE(SUM(${ropTokenLedger.delta}), 0)::int` })
    .from(ropTokenLedger)
    .where(eq(ropTokenLedger.tenantId, companyId))
  return Number(r?.bal ?? 0)
}

/** Начисление/списание. delta>0 — начисление, delta<0 — списание. */
export async function addTokens(
  companyId: string,
  delta: number,
  reason: TokenReason,
  opts: { note?: string; refCallId?: string } = {}
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return
  await db.insert(ropTokenLedger).values({
    tenantId: companyId,
    delta: Math.trunc(delta),
    reason,
    refCallId: opts.refCallId ?? null,
    note: opts.note ?? null,
  })
}

/** Списать N токенов за звонок (по умолчанию 1). Идемпотентно по refCallId — ретрай не дублирует. */
export async function spendForCall(companyId: string, callId: string, amount = 1): Promise<void> {
  const [already] = await db
    .select({ id: ropTokenLedger.id })
    .from(ropTokenLedger)
    .where(
      and(
        eq(ropTokenLedger.tenantId, companyId),
        eq(ropTokenLedger.reason, "call"),
        eq(ropTokenLedger.refCallId, callId)
      )
    )
    .limit(1)
  if (already) return
  await addTokens(companyId, -Math.abs(amount), "call", { refCallId: callId, note: `Разбор звонка #${callId}` })
}

/** История операций за период (или последние N). */
export async function getLedger(
  companyId: string,
  opts: { from?: Date; to?: Date; limit?: number } = {}
): Promise<RopTokenLedger[]> {
  const limit = Math.min(opts.limit ?? 200, 1000)
  const clauses = [eq(ropTokenLedger.tenantId, companyId)]
  if (opts.from) clauses.push(gte(ropTokenLedger.createdAt, opts.from))
  if (opts.to) clauses.push(lte(ropTokenLedger.createdAt, opts.to))
  return db
    .select()
    .from(ropTokenLedger)
    .where(and(...clauses))
    .orderBy(desc(ropTokenLedger.createdAt))
    .limit(limit)
}

/** Сводка за период: начислено/списано по причинам + итог. */
export async function getPeriodSummary(
  companyId: string,
  from?: Date,
  to?: Date
): Promise<{ granted: number; topup: number; promo: number; spent: number; net: number; byReason: Record<string, number> }> {
  const clauses = [eq(ropTokenLedger.tenantId, companyId)]
  if (from) clauses.push(gte(ropTokenLedger.createdAt, from))
  if (to) clauses.push(lte(ropTokenLedger.createdAt, to))

  const rows = await db
    .select({ reason: ropTokenLedger.reason, s: sql<number>`COALESCE(SUM(${ropTokenLedger.delta}), 0)::int` })
    .from(ropTokenLedger)
    .where(and(...clauses))
    .groupBy(ropTokenLedger.reason)

  const byReason: Record<string, number> = {}
  for (const r of rows) byReason[r.reason] = Number(r.s)
  const granted = byReason.plan_grant ?? 0
  const topup = byReason.topup ?? 0
  const promo = byReason.promo_bonus ?? 0
  const spent = -(byReason.call ?? 0) // списания отрицательны — показываем как положительное «потрачено»
  const net = Object.values(byReason).reduce((a, b) => a + b, 0)
  return { granted, topup, promo, spent, net, byReason }
}

/** Применить промокод: начислить bonusTokens, если промо активен, не истёк и не исчерпан. */
export async function applyPromoTokens(
  companyId: string,
  code: string
): Promise<{ ok: boolean; bonus?: number; error?: string }> {
  const [p] = await db
    .select()
    .from(ropPromos)
    .where(sql`lower(${ropPromos.code}) = lower(${code.trim()})`)
    .limit(1)
  if (!p) return { ok: false, error: "Промокод не найден" }
  if (!p.active) return { ok: false, error: "Промокод неактивен" }
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return { ok: false, error: "Промокод истёк" }
  if (p.maxUses != null && (p.usesCount ?? 0) >= p.maxUses) return { ok: false, error: "Лимит использований исчерпан" }
  const bonus = Number(p.bonusTokens ?? 0)
  if (bonus <= 0) return { ok: false, error: "У промокода нет бонус-токенов" }

  await addTokens(companyId, bonus, "promo_bonus", { note: `Промокод ${code.trim()}` })
  await db.update(ropPromos).set({ usesCount: sql`${ropPromos.usesCount} + 1` }).where(eq(ropPromos.id, p.id))
  return { ok: true, bonus }
}

// ─────────── Настройки биллинга (enforcement) + статус ───────────

export interface RopTokenBillingSettings {
  /** Жёсткий блок обработки при нулевом/отрицательном балансе (по умолчанию ВЫКЛ). */
  enforce: boolean
  /** Порог «низкого баланса» для предупреждения (по умолчанию 50). */
  lowThreshold: number
  /** Дата конца оплаченного периода (YYYY-MM-DD) — для напоминаний. null = не задан. */
  periodEnd: string | null
  /** Слать клиенту уведомления о балансе/конце периода. */
  notifyEnabled: boolean
  /** Явный список email получателей; пусто → авто (директора компании). */
  notifyEmails: string[]
  /** Тариф (rop_plans.id, uuid), привязанный к компании — для автопродления/начислений. */
  planId: string | null
  /** Автопродление ВКЛ: крон начисляет токены тарифа по истечении periodEnd и сдвигает дату на месяц. */
  autoRenew: boolean
}

/** За сколько дней до конца периода напоминать (решение Юрия, ca-паритет). */
export const REMINDER_DAYS_BEFORE = [7, 5, 3, 2, 1]

const DEFAULT_TOKEN_SETTINGS: RopTokenBillingSettings = {
  enforce: false,
  lowThreshold: 50,
  periodEnd: null,
  notifyEnabled: false,
  notifyEmails: [],
  planId: null,
  autoRenew: false,
}

/** Настройки токен-биллинга компании (rop_settings.settings.tokenBilling). */
export async function getTokenSettings(companyId: string): Promise<RopTokenBillingSettings> {
  const row = await getRopSettings(companyId)
  const tb = getSettingsJson(row).tokenBilling ?? {}
  return {
    enforce: tb.enforce === true,
    lowThreshold: Number.isFinite(Number(tb.lowThreshold)) ? Number(tb.lowThreshold) : DEFAULT_TOKEN_SETTINGS.lowThreshold,
    periodEnd: typeof tb.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tb.periodEnd) ? tb.periodEnd : null,
    notifyEnabled: tb.notifyEnabled === true,
    notifyEmails: Array.isArray(tb.notifyEmails) ? tb.notifyEmails.filter((x): x is string => typeof x === "string") : [],
    planId: typeof tb.planId === "string" && tb.planId ? tb.planId : null,
    autoRenew: tb.autoRenew === true,
  }
}

/** Обновить настройки токен-биллинга (merge в rop_settings.settings.tokenBilling). */
export async function setTokenSettings(
  companyId: string,
  patch: Partial<RopTokenBillingSettings>
): Promise<RopTokenBillingSettings> {
  const cur = await getTokenSettings(companyId)
  const next: RopTokenBillingSettings = {
    enforce: patch.enforce != null ? !!patch.enforce : cur.enforce,
    lowThreshold:
      patch.lowThreshold != null && Number.isFinite(Number(patch.lowThreshold))
        ? Math.max(0, Math.trunc(Number(patch.lowThreshold)))
        : cur.lowThreshold,
    periodEnd:
      patch.periodEnd !== undefined
        ? (typeof patch.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(patch.periodEnd) ? patch.periodEnd : null)
        : cur.periodEnd,
    notifyEnabled: patch.notifyEnabled != null ? !!patch.notifyEnabled : cur.notifyEnabled,
    notifyEmails:
      patch.notifyEmails !== undefined
        ? (Array.isArray(patch.notifyEmails) ? patch.notifyEmails.filter((x) => typeof x === "string" && x.includes("@")).slice(0, 20) : [])
        : cur.notifyEmails,
    planId: patch.planId !== undefined ? (patch.planId || null) : cur.planId,
    autoRenew: patch.autoRenew != null ? !!patch.autoRenew : cur.autoRenew,
  }
  await patchSettingsJson(companyId, { tokenBilling: next })
  return next
}

export interface BillingStatus {
  balance: number
  enforce: boolean
  lowThreshold: number
  /** Баланс на исходе (≤ порога) — показать предупреждение. */
  low: boolean
  /** Обработка заблокирована (enforce включён И баланс ≤ 0). */
  blocked: boolean
  periodEnd: string | null
  daysUntilPeriodEnd: number | null
}

/** Полный статус биллинга компании (гард pipeline.processCall + баннер портала). */
export async function getBillingStatus(companyId: string): Promise<BillingStatus> {
  const [balance, settings] = await Promise.all([getBalance(companyId), getTokenSettings(companyId)])
  let daysUntilPeriodEnd: number | null = null
  if (settings.periodEnd) {
    const today = new Date().toISOString().slice(0, 10)
    const a = new Date(today + "T00:00:00Z").getTime()
    const b = new Date(settings.periodEnd + "T00:00:00Z").getTime()
    daysUntilPeriodEnd = Math.round((b - a) / 86400000)
  }
  return {
    balance,
    enforce: settings.enforce,
    lowThreshold: settings.lowThreshold,
    low: balance <= settings.lowThreshold,
    blocked: settings.enforce && balance <= 0,
    periodEnd: settings.periodEnd,
    daysUntilPeriodEnd,
  }
}

// ─────────── Тарифы: список и начисление токенов тарифа ───────────

/** Активные тарифы (для выбора при начислении токенов). */
export async function listPlans() {
  return db.select().from(ropPlans).where(eq(ropPlans.active, true)).orderBy(ropPlans.priceMonthly)
}

/** Начислить компании токены тарифа (tokensIncluded). Причина в журнале — plan_grant. */
export async function grantPlanTokens(
  companyId: string,
  planId: string,
  noteOverride?: string
): Promise<{ ok: boolean; granted?: number; error?: string }> {
  const [plan] = await db.select().from(ropPlans).where(eq(ropPlans.id, planId)).limit(1)
  if (!plan) return { ok: false, error: "Тариф не найден" }
  const amount = Number(plan.tokensIncluded ?? 0)
  if (amount <= 0) return { ok: false, error: `У тарифа «${plan.name}» не задано число токенов` }
  await addTokens(companyId, amount, "plan_grant", { note: noteOverride ?? `Токены тарифа «${plan.name}»` })
  return { ok: true, granted: amount }
}

// ─────────── Автопродление по расписанию ───────────

/** Прибавляет месяц к дате ISO (YYYY-MM-DD), аккуратно с концом месяца. */
function addOneMonthIso(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z")
  const day = d.getUTCDate()
  d.setUTCDate(1) // избегаем переполнения месяца при setUTCMonth
  d.setUTCMonth(d.getUTCMonth() + 1)
  const lastDayOfTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return d.toISOString().slice(0, 10)
}

export interface AutoRenewResult {
  renewed: Array<{ companyId: string; planId: string; granted: number; newPeriodEnd: string }>
  skipped: number
  errors: Array<{ companyId: string; error: string }>
}

/**
 * Ежедневный проход по компаниям с autoRenew=true (rop_settings строки): у кого
 * periodEnd истёк — начислить токены тарифа и сдвинуть periodEnd на месяц от
 * СТАРОЙ даты (не «сегодня») — день месяца продления остаётся стабильным даже
 * при опоздании крона. Идемпотентность — маркер note='[auto-renew:{periodEnd}]'.
 */
export async function runAutoRenewals(): Promise<AutoRenewResult> {
  const result: AutoRenewResult = { renewed: [], skipped: 0, errors: [] }
  const today = new Date().toISOString().slice(0, 10)

  // Компании с включённым модулем AI-РОП — это все, у кого есть строка rop_settings
  // (создаётся при первом обращении, см. settings.ts::getRopSettings).
  const rows = await db.query.ropSettings.findMany({ columns: { companyId: true } })

  for (const { companyId } of rows) {
    let settings: RopTokenBillingSettings
    try {
      settings = await getTokenSettings(companyId)
    } catch (e) {
      result.errors.push({ companyId, error: `Не удалось прочитать настройки: ${(e as Error).message}` })
      continue
    }
    if (!settings.autoRenew) continue

    if (!settings.periodEnd) {
      result.errors.push({ companyId, error: "Автопродление включено, но дата периода (periodEnd) не задана" })
      continue
    }
    if (settings.periodEnd > today) {
      result.skipped++
      continue
    }
    if (!settings.planId) {
      result.errors.push({ companyId, error: "Автопродление включено, но тариф не выбран" })
      continue
    }

    const marker = `[auto-renew:${settings.periodEnd}]`
    try {
      const [already] = await db
        .select({ id: ropTokenLedger.id })
        .from(ropTokenLedger)
        .where(
          and(
            eq(ropTokenLedger.tenantId, companyId),
            eq(ropTokenLedger.reason, "plan_grant"),
            sql`${ropTokenLedger.note} LIKE ${"%" + marker + "%"}`
          )
        )
        .limit(1)

      let granted = 0
      if (!already) {
        const grantRes = await grantPlanTokens(companyId, settings.planId, `Автопродление тарифа ${marker}`)
        if (!grantRes.ok) {
          result.errors.push({ companyId, error: grantRes.error || "Начисление тарифа не удалось" })
          continue
        }
        granted = grantRes.granted ?? 0
      }
      const newPeriodEnd = addOneMonthIso(settings.periodEnd)
      await setTokenSettings(companyId, { periodEnd: newPeriodEnd })
      result.renewed.push({ companyId, planId: settings.planId, granted, newPeriodEnd })
    } catch (e) {
      result.errors.push({ companyId, error: (e as Error).message })
    }
  }

  return result
}
