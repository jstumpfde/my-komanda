/**
 * Общие типы модуля AI-РОП (порт продукта call-agent, см.
 * docs/architecture/AI-ROP-MODULE-PLAN-2026-07.md).
 *
 * ВАЖНО: конфиг (Bitrix, STT) передаётся параметром в каждую функцию lib/ai-rop/*,
 * НЕ читается из env внутри библиотек (п.5 плана) — так модуль остаётся
 * per-company настраиваемым (rop_settings), а не завязанным на один глобальный
 * Bitrix-портал, как было в call-agent.
 *
 * БД-зависимые операции (учёт расхода, дедуп CRM-записи, статус провайдера)
 * оформлены как опциональные колбэки — реальная реализация подключается в
 * фазе 2b (lib/ai-rop/{budget,crm-log,provider-health,...}). Здесь только
 * контракты, чтобы «чистые» файлы фазы 2a не импортировали lib/db/drizzle.
 */

// ──────────────────────────────────────────────────────────────
// Bitrix24 — конфигурация подключения (per-company, rop_settings)

/** Конфигурация подключения к Bitrix24 конкретной компании. */
export interface RopBitrixConfig {
  /** Входящий webhook URL (нормализуется до хвостового "/" клиентом). */
  webhookUrl: string;
  /** Токен входящего вебхука для проверки подписи запросов (опционально). */
  inboundToken?: string | null;
  /** DRY_RUN для записи в CRM (комментарии в Timeline / DESCRIPTION активности). Дефолт — true (безопасно). */
  dryRunCrm: boolean;
  /** DRY_RUN для отправки сообщений/отчётов в Bitrix IM. Дефолт — true (безопасно). */
  dryRunMessages: boolean;
}

// ──────────────────────────────────────────────────────────────
// STT — конфигурация распознавания речи (per-company, rop_settings)

export interface RopSttConfig {
  /** API-ключ Yandex SpeechKit (основной канал, 152-ФЗ — эндпоинт в РФ). */
  yandexApiKey?: string | null;
  /** Folder ID каталога в Yandex Cloud (для части сценариев авторизации). */
  yandexFolderId?: string | null;
  /**
   * Разрешение на fallback-транскрипцию через зарубежный OpenAI Whisper,
   * если Yandex недоступен. Дефолт — false (152-ФЗ, трансграничная передача ПДн).
   */
  allowForeignSttFallback: boolean;
}

// ──────────────────────────────────────────────────────────────
// Взаимодействие (звонок/чат/email/встреча) — статусы и типы

export type CallStatus =
  | "pending"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "syncing"
  | "done"
  | "failed"
  | "no_recording" // запись звонка отсутствует в Битриксе (не наша ошибка)
  | "budget_exceeded" // бюджет-гард: лимит токенов/секунд на компанию исчерпан за период
  | "skipped_inbound"; // триаж: входящее text-only от третьей стороны (спам/чужое КП), менеджер не участвовал — полный анализ не запускался

/**
 * Кастомная ошибка для случаев, когда у звонка нет файла записи. Пайплайн
 * (фаза 2b) ловит её отдельно и помечает звонок как no_recording (не failed),
 * чтобы такие звонки не считались техническими сбоями и периодически
 * перепроверялись (запись может подгрузиться в Bitrix с задержкой).
 */
export class NoRecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRecordingError";
  }
}

/** Единая сущность взаимодействия (таблица rop_calls) — тип и канал. */
export type InteractionType = "call" | "chat" | "email" | "meeting";

export type InteractionChannel =
  | "bitrix_telephony"
  | "openlines"
  | "whatsapp"
  | "telegram"
  | "email_imap"
  | "manual"
  | "zoom"
  | "yandex_telemost"
  | "dictaphone"
  | "other";

/**
 * Нормализованная запись для вставки в rop_calls — общий контракт адаптеров
 * источников (Bitrix-звонки, Bitrix-активности/чаты, ручная загрузка и т.п.).
 * Сохранение в БД (идемпотентно по channel+externalId) — колбэк, подключается
 * в фазе 2b (lib/ai-rop/interaction-source.ts).
 */
export interface NormalizedInteraction {
  /** Идентификатор в источнике (для идемпотентности, напр. bitrix activity ID). */
  externalId: string;

  tenantId: number;
  type: InteractionType;
  channel: InteractionChannel;
  direction?: "in" | "out" | null;

  managerId?: string | null;
  managerName?: string | null;

  clientPhone?: string | null;
  clientName?: string | null;

  bitrixDealId?: string | null;
  bitrixLeadId?: string | null;
  bitrixContactId?: string | null;
  bitrixActivityId?: string | null;

  startedAt?: string | null; // ISO timestamp
  durationSec?: number; // 0 для chat/email

  recordingUrl?: string | null;
  contentText?: string | null;

  /** Стартовый статус. По умолчанию 'pending' (запустить обработку). */
  initialStatus?: CallStatus;
}

/**
 * Сохранить нормализованную запись — реализация (idempotent upsert в rop_calls)
 * подключается в фазе 2b. Возвращает callId если создал, null если пропустил (дубль).
 */
export type SaveInteractionFn = (n: NormalizedInteraction) => Promise<number | null>;

// ──────────────────────────────────────────────────────────────
// Чек-листы / скрипты (шаблоны звонка)

export interface ChecklistItem {
  id: string;
  title: string;
  weight: number; // 1..5
  description?: string;
  block?: string; // блок-категория (например «Установление контакта», «Презентация продукта»)
}

export interface ChecklistItemScore {
  id: string;
  title: string;
  score: number; // 0..1
  notes: string;
}

export interface DialogueTurn {
  speaker: "manager" | "client" | "unknown";
  text: string;
  start?: number;
  end?: number;
}

// ──────────────────────────────────────────────────────────────
// CRM-write — запись анализа звонка в Bitrix (комментарий/DESCRIPTION)

export type CrmAction = "comment" | "task" | "activity_update";
export type CrmMode = "dry" | "live";
export type CrmStatus = "queued" | "sent" | "failed" | "skipped_dry";

/** Одна строка журнала CRM-write (rop_crm_write_log) — записывается колбэком logWrite. */
export interface CrmWriteLogEntry {
  tenantId: number;
  callId: number;
  action: CrmAction;
  entityType: string | null; // 'deal' / 'lead' / 'contact' / 'activity'
  entityId: string | null;
  mode: CrmMode;
  status: CrmStatus;
  payload: unknown; // что было сформировано (для DRY превью)
  result?: unknown; // ответ Bitrix (live) или ошибка
}

/**
 * Уникальный ключ для идемпотентности live-отправки: один звонок + одно
 * действие + одна CRM-сущность = одна запись 'live'. Dry-run может
 * повторяться много раз — дедуп применяется только к mode='live'.
 */
export function makeIdempotencyKey(
  callId: number,
  action: CrmAction,
  entityType: string | null,
  entityId: string | null
): string {
  return `${callId}:${action}:${entityType ?? "_"}:${entityId ?? "_"}`;
}

// ──────────────────────────────────────────────────────────────
// Учёт расхода / бюджет-гард (rop_usage_events, rop_settings)

export type RopUsageKind =
  | "anthropic_tokens"
  | "openai_seconds"
  | "openai_chat_tokens"
  | "yandex_stt_seconds";

/**
 * Колбэки учёта расхода/бюджета. Реализация (запись в rop_usage_events,
 * чтение лимитов из rop_settings) подключается в фазе 2b — здесь только
 * контракт, чтобы transcribe.ts/transcribe-yandex.ts оставались без БД.
 * Не переданы — просто не считаем (звонок обрабатывается без бюджет-гарда).
 */
export interface RopUsageHooks {
  recordUsage?: (kind: RopUsageKind, units: number, callId?: number) => Promise<void>;
  /** Бросает исключение (например BudgetExceededError из фазы 2b), если лимит исчерпан и действие = 'stop'. */
  checkBudget?: (kind: RopUsageKind) => Promise<{ allowed: boolean; reason?: string }>;
}

// ──────────────────────────────────────────────────────────────
// Здоровье AI/STT-провайдера (баннер «провайдер недоступен» на дашборде)

export interface RopProviderHealthStatus {
  status: "ok" | "quota" | "auth" | "network";
  provider: string;
  message: string;
  detectedAt: string; // ISO 8601
}

export interface RopProviderProbeResult {
  ok: boolean;
  kind: "ok" | "quota" | "auth" | "network";
  httpStatus?: number;
  message?: string;
}

/**
 * Колбэки статуса провайдера. Реализация (дешёвый probe-запрос, запись
 * статуса в rop_settings, алерт в Telegram) подключается в фазе 2b
 * (lib/ai-rop/provider-health.ts) — здесь только контракт.
 */
export interface RopProviderHealthHooks {
  probeOpenAiHealth?: () => Promise<RopProviderProbeResult>;
  setProviderHealth?: (h: RopProviderHealthStatus) => Promise<void>;
  clearProviderHealthIfDegraded?: () => Promise<void>;
}

/**
 * Перманентная (НЕ временная) ошибка провайдера — пайплайн (фаза 2b) ловит
 * её отдельно и помечает звонок failed с явным текстом, не гоняя auto-retry
 * по кругу (текст намеренно не содержит подстрок из retryable-паттернов).
 */
export class ProviderQuotaError extends Error {
  /** Какой провайдер (пока только "openai"). */
  provider: string;
  /** Человекочитаемая причина: "quota" | "auth" | произвольный текст. */
  reason: string;

  constructor(message: string, provider: string, reason: string) {
    super(message);
    this.name = "ProviderQuotaError";
    this.provider = provider;
    this.reason = reason;
  }
}
