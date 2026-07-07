// «Сторож найма» — запись находок в admin_alerts. Идемпотентно по dedup_key:
// пока открытый алерт с тем же ключом существует, повторные прогоны крона
// НЕ создают дубли (см. partial unique index admin_alerts_open_dedup_idx,
// drizzle/0260_admin_alerts.sql). Select — быстрый путь «уже есть, скип»,
// но от гонки двух перекрывающихся прогонов защищает НЕ он, а сама вставка:
// INSERT ... ON CONFLICT DO NOTHING + RETURNING. Проигравший гонку получает
// пустой returning → created=false → Telegram не дублируется и крон-ран
// не падает необработанным unique-violation.

import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminAlerts } from "@/lib/db/schema"
import type { WatchdogIssue } from "./classify"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import { getPlatformSetting } from "@/lib/platform/settings"
import { MESSAGE_GUARD_ALERTS_KEY } from "@/lib/messaging/guard-alert"

/**
 * Заводит алерт, если открытого с таким dedup_key ещё нет. Возвращает
 * created=true ТОЛЬКО если вставка реально произошла в этом вызове —
 * решение «слать ли Telegram» принимается по этому флагу (см.
 * shouldNotifyTelegram в ./classify.ts), чтобы при перекрытии двух прогонов
 * уведомление ушло ровно один раз.
 */
export async function upsertAlert(issue: WatchdogIssue): Promise<{ created: boolean }> {
  // Быстрый путь: открытый алерт уже есть — не вставляем (и не шлём Telegram).
  const [existing] = await db
    .select({ id: adminAlerts.id })
    .from(adminAlerts)
    .where(and(eq(adminAlerts.dedupKey, issue.dedupKey), eq(adminAlerts.status, "open")))
    .limit(1)
  if (existing) return { created: false }

  // Гонка двух перекрывающихся прогонов: между select выше и insert ниже
  // параллельный прогон мог вставить тот же dedup_key. ON CONFLICT DO NOTHING
  // (без target — подавляет любой конфликт вставки, для этой таблицы
  // единственный источник конфликтов и есть partial unique index
  // admin_alerts_open_dedup_idx; drizzle не умеет надёжно указать partial
  // индекс target-ом) + RETURNING: пустой результат = вставка не произошла,
  // алерт уже существует → created=false, Telegram не дублируем.
  const inserted = await db
    .insert(adminAlerts)
    .values({
      companyId: issue.companyId ?? null,
      severity:  issue.severity,
      source:    "hiring_watchdog",
      dedupKey:  issue.dedupKey,
      title:     issue.title,
      message:   issue.message,
      actionUrl: issue.actionUrl ?? null,
      status:    "open",
    })
    .onConflictDoNothing()
    .returning({ id: adminAlerts.id })

  return { created: inserted.length > 0 }
}

/**
 * Авто-resolve: среди открытых алертов источника hiring_watchdog находит те,
 * чей dedup_key НЕ встретился в текущем прогоне (значит, проблема исчезла),
 * и переводит их в resolved с auto_resolved=true. currentDedupKeys — ключи
 * ВСЕХ находок текущего прогона (включая info — они всё равно не остаются
 * "open" долго, см. classifyOldPublicationCleanup с уникальным суффиксом).
 *
 * scopeDedupKeyPrefixes ограничивает авто-resolve только теми категориями,
 * которые реально проверялись в этом прогоне (иначе, например, частичный
 * прогон без hh-компаний авто-закрыл бы все hh_token_dead алерты).
 */
export async function autoResolveStale(
  currentDedupKeys: string[],
  scopeDedupKeyPrefixes: string[],
): Promise<{ resolved: number }> {
  const openRows = await db
    .select({ id: adminAlerts.id, dedupKey: adminAlerts.dedupKey })
    .from(adminAlerts)
    .where(and(eq(adminAlerts.source, "hiring_watchdog"), eq(adminAlerts.status, "open")))

  const staleIds = openRows
    .filter((r) => scopeDedupKeyPrefixes.some((p) => r.dedupKey.startsWith(p)))
    .filter((r) => !currentDedupKeys.includes(r.dedupKey))
    .map((r) => r.id)

  if (staleIds.length === 0) return { resolved: 0 }

  await db
    .update(adminAlerts)
    .set({ status: "resolved", resolvedAt: new Date(), autoResolved: true })
    .where(inArray(adminAlerts.id, staleIds))

  return { resolved: staleIds.length }
}

/** CRITICAL → Telegram немедленно (per-company или платформенный канал). Warning/info НЕ шлём. */
export async function notifyIfCritical(issue: WatchdogIssue): Promise<void> {
  if (issue.severity !== "critical") return
  const text = `🐛 <b>Сторож найма</b>\n${issue.title}\n${issue.message}`
  try {
    if (issue.companyId) {
      await sendToCompanyChannel(issue.companyId, text)
    } else {
      // Платформенный алерт — тот же канал, что уже используют per-company
      // guard-алерты для "одного бота на всю платформу" (platform_settings.
      // message_guard_alerts.chatId), чтобы не заводить ещё одну настройку.
      const cfg = await getPlatformSetting<{ chatId?: string }>(MESSAGE_GUARD_ALERTS_KEY)
      if (cfg?.chatId) {
        await sendTelegramAlert(cfg.chatId, text)
      }
    }
  } catch (err) {
    console.warn("[hiring-watchdog] telegram notify failed:", err instanceof Error ? err.message : err)
  }
}
