/**
 * Запись в Bitrix24 CRM из анализа звонка (порт call-agent lib/bitrix-write.ts).
 *
 * **Безопасность по умолчанию:** dryRunCrm приходит В КОНФИГЕ (RopBitrixConfig,
 * из rop_settings компании), а не читается через per-tenant флаг из БД внутри
 * этого файла — БЫЛО isDryRunForTenant(tenantId, "crm") с прямым запросом к БД,
 * СТАЛО config.dryRunCrm, который каждый раз резолвит вызывающая сторона.
 * При dryRunCrm=true только формируется payload и уходит в логгер — наружу
 * ничего не отправляется. Дефолт (см. RopBitrixConfig) — true.
 *
 * Дедуп live-отправки (crm_write_log) и сам журнал — БД-слой, подключается в
 * фазе 2b: сюда передаются колбэки logWrite/alreadySent (см. types.ts).
 *
 * Три типа записи:
 *   1. Комментарий в Timeline сущности (deal/lead/contact) — самый безопасный
 *   2. (Задача с next_action — TODO фаза 2b, в call-agent не было реализовано)
 *   3. Заполнение поля DESCRIPTION в карточке Activity (звонок) — резюме рядом со звонком
 *
 * Контракт: каждая функция возвращает { mode, status, entityType, entityId, payload, result? }.
 * UI показывает это пользователю — что бы / что было отправлено.
 */
import type { BitrixClient } from "./bitrix";
import type { CrmAction, CrmMode, CrmWriteLogEntry, RopBitrixConfig } from "./types";
import { makeIdempotencyKey } from "./types";

export interface WriteResult {
  action: CrmAction;
  mode: CrmMode;
  status: "sent" | "skipped_dry" | "skipped_duplicate" | "failed" | "no_target";
  entityType: string | null; // deal/lead/contact/activity
  entityId: string | null;
  payload: unknown; // что было сформировано (для DRY превью)
  result?: unknown; // ответ Bitrix (live) или ошибка
  error?: string;
}

/** Минимальный набор полей звонка, нужных для формирования CRM-записи. */
export interface CallForCrm {
  id: number;
  tenantId: number | null;
  bitrixDealId: string | null;
  bitrixLeadId: string | null;
  bitrixContactId: string | null;
  bitrixActivityId: string | null;
  clientPhone: string | null;
  startedAt: string | null;
  durationSec: number;
  direction: "in" | "out" | null;
}

export interface AnalysisForCrm {
  summary: string | null;
  sentiment: string | null;
  managerScore: number | null;
  scriptCompliance: number | null;
  nextAction: string | null;
  clientName: string | null;
  detectedProduct: string | null;
  objectionsJson: string | null;
  topicsJson: string | null;
}

/**
 * Записать намерение (или факт) CRM-записи в журнал — БД-слой (rop_crm_write_log)
 * подключается в фазе 2b.
 */
export type LogCrmWriteFn = (entry: CrmWriteLogEntry) => Promise<void>;

/**
 * Проверка дедупа live-отправки по idempotency key — БД-слой в фазе 2b.
 * Возвращает true если такая live-запись УЖЕ была отправлена (пропустить повтор).
 */
export type AlreadySentLiveFn = (idempotencyKey: string) => Promise<boolean>;

/**
 * Формирование текста комментария — единое место для всех CRM-целей.
 * Намеренно лаконично: только краткое содержание + следующий шаг. Метрики,
 * чек-лист, возражения, темы — НЕ выводим (комментарий должен быть максимально
 * коротким). Полный разбор — по ссылке на карточку в дашборде AI-РОП.
 *
 * БЫЛО: dashboardUrl хардкодился на `https://marketradar24.ru/call-agent/calls/{id}`.
 * СТАЛО: dashboardUrl — параметр (composится вызывающей стороной, т.к. точный
 * маршрут UI AI-РОП определяется в фазе 4, зона [ui]).
 */
function buildSummaryMarkdown(dashboardUrl: string, a: AnalysisForCrm): string {
  const lines: string[] = [];
  lines.push("[B]🤖 Анализ звонка (AI-РОП)[/B]");
  lines.push("");

  if (a.summary) {
    lines.push("[B]Краткое содержание:[/B]");
    lines.push(a.summary);
    lines.push("");
  }

  if (a.nextAction) {
    lines.push("[B]Следующий шаг:[/B] " + a.nextAction);
    lines.push("");
  }

  lines.push("[URL=" + dashboardUrl + "]Полный разбор в AI-РОП →[/URL]");

  return lines.join("\n");
}

export interface SendCallToBitrixArgs {
  client: BitrixClient;
  config: RopBitrixConfig;
  call: CallForCrm;
  analysis: AnalysisForCrm | null;
  /** Ссылка на карточку звонка в дашборде AI-РОП — подставляется в комментарий. */
  dashboardUrl: string;
  logWrite: LogCrmWriteFn;
  alreadySent: AlreadySentLiveFn;
}

/**
 * Главная точка: отправить (или симулировать) всё что можем по звонку.
 * Создаёт один комментарий на КАЖДУЮ связанную сущность (deal, lead, contact).
 * Возвращает массив результатов — UI рендерит их.
 *
 * БЫЛО: sendCallToBitrix(callId) сам грузил call+analysis из БД (loadCallAndAnalysis).
 * СТАЛО: call/analysis приходят готовыми — загрузка данных из rop_calls/rop_analyses
 * остаётся на стороне вызывающего пайплайна (фаза 2b).
 */
export async function sendCallToBitrix(args: SendCallToBitrixArgs): Promise<WriteResult[]> {
  const { client, config, call, analysis, dashboardUrl, logWrite, alreadySent } = args;

  if (!analysis) {
    return [
      {
        action: "comment",
        mode: "dry",
        status: "no_target",
        entityType: null,
        entityId: null,
        payload: null,
        error: "Звонок не имеет анализа — отправлять нечего",
      },
    ];
  }

  const tenantId = call.tenantId ?? 1;
  const dryRun = config.dryRunCrm;
  const text = buildSummaryMarkdown(dashboardUrl, analysis);

  // Список целей: Deal > Lead (если оба null — Contact один). Если ВСЕ null — Activity без targets.
  // По умолчанию пишем во ВСЕ связанные. Уточнение «только в сделку» — через
  // rop_settings.crmWriteTargets (не перенесено — в оригинале тоже не было).
  const targets: Array<{ entityType: string; entityTypeId: number; entityId: string }> = [];
  if (call.bitrixDealId) targets.push({ entityType: "deal", entityTypeId: 2, entityId: call.bitrixDealId });
  if (call.bitrixLeadId) targets.push({ entityType: "lead", entityTypeId: 1, entityId: call.bitrixLeadId });
  if (call.bitrixContactId) targets.push({ entityType: "contact", entityTypeId: 3, entityId: call.bitrixContactId });

  if (targets.length === 0 && !call.bitrixActivityId) {
    return [
      {
        action: "comment",
        mode: dryRun ? "dry" : "live",
        status: "no_target",
        entityType: null,
        entityId: null,
        payload: { text },
        error: "Звонок не связан с CRM-сущностями (Deal/Lead/Contact/Activity)",
      },
    ];
  }

  const results: WriteResult[] = [];
  for (const t of targets) {
    results.push(await postCommentTo(client, tenantId, call.id, t, text, dryRun, logWrite, alreadySent));
  }

  // Также можно обновить DESCRIPTION в Activity (если есть activity_id) — это
  // пишет резюме прямо в карточку звонка, видно при просмотре истории Bitrix.
  if (call.bitrixActivityId && call.bitrixActivityId !== "0") {
    results.push(await updateActivity(client, tenantId, call.id, call.bitrixActivityId, text, dryRun, logWrite));
  }

  return results;
}

async function postCommentTo(
  client: BitrixClient,
  tenantId: number,
  callId: number,
  target: { entityType: string; entityTypeId: number; entityId: string },
  text: string,
  dryRun: boolean,
  logWrite: LogCrmWriteFn,
  alreadySent: AlreadySentLiveFn
): Promise<WriteResult> {
  const payload = {
    entityType: target.entityType,
    entityId: target.entityId,
    comment: text,
  };

  // Дедуп live-вызовов
  if (!dryRun) {
    const key = makeIdempotencyKey(callId, "comment", target.entityType, target.entityId);
    const dup = await alreadySent(key);
    if (dup) {
      await logWrite({
        tenantId,
        callId,
        action: "comment",
        entityType: target.entityType,
        entityId: target.entityId,
        mode: "live",
        status: "skipped_dry",
        payload,
      });
      return {
        action: "comment",
        mode: "live",
        status: "skipped_duplicate",
        entityType: target.entityType,
        entityId: target.entityId,
        payload,
      };
    }
  }

  if (dryRun) {
    await logWrite({
      tenantId,
      callId,
      action: "comment",
      entityType: target.entityType,
      entityId: target.entityId,
      mode: "dry",
      status: "skipped_dry",
      payload,
    });
    return {
      action: "comment",
      mode: "dry",
      status: "skipped_dry",
      entityType: target.entityType,
      entityId: target.entityId,
      payload,
    };
  }

  // LIVE отправка
  try {
    const commentId = await client.crmTimelineCommentAdd({
      entityTypeId: target.entityTypeId,
      entityId: target.entityId,
      comment: text,
    });
    await logWrite({
      tenantId,
      callId,
      action: "comment",
      entityType: target.entityType,
      entityId: target.entityId,
      mode: "live",
      status: "sent",
      payload,
      result: { comment_id: commentId },
    });
    return {
      action: "comment",
      mode: "live",
      status: "sent",
      entityType: target.entityType,
      entityId: target.entityId,
      payload,
      result: { comment_id: commentId },
    };
  } catch (e) {
    const err = (e as Error).message;
    await logWrite({
      tenantId,
      callId,
      action: "comment",
      entityType: target.entityType,
      entityId: target.entityId,
      mode: "live",
      status: "failed",
      payload,
      result: { error: err },
    });
    return {
      action: "comment",
      mode: "live",
      status: "failed",
      entityType: target.entityType,
      entityId: target.entityId,
      payload,
      error: err,
    };
  }
}

async function updateActivity(
  client: BitrixClient,
  tenantId: number,
  callId: number,
  activityId: string,
  text: string,
  dryRun: boolean,
  logWrite: LogCrmWriteFn
): Promise<WriteResult> {
  const payload = { activityId, fields: { DESCRIPTION: text, DESCRIPTION_TYPE: 3 } }; // 3 = BBCode

  if (dryRun) {
    await logWrite({
      tenantId,
      callId,
      action: "activity_update",
      entityType: "activity",
      entityId: activityId,
      mode: "dry",
      status: "skipped_dry",
      payload,
    });
    return {
      action: "activity_update",
      mode: "dry",
      status: "skipped_dry",
      entityType: "activity",
      entityId: activityId,
      payload,
    };
  }

  try {
    const ok = await client.crmActivityUpdate(activityId, payload.fields);
    await logWrite({
      tenantId,
      callId,
      action: "activity_update",
      entityType: "activity",
      entityId: activityId,
      mode: "live",
      status: "sent",
      payload,
      result: { ok },
    });
    return {
      action: "activity_update",
      mode: "live",
      status: "sent",
      entityType: "activity",
      entityId: activityId,
      payload,
      result: { ok },
    };
  } catch (e) {
    const err = (e as Error).message;
    await logWrite({
      tenantId,
      callId,
      action: "activity_update",
      entityType: "activity",
      entityId: activityId,
      mode: "live",
      status: "failed",
      payload,
      result: { error: err },
    });
    return {
      action: "activity_update",
      mode: "live",
      status: "failed",
      entityType: "activity",
      entityId: activityId,
      payload,
      error: err,
    };
  }
}
