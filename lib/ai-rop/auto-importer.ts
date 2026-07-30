/**
 * Инкрементальный авто-импорт (порт call-agent lib/auto-importer.ts) — вызывается
 * cron-роутом /api/cron/ai-rop-import (раз в 5 минут, фаза 3, не эта зона) на
 * каждую компанию с подключённым Bitrix. Состояние (последний успешный импорт,
 * метка забора email/чатов) — rop_settings.settings, а не отдельная KV-таблица
 * settings(key) оригинала (её баг — значения делились между тенантами — и был
 * причиной переноса на rop_settings, см. docblock схемы).
 */
import { getRopSettings, getSettingsJson, patchSettingsJson } from "./settings"
import { importCallsFromBitrix, type ImportError, type ImportResult } from "./importer"
import { fetchEmailAndChats, resolveActivitiesSince, type FetchResult } from "./bitrix-activities"
import { toLegacySaveInteractionFn } from "./interaction-source"
import type { BitrixClient } from "./bitrix"

// Перекрываем последние N минут чтобы не пропустить звонки, которые попали в
// Bitrix с задержкой (вебхук от АТС может опаздывать).
const OVERLAP_MIN = 30

// При самом первом запуске — за сколько дней назад начать
const INITIAL_LOOKBACK_DAYS = 7

// При ручном "Запустить сейчас" — игнорируем last_import_at и берём 1 день
const MANUAL_LOOKBACK_DAYS = 1

// Забор email/чатов — не на каждый тик (*/5), а раз в ~10 минут по метке.
const ACTIVITIES_FETCH_INTERVAL_MIN = 10

export async function isAutoImportEnabled(companyId: string): Promise<boolean> {
  const row = await getRopSettings(companyId)
  const v = getSettingsJson(row).autoImportEnabled
  // Если ещё не задано — по умолчанию ВКЛ (как в оригинале).
  return v !== false
}

export async function setAutoImportEnabled(companyId: string, enabled: boolean): Promise<void> {
  await patchSettingsJson(companyId, { autoImportEnabled: enabled })
}

export async function getLastAutoImport(companyId: string): Promise<{ at: string | null }> {
  const row = await getRopSettings(companyId)
  return { at: getSettingsJson(row).lastImportAt ?? null }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface RunAutoImportOpts {
  /** Принудительный режим: игнорировать lastImportAt и взять последние N дней. */
  manual?: boolean
  lookbackDays?: number
}

export interface AutoImportRunResult {
  calls: ImportResult | ImportError | { ok: false; error: "disabled" } | { ok: true; skipped: true }
  activities: FetchResult | null
}

export async function runAutoImport(
  client: BitrixClient,
  companyId: string,
  opts: RunAutoImportOpts = {}
): Promise<AutoImportRunResult> {
  if (!opts.manual && !(await isAutoImportEnabled(companyId))) {
    return { calls: { ok: false, error: "disabled" }, activities: null }
  }

  const settingsRow = await getRopSettings(companyId)
  const json = getSettingsJson(settingsRow)
  const lastAt = json.lastImportAt ?? null

  let fromIso: string
  if (opts.manual) {
    const d = new Date()
    d.setDate(d.getDate() - (opts.lookbackDays ?? MANUAL_LOOKBACK_DAYS))
    fromIso = toDateStr(d)
  } else if (lastAt) {
    const lastDate = new Date(lastAt)
    lastDate.setMinutes(lastDate.getMinutes() - OVERLAP_MIN)
    fromIso = toDateStr(lastDate)
  } else {
    const d = new Date()
    d.setDate(d.getDate() - INITIAL_LOOKBACK_DAYS)
    fromIso = toDateStr(d)
  }

  const toIso = toDateStr(new Date())

  // Строго `>`, не `>=`: toDateStr обрезает до YYYY-MM-DD, поэтому импорт «за
  // сегодня» валиден даже когда from===to.
  if (fromIso > toIso) {
    return { calls: { ok: true, skipped: true }, activities: null }
  }

  console.log(`[ai-rop/auto-import] company=${companyId} ${fromIso} .. ${toIso}${opts.manual ? " (manual)" : ""}`)
  // Тянем включая служебные — иначе общая статистика не сходится с Bitrix.
  const callsResult = await importCallsFromBitrix(client, companyId, {
    fromDate: fromIso,
    toDate: toIso,
    includeServiceCalls: true,
  })

  const now = new Date().toISOString()
  if (callsResult.ok) {
    await patchSettingsJson(companyId, { lastImportAt: now })
    if (callsResult.note) {
      console.warn("[ai-rop/auto-import] MAX_PAGES reached! Some calls may be missing — consider manual backfill.")
    }
  } else {
    console.warn("[ai-rop/auto-import] import failed, not updating lastImportAt to preserve gap for retry")
  }

  // Забор email/чатов — раз в ~10 минут по метке activitiesLastFetchedAt (не на
  // каждый вызов, cron дёргает эту функцию раз в 5 минут).
  let activities: FetchResult | null = null
  const lastActivitiesAt = json.activitiesLastFetchedAt ?? null
  const dueForActivities =
    !lastActivitiesAt || Date.now() - new Date(lastActivitiesAt).getTime() >= ACTIVITIES_FETCH_INTERVAL_MIN * 60_000

  if (dueForActivities) {
    try {
      const since = resolveActivitiesSince(lastActivitiesAt)
      activities = await fetchEmailAndChats(
        client,
        { tenantId: 1, since, limit: 200 }, // tenantId — плейсхолдер числового контракта, см. interaction-source.ts docblock
        toLegacySaveInteractionFn(companyId)
      )
      await patchSettingsJson(companyId, { activitiesLastFetchedAt: new Date().toISOString() })
    } catch (e) {
      console.warn("[ai-rop/auto-import] fetchEmailAndChats failed:", (e as Error).message)
    }
  }

  return { calls: callsResult, activities }
}
