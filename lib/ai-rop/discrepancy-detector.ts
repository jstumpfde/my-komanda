/**
 * «Сравнение с CRM-карточкой» (Фаза 2 продукта) — порт call-agent
 * lib/discrepancy-detector.ts. detectDiscrepancies(callId, companyId, client)
 * запускается ПОСЛЕ analyzeCall (pipeline.ts, fire-and-forget): берёт
 * транскрипт + карточку Bitrix, находит расхождения через AI (+ отдельно,
 * ЛОКАЛЬНО без AI — телефон, 152-ФЗ), сохраняет в rop_discrepancies,
 * маршрутизирует получателям (менеджер / администраторы).
 */
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropAnalyses, ropCalls, ropDiscrepancies, ropManagers, ropTranscripts, type RopDiscrepancy } from "@/lib/db/schema"
import type { BitrixClient } from "./bitrix"
import type { RopBitrixConfig } from "./types"
import { callWithTool } from "./ai-provider"
import { maskPIIFull, normalizePhone } from "./pii-mask"
import { getRopSettings, getSettingsJson } from "./settings"

export type DiscrepancySeverity = "low" | "medium" | "high"

export interface DiscrepancyDetectorSettings {
  enabled: boolean
  recipientMode: "manager" | "admins"
  adminUserIds: string[]
  actionMode: "manual" | "auto_approve"
  customFields: string[] | null
  severityMin: DiscrepancySeverity
}

interface CallData {
  id: string
  tenantId: string
  managerId: string | null
  bitrixDealId: string | null
  bitrixLeadId: string | null
  bitrixContactId: string | null
  transcript: string | null
  summary: string | null
  clientName: string | null
  nextAction: string | null
}

interface BitrixCardField {
  label: string
  value: string
}

interface BitrixCard {
  entityType: "deal" | "lead"
  entityId: string
  fields: Record<string, BitrixCardField>
}

interface AiDiscrepancy {
  field_name: string
  field_label: string
  card_value?: string
  transcript_evidence: string
  suggested_value: string
  severity: DiscrepancySeverity
  reasoning?: string
  /** 'local' — найдено regex-детектором телефона (БЕЗ AI, 152-ФЗ). Отсутствует/'ai' — AI-детектор. */
  source?: "ai" | "local"
}

// ──────────────────────────────────────────────────────────────
// Whitelist осмысленных бизнес-полей + маппинг кодов на русские названия —
// не плодим мусор по техническим UF_CRM_*-полям/булевым флагам/служебным
// комментариям, сверяем только то, что реально важно РОПу.

const BUSINESS_FIELD_LABELS: Record<string, string> = {
  TITLE: "Название",
  OPPORTUNITY: "Сумма сделки",
  STAGE_ID: "Этап",
  STATUS_ID: "Статус",
  NAME: "Контактное лицо",
  LAST_NAME: "Фамилия контакта",
  SECOND_NAME: "Отчество контакта",
  PHONE: "Телефон",
  EMAIL: "Email",
  COMMENTS: "Комментарий",
  CLOSEDATE: "Срок (дата закрытия)",
  DATE_CREATE: "Дата создания",
  ASSIGNED_BY_ID: "Ответственный",
}

const SYSTEM_FIELD_BLACKLIST = new Set<string>([
  "ID", "CATEGORY_ID", "CURRENCY_ID", "OPPORTUNITY_ACCOUNT", "TAX_VALUE", "OPENED", "CLOSED",
  "IS_MANUAL_OPPORTUNITY", "IS_NEW", "IS_RECURRING", "IS_RETURN_CUSTOMER", "IS_REPEATED_APPROACH",
  "MODIFY_BY_ID", "CREATED_BY_ID", "MOVED_BY_ID", "MOVED_TIME", "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY",
  "WEBFORM_ID", "SOURCE_ID", "SOURCE_DESCRIPTION", "UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN",
  "UTM_CONTENT", "UTM_TERM", "ADDITIONAL_INFO", "ORIGINATOR_ID", "ORIGIN_ID", "LOCATION_ID",
])

/**
 * Возвращает человекочитаемый ярлык для поля или null, если поле не считается
 * осмысленным бизнес-полем: стандартные — из BUSINESS_FIELD_LABELS; UF_CRM_* —
 * только с осмысленным label (не равным самому коду); прочие — пропуск.
 */
function resolveFieldLabel(fieldName: string, rawLabel: string): string | null {
  if (SYSTEM_FIELD_BLACKLIST.has(fieldName)) return null
  if (BUSINESS_FIELD_LABELS[fieldName]) return BUSINESS_FIELD_LABELS[fieldName]

  if (fieldName.startsWith("UF_")) {
    const label = (rawLabel || "").trim()
    if (!label || label === fieldName) return null
    if (/^UF_/.test(label) || /^[0-9_]+$/.test(label)) return null
    return label
  }
  return null
}

/** true, если значение — мусор для РОПа (булево, чистый код, служебный текст, html-обрывки). */
function isNoiseValue(value: string | null | undefined): boolean {
  if (value == null) return true
  const v = String(value).trim()
  if (v === "") return true
  if (/^(true|false|y|n|да|нет|0|1)$/i.test(v)) return true
  if (/^[A-Z]{1,3}\d*:[A-Z0-9_]+$/.test(v)) return true // STAGE-коды вида C9:NEW
  if (/^UC_[A-Z0-9]+$/i.test(v)) return true
  if (/\[\/?[a-z]+\]/i.test(v)) return true
  if (/<\/?[a-z][^>]*>/i.test(v)) return true
  if (/^(BitrixGPT|Автокомментарий|Робот|CRM-форма)/i.test(v)) return true
  return false
}

const SEVERITY_ORDER: Record<DiscrepancySeverity, number> = { low: 0, medium: 1, high: 2 }
function severityAtLeast(actual: DiscrepancySeverity, min: DiscrepancySeverity): boolean {
  return SEVERITY_ORDER[actual] >= SEVERITY_ORDER[min]
}

// ──────────────────────────────────────────────────────────────
// 1. Загрузка данных звонка + настроек компании

function parseDiscrepancySettings(row: Awaited<ReturnType<typeof getRopSettings>>): DiscrepancyDetectorSettings {
  let adminUserIds: string[] = []
  if (row.discrepancyAdminUserIds) {
    try {
      const parsed = JSON.parse(row.discrepancyAdminUserIds) as unknown[]
      adminUserIds = Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      adminUserIds = []
    }
  }
  let customFields: string[] | null = null
  if (row.discrepancyCustomFields) {
    try {
      const parsed = JSON.parse(row.discrepancyCustomFields) as unknown[]
      customFields = Array.isArray(parsed) ? parsed.map(String) : null
    } catch {
      customFields = null
    }
  }
  return {
    enabled: row.discrepancyEnabled === true,
    recipientMode: row.discrepancyRecipientMode === "admins" ? "admins" : "manager",
    adminUserIds,
    actionMode: row.discrepancyActionMode === "auto_approve" ? "auto_approve" : "manual",
    customFields,
    severityMin: (["low", "medium", "high"].includes(row.discrepancySeverityMin ?? "") ? row.discrepancySeverityMin : "medium") as DiscrepancySeverity,
  }
}

async function loadCallData(callId: string, companyId: string): Promise<{ call: CallData; settings: DiscrepancyDetectorSettings } | null> {
  const [row] = await db
    .select({
      id: ropCalls.id,
      tenantId: ropCalls.tenantId,
      managerId: ropCalls.managerId,
      bitrixDealId: ropCalls.bitrixDealId,
      bitrixLeadId: ropCalls.bitrixLeadId,
      bitrixContactId: ropCalls.bitrixContactId,
      transcript: ropTranscripts.text,
      summary: ropAnalyses.summary,
      clientName: ropAnalyses.clientName,
      nextAction: ropAnalyses.nextAction,
    })
    .from(ropCalls)
    .leftJoin(ropTranscripts, eq(ropTranscripts.callId, ropCalls.id))
    .leftJoin(ropAnalyses, eq(ropAnalyses.callId, ropCalls.id))
    .where(and(eq(ropCalls.id, callId), eq(ropCalls.tenantId, companyId)))
    .limit(1)

  if (!row) {
    console.warn(`[ai-rop/discrepancy] звонок #${callId} не найден (company ${companyId})`)
    return null
  }

  const settingsRow = await getRopSettings(companyId)
  const settings = parseDiscrepancySettings(settingsRow)
  if (!settings.enabled) return null

  return { call: row, settings }
}

// ──────────────────────────────────────────────────────────────
// 2. Загрузка карточки Bitrix

const _fieldLabelCache = new Map<string, Record<string, string>>()

async function loadFieldLabels(companyId: string, entity: "deal" | "lead", client: BitrixClient): Promise<Record<string, string>> {
  const cacheKey = `${companyId}:${entity}`
  const cached = _fieldLabelCache.get(cacheKey)
  if (cached) return cached

  const labels: Record<string, string> = {}
  try {
    const method = entity === "deal" ? "crm.deal.fields" : "crm.lead.fields"
    const raw = await client.call<Record<string, { formLabel?: string; listLabel?: string; title?: string }>>(method)
    for (const [code, meta] of Object.entries(raw || {})) {
      const label = (meta?.formLabel || meta?.listLabel || meta?.title || "").trim()
      if (label) labels[code] = label
    }
  } catch (e) {
    console.warn(`[ai-rop/discrepancy] не удалось загрузить ярлыки полей ${entity}:`, (e as Error).message)
  }

  _fieldLabelCache.set(cacheKey, labels)
  return labels
}

function extractCardFields(
  raw: Record<string, unknown>,
  customFieldsWhitelist: string[] | null,
  fieldLabels: Record<string, string>
): Record<string, BitrixCardField> {
  const fields: Record<string, BitrixCardField> = {}

  for (const [key, val] of Object.entries(raw)) {
    if (val === undefined || val === null || val === "") continue

    if (key.startsWith("UF_") && customFieldsWhitelist && customFieldsWhitelist.length > 0 && !customFieldsWhitelist.includes(key)) {
      continue
    }

    const label = resolveFieldLabel(key, fieldLabels[key] || "")
    if (!label) continue

    const strVal = Array.isArray(val)
      ? val
          .map((el) => (el && typeof el === "object" && "VALUE" in (el as Record<string, unknown>) ? String((el as Record<string, unknown>).VALUE) : String(el)))
          .filter(Boolean)
          .join(", ")
      : String(val)
    if (strVal.trim() === "") continue
    if (isNoiseValue(strVal)) continue

    fields[key] = { label, value: strVal }
  }

  return fields
}

async function loadBitrixCard(call: CallData, settings: DiscrepancyDetectorSettings, client: BitrixClient): Promise<BitrixCard | null> {
  const useDeal = !!call.bitrixDealId
  const useLead = !useDeal && !!call.bitrixLeadId
  if (!useDeal && !useLead) {
    console.log(`[ai-rop/discrepancy] звонок #${call.id}: нет deal_id/lead_id — пропускаем`)
    return null
  }

  try {
    if (useDeal) {
      let rawDeal: Record<string, unknown> | null = null
      try {
        rawDeal = await client.call<Record<string, unknown>>("crm.deal.get", { id: call.bitrixDealId, select: ["*", "UF_*"] })
      } catch {
        rawDeal = (await client.crmDealGet(call.bitrixDealId!)) as Record<string, unknown> | null
      }
      if (!rawDeal) {
        console.warn(`[ai-rop/discrepancy] deal ${call.bitrixDealId} не найден в Bitrix`)
        return null
      }
      const labels = await loadFieldLabels(call.tenantId, "deal", client)
      return { entityType: "deal", entityId: String(call.bitrixDealId), fields: extractCardFields(rawDeal, settings.customFields, labels) }
    }

    let rawLead: Record<string, unknown> | null = null
    try {
      rawLead = await client.call<Record<string, unknown>>("crm.lead.get", { id: call.bitrixLeadId, select: ["*", "UF_*"] })
    } catch {
      rawLead = (await client.crmLeadGet(call.bitrixLeadId!)) as Record<string, unknown> | null
    }
    if (!rawLead) {
      console.warn(`[ai-rop/discrepancy] lead ${call.bitrixLeadId} не найден в Bitrix`)
      return null
    }
    const labels = await loadFieldLabels(call.tenantId, "lead", client)
    return { entityType: "lead", entityId: String(call.bitrixLeadId), fields: extractCardFields(rawLead, settings.customFields, labels) }
  } catch (e) {
    console.warn(`[ai-rop/discrepancy] ошибка загрузки карточки Bitrix:`, (e as Error).message)
    return null
  }
}

// ──────────────────────────────────────────────────────────────
// 3. AI-детекция расхождений

interface AiDetectResult {
  discrepancies: AiDiscrepancy[]
}

// Поля, которые НИКОГДА не отправляем зарубежному AI (152-ФЗ). PHONE сверяется
// отдельно локальным regex-детектором, EMAIL сейчас не сверяется вовсе.
const PII_FIELD_KEYS = new Set<string>(["PHONE", "EMAIL"])

async function detectWithAI(
  transcript: string,
  cardFields: Record<string, BitrixCardField>,
  opts: { companyId: string; callId: string }
): Promise<{ discrepancies: AiDiscrepancy[]; model: string }> {
  const cardLines = Object.entries(cardFields)
    .filter(([key]) => !PII_FIELD_KEYS.has(key))
    .map(([key, f]) => `- ${f.label} (${key}): "${f.value}"`)
    .join("\n")
  const cardBlock = cardLines.length > 0 ? cardLines : "(карточка пустая или не содержит заполненных полей)"

  const system = `Ты — эксперт по контролю качества продаж. Тебе дан транскрипт звонка менеджера с заказчиком \
и текущее содержимое CRM-карточки (сделка/лид в Bitrix24). \
Найди ТОЛЬКО ФАКТИЧЕСКИЕ, ВАЖНЫЕ ДЛЯ РОПа расхождения: в звонке прозвучала конкретная информация \
(сумма сделки, этап/статус, контактное лицо, телефон, срок/дата, договорённость), \
а в карточке она отсутствует или записана иначе.

ЖЁСТКИЕ ПРАВИЛА (нарушение = брак):
1. Создавай расхождение ТОЛЬКО если можешь привести ПРЯМУЮ ЦИТАТУ из транскрипта (поле transcript_evidence), \
   которая доказывает другое значение. Нет цитаты — НЕ создавай расхождение.
2. НЕ выдумывай расхождения и НЕ считай расхождением то, что в звонке не обсуждалось.
3. ИГНОРИРУЙ технические/служебные поля: булевы флаги (да/нет, true/false), статус-коды, \
   идентификаторы, UTM-метки, служебные комментарии роботов/BitrixGPT, html-обрывки.
4. Сверяй только осмысленные бизнес-поля из переданной карточки. Если поля нет в карточке — \
   не предлагай его, кроме случая когда в звонке явно прозвучала ключевая бизнес-величина \
   (сумма, срок, контакт), которую обязательно нужно зафиксировать.
5. field_label заполняй человекочитаемым русским названием поля (как в карточке).

Лучше вернуть пустой список, чем нагенерить шум.`

  // 152-ФЗ: маскируем телефоны/email в тексте, который уходит в зарубежный AI
  // (PHONE/EMAIL из cardBlock уже исключены выше — это защита transcript-части).
  const user = await maskPIIFull(`## Транскрипт звонка\n\n${transcript.slice(0, 12000)}\n\n## CRM-карточка\n\n${cardBlock}`)

  const schema = {
    type: "object",
    properties: {
      discrepancies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_name: { type: "string" },
            field_label: { type: "string" },
            card_value: { type: "string" },
            transcript_evidence: { type: "string", description: "Прямая цитата из транскрипта" },
            suggested_value: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            reasoning: { type: "string" },
          },
          required: ["field_name", "field_label", "transcript_evidence", "suggested_value", "severity"],
        },
      },
    },
    required: ["discrepancies"],
  }

  const result = await callWithTool<AiDetectResult>({
    toolName: "save_discrepancies",
    schema,
    system,
    user,
    modelTier: "fast",
    maxTokens: 4000,
    companyId: opts.companyId,
    callId: opts.callId,
    action: "rop_discrepancy",
  })

  return { discrepancies: result.result.discrepancies ?? [], model: `${result.provider}:${result.model}` }
}

// ──────────────────────────────────────────────────────────────
// 3b. Локальная (без AI, без утечки за рубеж) проверка телефона

const TRANSCRIPT_PHONE_RE = /(?<!\d)(?:\+?7|8)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g

/**
 * Ищет в transcript телефон-похожие последовательности, сравнивает
 * нормализованные значения с cardFields.PHONE. Прозвучал номер, которого нет
 * в карточке (или отличается) → одно расхождение field_name='PHONE'. Полное
 * совпадение → расхождения нет. Ничего похожего на телефон → пустой массив.
 */
function detectPhoneDiscrepancyLocally(
  transcript: string,
  cardFields: Record<string, BitrixCardField>,
  opts: { companyId: string; callId: string }
): AiDiscrepancy[] {
  if (!transcript) return []

  const rawMatches = transcript.match(TRANSCRIPT_PHONE_RE) ?? []
  if (rawMatches.length === 0) return []

  const cardPhoneRaw = cardFields.PHONE?.value ?? null
  const cardPhoneNorm = cardPhoneRaw ? normalizePhone(cardPhoneRaw) : null

  const seen = new Map<string, string>()
  for (const raw of rawMatches) {
    const norm = normalizePhone(raw)
    if (norm.length !== 11) continue
    if (!seen.has(norm)) seen.set(norm, raw.trim())
  }
  if (seen.size === 0) return []
  if (cardPhoneNorm && seen.has(cardPhoneNorm)) return []

  const [norm, raw] = [...seen.entries()][0]

  const idx = transcript.indexOf(raw)
  const CONTEXT = 30
  const start = idx >= 0 ? Math.max(0, idx - CONTEXT) : 0
  const end = idx >= 0 ? Math.min(transcript.length, idx + raw.length + CONTEXT) : Math.min(transcript.length, raw.length + CONTEXT * 2)
  const evidence = transcript.slice(start, end).trim()

  const local = norm.slice(1)
  const suggested = `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8, 10)}`

  console.log(`[ai-rop/discrepancy] звонок #${opts.callId} (company ${opts.companyId}): локально найден телефон в транскрипте, отличный от карточки`)

  return [
    {
      field_name: "PHONE",
      field_label: resolveFieldLabel("PHONE", "") || "Телефон",
      card_value: cardPhoneRaw ?? undefined,
      transcript_evidence: evidence,
      suggested_value: suggested,
      severity: "high",
      reasoning: "Локальная regex-проверка телефона (без AI, 152-ФЗ) — номер не отправлялся за рубеж.",
      source: "local",
    },
  ]
}

// ──────────────────────────────────────────────────────────────
// 4. Сохранение и маршрутизация

async function saveAndRoute(
  discrepancies: AiDiscrepancy[],
  aiModel: string,
  card: BitrixCard,
  call: CallData,
  settings: DiscrepancyDetectorSettings
): Promise<number> {
  const deNoised = discrepancies.filter((d) => {
    const evidence = (d.transcript_evidence || "").trim()
    if (evidence.length < 8) return false
    if (SYSTEM_FIELD_BLACKLIST.has(d.field_name)) return false
    const label = resolveFieldLabel(d.field_name, d.field_label || "")
    if (!label) return false
    d.field_label = label
    if (isNoiseValue(d.suggested_value)) return false
    return true
  })

  const filtered = deNoised.filter((d) => severityAtLeast(d.severity, settings.severityMin))
  if (filtered.length === 0) return 0

  let managerUserId: string | null = null
  if (settings.recipientMode === "manager" && call.managerId) {
    const [row] = await db
      .select({ userId: ropManagers.userId })
      .from(ropManagers)
      .where(and(eq(ropManagers.tenantId, call.tenantId), eq(ropManagers.bitrixManagerId, call.managerId)))
      .limit(1)
    managerUserId = row?.userId ?? null
  }

  let savedCount = 0
  for (const d of filtered) {
    const cardValue = d.card_value ?? card.fields[d.field_name]?.value ?? null
    const rowModel = d.source === "local" ? "local:phone-regex" : aiModel

    const recipients = settings.recipientMode === "manager" ? [managerUserId] : (settings.adminUserIds.length > 0 ? settings.adminUserIds : [null])

    for (const routedToUserId of recipients) {
      await db.insert(ropDiscrepancies).values({
        tenantId: call.tenantId,
        callId: call.id,
        entityType: card.entityType,
        entityId: card.entityId,
        fieldName: d.field_name,
        fieldLabel: d.field_label,
        cardValue,
        transcriptEvidence: d.transcript_evidence,
        suggestedValue: d.suggested_value,
        severity: d.severity,
        status: "pending",
        routedToUserId,
        aiModel: rowModel,
      })
      savedCount++
    }
  }

  return savedCount
}

// ──────────────────────────────────────────────────────────────
// 5. Применение принятого расхождения в Bitrix CRM

/**
 * Применяет принятое расхождение к карточке Bitrix24: обновляет field_name
 * значением suggested_value через crm.deal.update / crm.lead.update. Для
 * мультиполей (PHONE/EMAIL/WEB/IM) формирует массив [{VALUE, VALUE_TYPE}].
 *
 * Вызывается из API-роута resolve (фаза 3, не эта зона) при action='accepted'
 * ВСЕГДА, независимо от режима — сама функция проверяет dry-run (config.dryRunCrm)
 * и идемпотентность (status='pending'). Ошибки пробрасываются — вызывающий
 * код должен их перехватить.
 */
export async function applyDiscrepancyToBitrix(discrepancy: RopDiscrepancy, client: BitrixClient, config: RopBitrixConfig): Promise<void> {
  if (config.dryRunCrm) {
    console.info("[ai-rop/discrepancy] DRY_RUN: skip applyDiscrepancyToBitrix for company", discrepancy.tenantId)
    return
  }

  const { entityType, entityId, fieldName, suggestedValue } = discrepancy
  if (!entityId || !suggestedValue) {
    console.warn(`[ai-rop/discrepancy] applyToBitrix: пропускаем #${discrepancy.id} — нет entityId или suggestedValue`)
    return
  }

  const [current] = await db.select({ status: ropDiscrepancies.status }).from(ropDiscrepancies).where(eq(ropDiscrepancies.id, discrepancy.id)).limit(1)
  if (!current || current.status !== "pending") {
    console.log(`[ai-rop/discrepancy] applyToBitrix: #${discrepancy.id} status="${current?.status ?? "not found"}" — пропускаем (уже применено)`)
    return
  }

  const MULTI_FIELD_TYPES = new Set(["PHONE", "EMAIL", "WEB", "IM"])
  const fields = MULTI_FIELD_TYPES.has(fieldName)
    ? { [fieldName]: [{ VALUE: suggestedValue, VALUE_TYPE: "WORK" }] }
    : { [fieldName]: suggestedValue }

  if (entityType === "deal") {
    await client.call("crm.deal.update", { id: entityId, fields })
    console.log(`[ai-rop/discrepancy] deal.update(${entityId}) ${fieldName} = "${suggestedValue}"`)
  } else if (entityType === "lead") {
    await client.call("crm.lead.update", { id: entityId, fields })
    console.log(`[ai-rop/discrepancy] lead.update(${entityId}) ${fieldName} = "${suggestedValue}"`)
  } else {
    console.warn(`[ai-rop/discrepancy] applyToBitrix: entityType="${entityType}" не поддерживается — пропускаем #${discrepancy.id}`)
  }
}

// ──────────────────────────────────────────────────────────────
// 6. Главная функция

/**
 * Запускает AI-проверку карточки CRM для звонка. Возвращает количество
 * найденных (и сохранённых) расхождений. Ошибки НЕ пробрасываются наружу —
 * модуль не должен ломать основной пайплайн (вызывается fire-and-forget).
 */
export async function detectDiscrepancies(callId: string, companyId: string, client: BitrixClient): Promise<number> {
  try {
    const loaded = await loadCallData(callId, companyId)
    if (!loaded) return 0 // выключено или нет данных

    const { call, settings } = loaded
    if (!call.transcript || call.transcript.trim().length < 50) {
      console.log(`[ai-rop/discrepancy] звонок #${callId}: транскрипт пустой или слишком короткий — пропускаем`)
      return 0
    }

    const card = await loadBitrixCard(call, settings, client)
    if (!card) return 0
    if (Object.keys(card.fields).length === 0) {
      console.log(`[ai-rop/discrepancy] звонок #${callId}: карточка Bitrix пустая — пропускаем`)
      return 0
    }

    const { discrepancies: aiDiscrepancies, model } = await detectWithAI(call.transcript, card.fields, { companyId, callId })
    const phoneDiscrepancies = detectPhoneDiscrepancyLocally(call.transcript, card.fields, { companyId, callId })
    const discrepancies = [...aiDiscrepancies, ...phoneDiscrepancies]

    if (discrepancies.length === 0) {
      console.log(`[ai-rop/discrepancy] звонок #${callId}: расхождений не найдено (AI + локальная проверка телефона)`)
      return 0
    }

    const count = await saveAndRoute(discrepancies, model, card, call, settings)
    console.log(`[ai-rop/discrepancy] звонок #${callId}: найдено ${discrepancies.length}, сохранено ${count} (порог ${settings.severityMin}+)`)
    return count
  } catch (e) {
    console.error(`[ai-rop/discrepancy] звонок #${callId} ошибка:`, (e as Error).message)
    return 0
  }
}
