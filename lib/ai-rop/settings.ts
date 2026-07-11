/**
 * Per-company настройки модуля AI-РОП (таблица rop_settings, миграция 0276).
 *
 * Заменяет ДВА источника из call-agent:
 *  - tenants.settings (jsonb) — бюджет/токен-биллинг/прочее свободное;
 *  - глобальную таблицу settings(key TEXT PRIMARY KEY) — известный баг (значения
 *    по одному key делились МЕЖДУ тенантами, т.к. не было tenant_id в PK).
 * Здесь PK = companyId, явные колонки для Bitrix/dry-run/discrepancy-настроек
 * (см. lib/db/schema.ts) + settings(jsonb) для остального (бюджет, токен-биллинг,
 * STT-ключи, метки last-fetch импортёров) — типизированный доступ через
 * getSettingsJson()/patchSettingsJson() ниже, чтобы budget.ts/tokens.ts/importer.ts
 * не трогали jsonb напрямую.
 *
 * ВАЖНО (п.5 плана): lib/ai-rop/* НЕ читают Bitrix/STT-конфиг из env — только
 * из rop_settings через toBitrixConfig()/toSttConfig() ниже.
 */
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSettings, type RopSettings, type NewRopSettings } from "@/lib/db/schema"
import type { RopBitrixConfig, RopSttConfig } from "./types"
import type { RopBudgetSettings } from "./budget"
import type { RopTokenBillingSettings } from "./tokens"

/** Типизированная форма jsonb-колонки rop_settings.settings. */
export interface RopSettingsJson {
  budget?: Partial<RopBudgetSettings>
  tokenBilling?: Partial<RopTokenBillingSettings>
  stt?: {
    yandexApiKey?: string | null
    yandexFolderId?: string | null
    allowForeignSttFallback?: boolean
  }
  /** Порог активности автопродления/автоимпорта — метка последнего успешного прогона (ISO). */
  lastImportAt?: string | null
  autoImportEnabled?: boolean
  /** Метка last-fetch для email/чатов (bitrix-activities.fetchEmailAndChats since=). */
  activitiesLastFetchedAt?: string | null
  /** Порог «контактного» звонка, сек (см. dashboard-data.ts::getContactThresholdSeconds). Дефолт 15. */
  contactThresholdSeconds?: number
  /** Срок хранения аудиозаписей, дней (cron ai-rop-process::runTtlCleanup удаляет только файл, не строку). Дефолт 30. */
  recordingsRetentionDays?: number
  /** Цель weekly challenge (см. gamification.ts::getWeeklyChallenge). Дефолт 50. */
  weeklyDoneGoal?: number
  /** Per-tenant таксономия категорий возражений (см. objection-clusters.ts::getTaxonomy). Пусто/нет = дефолт платформы. */
  objectionTaxonomy?: Array<{ name: string; def: string }>
  /** Статус AI/STT-провайдера — см. provider-health.ts (RopProviderHealthStatus). Хранится
   *  здесь ТОЛЬКО если решили держать per-company; см. provider-health.ts docblock — по факту
   *  выбран платформенный уровень (platformSettings), поле оставлено про запас/на будущее. */
  providerHealth?: unknown
  [key: string]: unknown
}

/** Дефолты новой строки — безопасные (dry-run включён и для CRM, и для сообщений). */
const NEW_ROW_DEFAULTS = { dryRunCrm: true, dryRunMessages: true, settings: {} as RopSettingsJson }

/**
 * Прочитать настройки компании. Если строки ещё нет — создаёт её с дефолтами
 * (dry-run ON) и возвращает. Идемпотентно при гонке (onConflictDoNothing +
 * повторное чтение).
 */
export async function getRopSettings(companyId: string): Promise<RopSettings> {
  const [row] = await db.select().from(ropSettings).where(eq(ropSettings.companyId, companyId)).limit(1)
  if (row) return row

  const [created] = await db
    .insert(ropSettings)
    .values({ companyId, ...NEW_ROW_DEFAULTS })
    .onConflictDoNothing({ target: ropSettings.companyId })
    .returning()
  if (created) return created

  // Гонка: параллельный запрос успел вставить строку между select и insert.
  const [row2] = await db.select().from(ropSettings).where(eq(ropSettings.companyId, companyId)).limit(1)
  if (!row2) throw new Error(`rop_settings: не удалось создать/прочитать строку для companyId=${companyId}`)
  return row2
}

/** Обновить явные колонки (Bitrix/dry-run/discrepancy/analysisModel/glossary). Строка гарантированно существует. */
export async function updateRopSettings(companyId: string, patch: Partial<NewRopSettings>): Promise<RopSettings> {
  await getRopSettings(companyId)
  const [updated] = await db
    .update(ropSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(ropSettings.companyId, companyId))
    .returning()
  return updated
}

/** Типизированный доступ к jsonb-колонке settings. */
export function getSettingsJson(row: RopSettings): RopSettingsJson {
  return (row.settings as RopSettingsJson) ?? {}
}

/** Точечный merge-патч jsonb settings (не трогает явные колонки). */
export async function patchSettingsJson(companyId: string, patch: Partial<RopSettingsJson>): Promise<RopSettings> {
  const row = await getRopSettings(companyId)
  const next: RopSettingsJson = { ...getSettingsJson(row), ...patch }
  return updateRopSettings(companyId, { settings: next })
}

/** Bitrix-конфиг для createBitrixClient() — null, если webhook ещё не подключён. */
export function toBitrixConfig(row: RopSettings): RopBitrixConfig | null {
  if (!row.bitrixWebhookUrl?.trim()) return null
  return {
    webhookUrl: row.bitrixWebhookUrl,
    inboundToken: row.bitrixInboundToken,
    dryRunCrm: row.dryRunCrm,
    dryRunMessages: row.dryRunMessages,
  }
}

/** STT-конфиг (Yandex/foreign-fallback) — берётся из settings.stt, дефолт allowForeignSttFallback=false (152-ФЗ). */
export function toSttConfig(row: RopSettings): RopSttConfig {
  const stt = getSettingsJson(row).stt ?? {}
  return {
    yandexApiKey: stt.yandexApiKey ?? null,
    yandexFolderId: stt.yandexFolderId ?? null,
    allowForeignSttFallback: stt.allowForeignSttFallback === true,
  }
}
