// Trial-режим SalesRadar (см. app/(modules)/ai-rop/onboarding/*).
//
// Идея Юрия: клиент подключает канал(ы) на 3–7 дней, SalesRadar на его РЕАЛЬНЫХ
// данных показывает, что он упускает (сделки мимо CRM, точки внимания) — это
// и есть главный аргумент продажи, не презентация.
//
// Состояние триала хранится в rop_settings.settings.trial (jsonb, per-company,
// см. lib/ai-rop/settings.ts::RopSettingsJson — там есть index signature
// [key: string]: unknown, отдельного поля не заводим, чтобы не трогать чужой
// файл вне зоны этой задачи). startedAt/endsAt — ISO-строки.
//
// Лениво стартует: getTrialState() при первом обращении создаёт запись, если
// её ещё нет — отдельного экрана «активировать триал» не требуется, компания
// просто заходит в /ai-rop/onboarding и триал начинается.
import { eq, and, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  landingLeads,
  ropChannelConnectors,
  ropCounterparties,
  ropDealThreads,
  ropMessages,
} from "@/lib/db/schema"
import { getRopSettings, getSettingsJson, patchSettingsJson } from "@/lib/ai-rop/settings"
import { getPlatformSetting } from "@/lib/platform/settings"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import { MESSAGE_GUARD_ALERTS_KEY } from "@/lib/messaging/guard-alert"
import { escapeHtml } from "@/lib/tip/bot/telegram"
import { loadAttentionData, type AttentionItem } from "@/lib/ai-rop/attention"

export const DEFAULT_TRIAL_DAYS = 7

export type TrialStatus = "active" | "expired" | "converted"

export interface TrialState {
  startedAt: string
  endsAt: string
  daysTotal: number
  /** Хранимый статус — 'converted' проставляется вручную (после заявки/оплаты), иначе вычисляется по датам. */
  status: TrialStatus
  /** Отметка, что заявка на подключение уже отправлена — не спамим владельца платформы повторно. */
  requestedAt?: string | null
}

function buildTrial(daysTotal: number): TrialState {
  const startedAt = new Date()
  const endsAt = new Date(startedAt.getTime() + daysTotal * 24 * 60 * 60 * 1000)
  return { startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString(), daysTotal, status: "active", requestedAt: null }
}

/** Явно стартовать/перезапустить триал (например, если платформенный админ продлевает вручную). */
export async function startTrial(companyId: string, daysTotal: number = DEFAULT_TRIAL_DAYS): Promise<TrialState> {
  const trial = buildTrial(daysTotal)
  await patchSettingsJson(companyId, { trial } as Record<string, unknown>)
  return trial
}

/** Текущее состояние триала — создаёт при первом обращении (ленивый старт). */
export async function getTrialState(companyId: string): Promise<TrialState> {
  const row = await getRopSettings(companyId)
  const json = getSettingsJson(row) as Record<string, unknown>
  const existing = json.trial as TrialState | undefined
  if (existing?.startedAt && existing?.endsAt) return existing
  return startTrial(companyId, DEFAULT_TRIAL_DAYS)
}

export function computeEffectiveStatus(trial: TrialState): TrialStatus {
  if (trial.status === "converted") return "converted"
  return new Date(trial.endsAt).getTime() > Date.now() ? "active" : "expired"
}

export function daysLeft(trial: TrialState): number {
  const ms = new Date(trial.endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

/** Пометить триал как конвертированный в полноценную подписку (заказ оформлен). */
export async function markTrialConverted(companyId: string): Promise<TrialState> {
  const trial = await getTrialState(companyId)
  const next: TrialState = { ...trial, status: "converted" }
  await patchSettingsJson(companyId, { trial: next } as Record<string, unknown>)
  return next
}

/**
 * Заявка «Оставить заявку на подключение» — фиксируем интерес клиента.
 * Минимальный путь: пишем в существующую платформенную таблицу лидов
 * (landing_leads — interest свободный text(), не enum на уровне БД) +
 * Telegram-алерт владельцу платформы, тот же канал/паттерн, что и
 * app/api/public/landing-lead/route.ts. Идемпотентность на уровне UX —
 * кнопка в баннере блокируется после первой отправки (requestedAt).
 */
export async function submitTrialRequest(companyId: string, opts: { contact?: string; comment?: string } = {}): Promise<void> {
  const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1)
  const companyName = company?.name ?? companyId

  await db.insert(landingLeads).values({
    name: companyName,
    contact: opts.contact?.trim() || "не указан (заявка из личного кабинета)",
    company: companyName,
    interest: "salesradar_trial",
    comment: opts.comment?.trim() || "Заявка на подключение SalesRadar после пробного периода",
    source: "ai-rop/onboarding",
  })

  const trial = await getTrialState(companyId)
  await patchSettingsJson(companyId, { trial: { ...trial, requestedAt: new Date().toISOString() } } as Record<string, unknown>)

  void notifyTrialRequest(companyName).catch((err) => {
    console.warn("[salesradar-trial] telegram notify failed:", err instanceof Error ? err.message : err)
  })
}

async function notifyTrialRequest(companyName: string): Promise<void> {
  const cfg = await getPlatformSetting<{ allToOne?: boolean; chatId?: string }>(MESSAGE_GUARD_ALERTS_KEY)
  const chatId = cfg?.chatId
  if (!chatId) return
  const text = `🎯 <b>Заявка на подключение SalesRadar</b>: ${escapeHtml(companyName)} — просит полноценную платформу после пробного периода.`
  await sendTelegramAlert(chatId, text)
}

// ───────── «Что мы нашли» — сводка для экрана step 3 онбординга ─────────

export interface TrialSummary {
  channelsConnected: number
  messagesRead: number
  dealsFound: number
  dealsNotInCrm: number
  counterpartiesFound: number
  attentionPointsFound: number
  topAttentionItems: AttentionItem[]
}

export async function getTrialSummary(companyId: string): Promise<TrialSummary> {
  const [connectorsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ropChannelConnectors)
    .where(and(eq(ropChannelConnectors.companyId, companyId), eq(ropChannelConnectors.isEnabled, true)))

  const [messagesRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ropMessages)
    .where(eq(ropMessages.companyId, companyId))

  const [dealsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ropDealThreads)
    .where(eq(ropDealThreads.companyId, companyId))

  const [dealsShadowRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ropDealThreads)
    .where(and(eq(ropDealThreads.companyId, companyId), eq(ropDealThreads.kind, "shadow")))

  const [counterpartiesRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ropCounterparties)
    .where(eq(ropCounterparties.companyId, companyId))

  const attention = await loadAttentionData({ tenantId: companyId })
  const topAttentionItems = [...attention.items]
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
      return (b.at ? new Date(b.at).getTime() : 0) - (a.at ? new Date(a.at).getTime() : 0)
    })
    .slice(0, 3)

  return {
    channelsConnected: connectorsRow?.n ?? 0,
    messagesRead: messagesRow?.n ?? 0,
    dealsFound: dealsRow?.n ?? 0,
    dealsNotInCrm: dealsShadowRow?.n ?? 0,
    counterpartiesFound: counterpartiesRow?.n ?? 0,
    attentionPointsFound: attention.total,
    topAttentionItems,
  }
}

/** Есть ли за последние 24 часа новые сообщения — используем как грубый признак «импорт что-то нашёл». */
export async function hasRecentMessages(companyId: string, sinceHours = 24): Promise<boolean> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ropMessages)
    .where(and(eq(ropMessages.companyId, companyId), gte(ropMessages.createdAt, since)))
  return (row?.n ?? 0) > 0
}
