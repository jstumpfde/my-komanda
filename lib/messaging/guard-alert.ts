// Option 1: Telegram-алерт при срабатывании стража исходящих (Юрий 27.06).
// Конфиг PER-COMPANY (у каждого клиента свой бот; решает владелец компании):
//   • companies.hiringDefaultsJson.messageGuardAlert.enabled (тумблер, дефолт OFF)
//     → алерт идёт в СОБСТВЕННЫЙ Telegram компании (sendToCompanyChannel:
//       companies.telegramBotToken/telegramChatId).
//   • Платформенная опция (необяз.): message_guard_alerts = { allToOne, chatId }
//     → если allToOne, ВСЕ алерты со всего сайта летят в один бот (мониторинг владельца платформы),
//       минуя per-company.
// Кэш конфигов (60с) + троттл per-company (1 / 5 мин). Fire-and-forget, не роняет отправку.

import { getPlatformSetting } from "@/lib/platform/settings"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const MESSAGE_GUARD_ALERTS_KEY = "message_guard_alerts"

interface PlatformCfg { allToOne?: boolean; chatId?: string }

const THROTTLE_MS = 5 * 60_000
const TTL_MS = 60_000

const lastByCompany = new Map<string, number>()
let platCache: { cfg: PlatformCfg; at: number } | null = null
const companyCache = new Map<string, { enabled: boolean; at: number }>()

// Алертим только на серьёзное: сырые переменные или пустое после чистки.
export function isSerious(issues: string[]): boolean {
  return issues.some(i => i.startsWith("unresolved_placeholders") || i === "empty_after_clean")
}

// Пройдена ли пауза троттла (чистая, для теста).
export function withinThrottle(now: number, lastAt: number): boolean {
  return now - lastAt < THROTTLE_MS
}

async function getPlatformCfg(): Promise<PlatformCfg> {
  const now = Date.now()
  if (platCache && now - platCache.at < TTL_MS) return platCache.cfg
  let cfg: PlatformCfg = {}
  try { cfg = (await getPlatformSetting<PlatformCfg>(MESSAGE_GUARD_ALERTS_KEY)) ?? {} } catch { /* выкл */ }
  platCache = { cfg, at: now }
  return cfg
}

async function isCompanyAlertEnabled(companyId: string): Promise<boolean> {
  const now = Date.now()
  const c = companyCache.get(companyId)
  if (c && now - c.at < TTL_MS) return c.enabled
  let enabled = false
  try {
    const [row] = await db.select({ defaults: companies.hiringDefaultsJson })
      .from(companies).where(eq(companies.id, companyId)).limit(1)
    enabled = (row?.defaults as { messageGuardAlert?: { enabled?: boolean } } | null)?.messageGuardAlert?.enabled === true
  } catch { /* выкл */ }
  companyCache.set(companyId, { enabled, at: now })
  return enabled
}

/** Fire-and-forget: алерт о проблеме стража (per-company или в один бот). */
export async function maybeAlertGuardIssue(
  issues: string[],
  ctx: { companyId?: string; source?: string; negotiationId?: string } = {},
): Promise<void> {
  try {
    if (!issues.length || !isSerious(issues) || !ctx.companyId) return
    const now = Date.now()
    if (withinThrottle(now, lastByCompany.get(ctx.companyId) ?? 0)) return

    const text =
      `⚠️ <b>Страж сообщений</b>\n` +
      `Источник: ${ctx.source ?? "hh"}${ctx.negotiationId ? " · " + ctx.negotiationId : ""}\n` +
      `Проблемы: ${issues.join("; ")}`

    const plat = await getPlatformCfg()
    if (plat.allToOne && plat.chatId) {
      lastByCompany.set(ctx.companyId, now)
      void sendTelegramAlert(plat.chatId, text) // один бот на всю платформу
      return
    }

    if (await isCompanyAlertEnabled(ctx.companyId)) {
      lastByCompany.set(ctx.companyId, now)
      void sendToCompanyChannel(ctx.companyId, text) // собственный бот компании
    }
  } catch (err) {
    console.warn("[guard-alert] failed:", err instanceof Error ? err.message : err)
  }
}
