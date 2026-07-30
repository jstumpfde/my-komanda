/**
 * Тонкий клиент к Bitrix24 через классический входящий вебхук.
 * Док: https://dev.1c-bitrix.ru/rest_help/
 *
 * Порт из call-agent (lib/bitrix.ts). БЫЛО: глобальный env BITRIX_WEBHOOK_URL
 * (один портал на всю инсталляцию). СТАЛО: createBitrixClient(config) — конфиг
 * (RopBitrixConfig из rop_settings) передаётся параметром, каждая компания
 * может подключить свой портал. webhookUrl должен оканчиваться на "/", напр.:
 *   https://yourportal.bitrix24.ru/rest/1/abc123def/
 */
import fs from "fs";
import path from "path";
import type { RopBitrixConfig } from "./types";

function normalizeBaseUrl(webhookUrl: string): string {
  const url = webhookUrl.trim();
  if (!url) throw new Error("webhookUrl не задан (RopBitrixConfig.webhookUrl)");
  return url.endsWith("/") ? url : url + "/";
}

export class BitrixError extends Error {
  constructor(message: string, public method: string, public payload?: unknown) {
    super(message);
  }
}

export class BitrixRateLimitError extends BitrixError {
  constructor(message: string, public retryAfter: number) {
    super(message, "rate_limit");
    this.name = "BitrixRateLimitError";
  }
}

// ──────────────────────────────────────────────────────────────
// Voximplant / телефония

export interface VoxStatistic {
  ID: string;
  CALL_TYPE: string; // "1" входящий, "2" исходящий
  CALL_DURATION: string;
  CALL_START_DATE: string;
  CALL_RECORD_URL?: string;
  CALL_WEBDAV_URL?: string;
  PHONE_NUMBER?: string;
  PORTAL_USER_ID?: string; // менеджер
  CRM_ENTITY_TYPE?: string; // LEAD/DEAL/CONTACT/COMPANY
  CRM_ENTITY_ID?: string;
  CRM_ACTIVITY_ID?: string;
}

// ──────────────────────────────────────────────────────────────
// CRM Activity — для классической схемы с произвольной телефонией.

export interface CrmActivity {
  ID: string;
  TYPE_ID: string;
  PROVIDER_TYPE_ID: string;
  SUBJECT?: string;
  DESCRIPTION?: string;
  RESPONSIBLE_ID?: string;
  OWNER_TYPE_ID?: string; // 1=Lead, 2=Deal, 3=Contact, 4=Company
  OWNER_ID?: string;
  FILES?: Array<{ urlMachine?: string; url?: string; name?: string }>;
  START_TIME?: string;
}

const TYPE_MAP: Record<number, string> = {
  1: "lead",
  2: "deal",
  3: "contact",
  4: "company",
};

// ──────────────────────────────────────────────────────────────
// Контекст сделки/лида — фон для AI-оценки звонка

export interface Deal {
  ID: string;
  TITLE?: string;
  STAGE_ID?: string;
  OPPORTUNITY?: string; // сумма
  CURRENCY_ID?: string;
  TYPE_ID?: string;
  ASSIGNED_BY_ID?: string;
  COMMENTS?: string;
  DATE_CREATE?: string;
  CONTACT_ID?: string;
  COMPANY_ID?: string;
  CATEGORY_ID?: string;
}

export interface Lead {
  ID: string;
  TITLE?: string;
  NAME?: string;
  LAST_NAME?: string;
  STATUS_ID?: string;
  OPPORTUNITY?: string;
  ASSIGNED_BY_ID?: string;
  COMMENTS?: string;
  DATE_CREATE?: string;
}

export interface Contact {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  SECOND_NAME?: string;
  HONORIFIC?: string;
  POST?: string; // должность
  COMPANY_ID?: string;
  ASSIGNED_BY_ID?: string;
  DATE_CREATE?: string;
}

export interface DealContext {
  kind: "deal" | "lead" | null;
  entityId: string | null;
  title: string | null;
  stage: string | null;
  opportunity: string | null;
  createdAt: string | null;
  recentComments: Array<{ author: string; text: string; createdAt: string }>;
  priorActivities: Array<{ subject: string; type: string; startAt: string }>;
}

// ──────────────────────────────────────────────────────────────
// Пользователи (менеджеры)

export interface BitrixUser {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  SECOND_NAME?: string;
  EMAIL?: string;
  ACTIVE?: boolean;
}

/** Сложить ФИО контакта в формат "Фамилия Имя Отчество" (или что есть). */
export function formatContactName(c: Contact): string {
  const parts = [c.LAST_NAME?.trim(), c.NAME?.trim(), c.SECOND_NAME?.trim()].filter(Boolean);
  return parts.join(" ") || `ID ${c.ID}`;
}

/** Сложить ФИО в формат "Фамилия Имя" (или Имя если фамилии нет). */
export function formatUserName(u: BitrixUser): string {
  const last = u.LAST_NAME?.trim();
  const name = u.NAME?.trim();
  return [last, name].filter(Boolean).join(" ") || u.EMAIL || `ID ${u.ID}`;
}

/** Из CRM_ENTITY_TYPE/OWNER_TYPE_ID в число. */
export function entityTypeStringToId(t?: string | null): number | null {
  if (!t) return null;
  const x = t.toUpperCase();
  if (x === "LEAD" || x === "1") return 1;
  if (x === "DEAL" || x === "2") return 2;
  if (x === "CONTACT" || x === "3") return 3;
  if (x === "COMPANY" || x === "4") return 4;
  return null;
}

function stripBitrixHtml(s: string): string {
  return s
    .replace(/\[\/?B\]/gi, "")
    .replace(/\[\/?I\]/gi, "")
    .replace(/\[\/?U\]/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferExt(url: string, contentType: string | null): string {
  const u = url.toLowerCase();
  if (u.endsWith(".mp3")) return ".mp3";
  if (u.endsWith(".wav")) return ".wav";
  if (u.endsWith(".ogg") || u.endsWith(".oga")) return ".ogg";
  if (u.endsWith(".m4a")) return ".m4a";
  if (contentType?.includes("mpeg")) return ".mp3";
  if (contentType?.includes("wav")) return ".wav";
  if (contentType?.includes("ogg")) return ".ogg";
  return ".mp3";
}

/**
 * Скачивание записи в локальный файл. Не зависит от конфига компании (принимает
 * готовый URL) — оставлена отдельной функцией, а не методом клиента.
 */
export async function downloadRecording(url: string, outDir: string, callId: string): Promise<string> {
  // SSRF-защита: только https и доверенные хосты Bitrix/Voximplant.
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("SSRF: only https allowed");
  const ALLOWED = /\.(bitrix24\.(ru|com)|voximplant\.com|b24files\.com)$/i;
  if (!ALLOWED.test(parsed.hostname)) throw new Error(`SSRF: untrusted host ${parsed.hostname}`);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 60s таймаут — записи звонков бывают крупными файлами.
  const dlController = new AbortController();
  const dlTimer = setTimeout(() => dlController.abort(new Error("Bitrix timeout 60s")), 60_000);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: dlController.signal });
  } finally {
    clearTimeout(dlTimer);
  }
  if (!res.ok) throw new Error(`Не удалось скачать запись ${url}: ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  // Защита: если Битрикс вернул HTML вместо аудио — это auth-ошибка
  // (URL вида /bitrix/tools/crm_show_file.php требует session-auth, не webhook)
  if (ct.includes("text/html")) {
    const preview = (await res.text()).slice(0, 200);
    throw new Error(`Битрикс вернул HTML вместо аудио (нужен disk.file.get DOWNLOAD_URL): ${preview}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = inferExt(url, ct);
  const filePath = path.join(outDir, `${callId}${ext}`);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

// ──────────────────────────────────────────────────────────────
// Клиент — фабрика, привязанная к конфигу конкретной компании

export interface BitrixClient {
  /** Базовый origin портала (без /rest/.../.../), для ссылок на CRM-карточки. */
  getPortalUrl(): string | null;
  /**
   * Битрикс часто возвращает ссылки на скачивание с пустым параметром
   * `auth=` — нужно подставить токен из webhook URL, иначе будет 401.
   */
  appendAuthToFileUrl(url: string): string;

  /** Сырой вызов метода REST API — для случаев без типизированной обёртки. */
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;

  voxGetStatistic(callId: string): Promise<VoxStatistic | null>;
  voxListStatistics(opts: {
    fromDate?: string; // YYYY-MM-DD
    toDate?: string; // YYYY-MM-DD
    managerIds?: string[]; // PORTAL_USER_ID (только эти менеджеры)
    hasRecordOnly?: boolean; // фильтровать только звонки с записью
    start?: number; // offset для пагинации
  }): Promise<{ items: VoxStatistic[]; next: number | null; total: number }>;

  crmActivityGet(id: string): Promise<CrmActivity | null>;
  crmActivityListById(id: string): Promise<CrmActivity | null>;
  crmTimelineCommentAdd(args: {
    entityTypeId: number; // 1=Lead, 2=Deal, 3=Contact, 4=Company
    entityId: number | string;
    comment: string;
  }): Promise<number>;
  crmActivityUpdate(id: string, fields: Record<string, unknown>): Promise<boolean>;

  diskFileGetDownloadUrl(fileId: string | number): Promise<string | null>;
  resolveRecordingFromActivity(activityId: string): Promise<string | null>;

  crmDealGet(id: string | number): Promise<Deal | null>;
  crmLeadGet(id: string | number): Promise<Lead | null>;
  crmContactGet(id: string | number): Promise<Contact | null>;

  crmTimelineComments(
    entityType: "deal" | "lead" | "contact" | "company",
    entityId: string | number,
    limit?: number
  ): Promise<Array<{ ID: string; COMMENT: string; CREATED: string; AUTHOR_ID: string }>>;

  crmCallActivitiesByPeriod(opts: { fromDate: string; toDate?: string }): Promise<Map<string, string>>;

  crmPriorActivities(
    ownerType: "deal" | "lead",
    ownerId: string | number,
    limit?: number
  ): Promise<Array<{ ID: string; SUBJECT: string; START_TIME: string; PROVIDER_TYPE_ID: string }>>;

  buildCallContext(args: { bitrixDealId: string | null; bitrixLeadId: string | null }): Promise<DealContext | null>;

  userGet(id: string | number): Promise<BitrixUser | null>;
  usersGetBatch(ids: Array<string | number>): Promise<Map<string, BitrixUser>>;
}

/** Создать клиент Bitrix24, привязанный к вебхуку конкретной компании. */
export function createBitrixClient(config: RopBitrixConfig): BitrixClient {
  const base = normalizeBaseUrl(config.webhookUrl);

  async function call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = base + method + ".json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Bitrix timeout 15s")), 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const data = (await res.json()) as { result?: T; error?: string; error_description?: string };
    if (!res.ok || data.error) {
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
        throw new BitrixRateLimitError(`Rate limited, retry after ${retryAfter}s`, retryAfter);
      }
      throw new BitrixError(
        `${method}: ${data.error || res.statusText} — ${data.error_description ?? ""}`,
        method,
        data
      );
    }
    return data.result as T;
  }

  function getPortalUrl(): string | null {
    try {
      const u = new URL(config.webhookUrl.trim());
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  }

  /** Из URL вида `.../rest/<userId>/<token>/` достаём <token>. */
  function extractWebhookToken(): string | null {
    const m = config.webhookUrl.trim().match(/\/rest\/\d+\/([^/]+)\/?/);
    return m?.[1] ?? null;
  }

  function appendAuthToFileUrl(url: string): string {
    const token = extractWebhookToken();
    if (!token) return url;
    if (/[?&]auth=/.test(url)) {
      return url.replace(/(\?|&)auth=[^&]*/, `$1auth=${token}`);
    }
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}auth=${token}`;
  }

  async function voxGetStatistic(callId: string): Promise<VoxStatistic | null> {
    const result = await call<VoxStatistic[]>("voximplant.statistic.get", {
      FILTER: { CALL_ID: callId },
    });
    return result?.[0] ?? null;
  }

  async function voxListStatistics(opts: {
    fromDate?: string;
    toDate?: string;
    managerIds?: string[];
    hasRecordOnly?: boolean;
    start?: number;
  }): Promise<{ items: VoxStatistic[]; next: number | null; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.fromDate) filter[">=CALL_START_DATE"] = opts.fromDate;
    if (opts.toDate) filter["<=CALL_START_DATE"] = opts.toDate + " 23:59:59";
    if (opts.managerIds && opts.managerIds.length > 0) filter["PORTAL_USER_ID"] = opts.managerIds;
    if (opts.hasRecordOnly) filter[">CALL_DURATION"] = "0";

    // Bitrix REST: пагинация через top-level `start`, не в FILTER
    const params: Record<string, unknown> = {
      FILTER: filter,
      SORT: "CALL_START_DATE",
      ORDER: "DESC",
    };
    if (opts.start) params.start = opts.start;

    const url = base + "voximplant.statistic.get.json";
    const voxController = new AbortController();
    const voxTimer = setTimeout(() => voxController.abort(new Error("Bitrix timeout 15s")), 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: voxController.signal,
      });
    } finally {
      clearTimeout(voxTimer);
    }
    const data = (await res.json()) as {
      result?: VoxStatistic[];
      total?: number;
      next?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || data.error) {
      throw new BitrixError(
        `voximplant.statistic.get: ${data.error || res.statusText} — ${data.error_description ?? ""}`,
        "voximplant.statistic.get",
        data
      );
    }
    return {
      items: data.result ?? [],
      next: typeof data.next === "number" ? data.next : null,
      total: data.total ?? data.result?.length ?? 0,
    };
  }

  async function crmActivityGet(id: string): Promise<CrmActivity | null> {
    try {
      return await call<CrmActivity>("crm.activity.get", { id });
    } catch (e) {
      console.warn(`[ai-rop/bitrix] crm.activity.get(${id}) failed:`, (e as Error).message);
      return null;
    }
  }

  /**
   * Получить активность через `crm.activity.list` — этот метод (в отличие от
   * .get) стабильно возвращает поле FILES со ссылкой на запись для внешних АТС.
   */
  async function crmActivityListById(id: string): Promise<CrmActivity | null> {
    try {
      const list = await call<CrmActivity[]>("crm.activity.list", {
        filter: { ID: id },
        select: ["*", "FILES"],
      });
      return list?.[0] ?? null;
    } catch (e) {
      console.warn(`[ai-rop/bitrix] crm.activity.list(ID=${id}) failed:`, (e as Error).message);
      return null;
    }
  }

  async function crmTimelineCommentAdd(args: {
    entityTypeId: number;
    entityId: number | string;
    comment: string;
  }): Promise<number> {
    return await call<number>("crm.timeline.comment.add", {
      fields: {
        ENTITY_ID: args.entityId,
        ENTITY_TYPE: TYPE_MAP[args.entityTypeId] ?? "deal",
        COMMENT: args.comment,
      },
    });
  }

  async function crmActivityUpdate(id: string, fields: Record<string, unknown>): Promise<boolean> {
    return await call<boolean>("crm.activity.update", { id, fields });
  }

  /**
   * Получить машинную DOWNLOAD_URL по ID файла из b_file (Bitrix Disk). Эта
   * ссылка содержит собственный одноразовый токен и работает напрямую через
   * fetch — auth подставлять не нужно.
   */
  async function diskFileGetDownloadUrl(fileId: string | number): Promise<string | null> {
    try {
      const file = await call<{ ID: string; NAME?: string; DOWNLOAD_URL?: string }>("disk.file.get", {
        id: fileId,
      });
      return file?.DOWNLOAD_URL ?? null;
    } catch (e) {
      console.warn(`[ai-rop/bitrix] disk.file.get(${fileId}) failed:`, (e as Error).message);
      return null;
    }
  }

  /**
   * Резолв ссылки на запись по CRM_ACTIVITY_ID — для внешних телефоний
   * (Телфин, Mango, UIS и т.п.), где voximplant.statistic.get отдаёт
   * CALL_RECORD_URL=null, а файл лежит в crm.activity.FILES.
   */
  async function resolveRecordingFromActivity(activityId: string): Promise<string | null> {
    const a = await crmActivityListById(activityId);
    if (!a) {
      console.warn(`[ai-rop/bitrix] resolveRecording: activity ${activityId} не найдена`);
      return null;
    }
    const file = a.FILES?.[0];
    if (!file) {
      console.warn(`[ai-rop/bitrix] resolveRecording: activity ${activityId} без FILES (запись отсутствует)`);
      return null;
    }

    if (file.urlMachine) return file.urlMachine;

    const fileId = (file as { id?: number | string }).id;
    if (!fileId) {
      console.warn(`[ai-rop/bitrix] resolveRecording: activity ${activityId} FILES[0] без id`);
      return null;
    }
    const dl = await diskFileGetDownloadUrl(fileId);
    if (!dl) {
      console.warn(`[ai-rop/bitrix] resolveRecording: disk.file.get(${fileId}) вернул null`);
    }
    return dl;
  }

  async function crmDealGet(id: string | number): Promise<Deal | null> {
    try {
      return await call<Deal>("crm.deal.get", { id });
    } catch {
      return null;
    }
  }

  async function crmLeadGet(id: string | number): Promise<Lead | null> {
    try {
      return await call<Lead>("crm.lead.get", { id });
    } catch {
      return null;
    }
  }

  async function crmContactGet(id: string | number): Promise<Contact | null> {
    try {
      return await call<Contact>("crm.contact.get", { id });
    } catch {
      return null;
    }
  }

  async function crmTimelineComments(
    entityType: "deal" | "lead" | "contact" | "company",
    entityId: string | number,
    limit = 5
  ): Promise<Array<{ ID: string; COMMENT: string; CREATED: string; AUTHOR_ID: string }>> {
    try {
      const result = await call<Array<{ ID: string; COMMENT: string; CREATED: string; AUTHOR_ID: string }>>(
        "crm.timeline.comment.list",
        {
          filter: { ENTITY_ID: entityId, ENTITY_TYPE: entityType },
          order: { ID: "DESC" },
          select: ["ID", "COMMENT", "CREATED", "AUTHOR_ID"],
        }
      );
      return (result ?? []).slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Получить пачку RESPONSIBLE_ID для активностей CALL за период. Используется
   * чтобы атрибутировать звонки на правильного менеджера (того, кто фактически
   * работает с CRM-карточкой, а не того, кто первым взял трубку — диспетчер).
   * Битрикс ограничивает 50 на страницу — пагинируем.
   */
  async function crmCallActivitiesByPeriod(opts: { fromDate: string; toDate?: string }): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let start = 0;
    for (let page = 0; page < 50; page++) {
      try {
        const params: Record<string, unknown> = {
          filter: {
            PROVIDER_TYPE_ID: "CALL",
            ">=CREATED": opts.fromDate,
            "<=CREATED": (opts.toDate || opts.fromDate) + " 23:59:59",
          },
          select: ["ID", "RESPONSIBLE_ID"],
          order: { ID: "ASC" },
        };
        if (start) params.start = start;
        const url = base + "crm.activity.list.json";
        const actController = new AbortController();
        const actTimer = setTimeout(() => actController.abort(new Error("Bitrix timeout 15s")), 15_000);
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
            signal: actController.signal,
          });
        } finally {
          clearTimeout(actTimer);
        }
        const data = (await res.json()) as {
          result?: Array<{ ID: string; RESPONSIBLE_ID: string }>;
          next?: number;
        };
        for (const a of data.result || []) {
          if (a.ID && a.RESPONSIBLE_ID) map.set(String(a.ID), String(a.RESPONSIBLE_ID));
        }
        if (data.next == null) break;
        start = data.next;
      } catch (e) {
        console.warn("[ai-rop/bitrix] crmCallActivitiesByPeriod page error:", (e as Error).message);
        break;
      }
    }
    return map;
  }

  async function crmPriorActivities(
    ownerType: "deal" | "lead",
    ownerId: string | number,
    limit = 10
  ): Promise<Array<{ ID: string; SUBJECT: string; START_TIME: string; PROVIDER_TYPE_ID: string }>> {
    const ownerTypeId = ownerType === "deal" ? 2 : 1;
    try {
      const result = await call<Array<{ ID: string; SUBJECT: string; START_TIME: string; PROVIDER_TYPE_ID: string }>>(
        "crm.activity.list",
        {
          filter: { OWNER_TYPE_ID: ownerTypeId, OWNER_ID: ownerId },
          order: { ID: "DESC" },
          select: ["ID", "SUBJECT", "START_TIME", "PROVIDER_TYPE_ID"],
        }
      );
      return (result ?? []).slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Собирает фон по звонку: если связан со сделкой/лидом — возвращает свёртку. */
  async function buildCallContext(args: {
    bitrixDealId: string | null;
    bitrixLeadId: string | null;
  }): Promise<DealContext | null> {
    const { bitrixDealId, bitrixLeadId } = args;
    if (!bitrixDealId && !bitrixLeadId) return null;

    if (bitrixDealId) {
      const deal = await crmDealGet(bitrixDealId);
      if (!deal) return null;
      const [commentsResult, activitiesResult] = await Promise.allSettled([
        crmTimelineComments("deal", bitrixDealId, 5),
        crmPriorActivities("deal", bitrixDealId, 10),
      ]);
      const comments = commentsResult.status === "fulfilled" ? commentsResult.value : [];
      const acts = activitiesResult.status === "fulfilled" ? activitiesResult.value : [];
      if (commentsResult.status === "rejected") {
        console.warn("[ai-rop/bitrix] crmTimelineComments failed:", (commentsResult.reason as Error)?.message);
      }
      if (activitiesResult.status === "rejected") {
        console.warn("[ai-rop/bitrix] crmPriorActivities failed:", (activitiesResult.reason as Error)?.message);
      }
      return {
        kind: "deal",
        entityId: bitrixDealId,
        title: deal.TITLE ?? null,
        stage: deal.STAGE_ID ?? null,
        opportunity: deal.OPPORTUNITY ? `${deal.OPPORTUNITY}${deal.CURRENCY_ID ? " " + deal.CURRENCY_ID : ""}` : null,
        createdAt: deal.DATE_CREATE ?? null,
        recentComments: comments.map((c) => ({
          author: c.AUTHOR_ID,
          text: stripBitrixHtml(c.COMMENT),
          createdAt: c.CREATED,
        })),
        priorActivities: acts.map((a) => ({
          subject: a.SUBJECT,
          type: a.PROVIDER_TYPE_ID,
          startAt: a.START_TIME,
        })),
      };
    }

    // lead
    const lead = await crmLeadGet(bitrixLeadId!);
    if (!lead) return null;
    const [commentsResultLead, activitiesResultLead] = await Promise.allSettled([
      crmTimelineComments("lead", bitrixLeadId!, 5),
      crmPriorActivities("lead", bitrixLeadId!, 10),
    ]);
    const comments = commentsResultLead.status === "fulfilled" ? commentsResultLead.value : [];
    const acts = activitiesResultLead.status === "fulfilled" ? activitiesResultLead.value : [];
    if (commentsResultLead.status === "rejected") {
      console.warn("[ai-rop/bitrix] crmTimelineComments failed:", (commentsResultLead.reason as Error)?.message);
    }
    if (activitiesResultLead.status === "rejected") {
      console.warn("[ai-rop/bitrix] crmPriorActivities failed:", (activitiesResultLead.reason as Error)?.message);
    }
    return {
      kind: "lead",
      entityId: bitrixLeadId,
      title: lead.TITLE || [lead.NAME, lead.LAST_NAME].filter(Boolean).join(" ") || null,
      stage: lead.STATUS_ID ?? null,
      opportunity: lead.OPPORTUNITY ?? null,
      createdAt: lead.DATE_CREATE ?? null,
      recentComments: comments.map((c) => ({
        author: c.AUTHOR_ID,
        text: stripBitrixHtml(c.COMMENT),
        createdAt: c.CREATED,
      })),
      priorActivities: acts.map((a) => ({
        subject: a.SUBJECT,
        type: a.PROVIDER_TYPE_ID,
        startAt: a.START_TIME,
      })),
    };
  }

  async function userGet(id: string | number): Promise<BitrixUser | null> {
    try {
      const r = await call<BitrixUser[]>("user.get", { ID: id });
      return r?.[0] ?? null;
    } catch (e) {
      console.warn(`[ai-rop/bitrix] user.get(${id}) failed:`, (e as Error).message);
      return null;
    }
  }

  async function usersGetBatch(ids: Array<string | number>): Promise<Map<string, BitrixUser>> {
    const out = new Map<string, BitrixUser>();
    const unique = [...new Set(ids.map(String))].filter(Boolean);

    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      try {
        const r = await call<BitrixUser[]>("user.get", { FILTER: { ID: chunk } });
        for (const u of r ?? []) out.set(u.ID, u);
      } catch (e) {
        console.warn(`[ai-rop/bitrix] usersGetBatch chunk failed:`, (e as Error).message);
      }
    }
    return out;
  }

  return {
    getPortalUrl,
    appendAuthToFileUrl,
    call,
    voxGetStatistic,
    voxListStatistics,
    crmActivityGet,
    crmActivityListById,
    crmTimelineCommentAdd,
    crmActivityUpdate,
    diskFileGetDownloadUrl,
    resolveRecordingFromActivity,
    crmDealGet,
    crmLeadGet,
    crmContactGet,
    crmTimelineComments,
    crmCallActivitiesByPeriod,
    crmPriorActivities,
    buildCallContext,
    userGet,
    usersGetBatch,
  };
}
