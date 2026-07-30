/**
 * Единый контракт сохранения нормализованного взаимодействия в rop_calls —
 * порт call-agent lib/interaction-source.ts, переписан под Drizzle + uuid-схему.
 *
 * ГОТЧА ДЛЯ КООРДИНАТОРА: types.ts::NormalizedInteraction/SaveInteractionFn
 * (заморожены, фаза 2a — не редактирую) типизируют tenantId как `number` и
 * возврат callId как `number | null` — унаследовано от bigint PK оригинального
 * call-agent. Реальная схема (rop_calls, миграция 0276) использует uuid для
 * И tenantId (companies.id), И id звонка. lib/ai-rop/bitrix-activities.ts
 * (тоже заморожен, фаза 2a) принимает именно эту числовую SaveInteractionFn
 * в fetchEmailAndChats(client, opts, saveInteraction) — не могу её отредактировать
 * (чужая зона). Мост — toLegacySaveInteractionFn() ниже: замыкает реальный uuid
 * companyId, ИГНОРИРУЕТ n.tenantId:number (плейсхолдер оригинала) и возвращает
 * 1|null вместо настоящего uuid — в bitrix-activities.ts возврат используется
 * ТОЛЬКО как truthy-флаг успеха (см. bitrix-activities.ts:259-261, id нигде
 * дальше не используется), так что подмена безопасна. Рекомендация: в
 * следующей консолидации привести types.ts к uuid, раз схема уже такая.
 */
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, type NewRopCall } from "@/lib/db/schema"
import type {
  InteractionChannel,
  InteractionType,
  NormalizedInteraction as LegacyNormalizedInteraction,
  SaveInteractionFn as LegacySaveInteractionFn,
} from "./types"

/** Нормализованная запись для вставки в rop_calls — uuid-версия контракта (companyId вместо number tenantId). */
export interface RopNormalizedInteraction {
  /** Идентификатор в источнике (для идемпотентности, напр. bitrix activity ID). */
  externalId: string
  companyId: string
  type: InteractionType
  channel: InteractionChannel
  direction?: "in" | "out" | null

  managerId?: string | null
  managerName?: string | null

  clientPhone?: string | null
  /** rop_calls не хранит clientName отдельной колонкой (как и оригинальная `calls`
   *  таблица call-agent) — имя клиента живёт в rop_analyses.clientName после AI-разбора.
   *  Поле оставлено в контракте для параллели с типом источника, но НЕ персистится тут. */
  clientName?: string | null

  bitrixDealId?: string | null
  bitrixLeadId?: string | null
  bitrixContactId?: string | null
  bitrixActivityId?: string | null

  startedAt?: string | null // ISO timestamp
  durationSec?: number // 0 для chat/email

  recordingUrl?: string | null
  contentText?: string | null

  /** Стартовый статус (CallStatus из types.ts). По умолчанию 'pending'. */
  initialStatus?: string
}

/**
 * Сохранить нормализованную запись в rop_calls, идемпотентно по (tenantId,
 * bitrixCallId) — уникальный индекс rop_calls_tenant_bitrix_call_uniq. Для
 * не-телефонных каналов externalId кодируется как "channel:externalId" в то же
 * поле bitrixCallId (как и в оригинале — оно UNIQUE и удобно переиспользуется).
 * Возвращает id созданного звонка, null если уже существует (дубль).
 */
export async function saveInteraction(n: RopNormalizedInteraction): Promise<string | null> {
  const externalKey = n.channel === "bitrix_telephony" ? n.externalId : `${n.channel}:${n.externalId}`

  const [existing] = await db
    .select({ id: ropCalls.id })
    .from(ropCalls)
    .where(and(eq(ropCalls.tenantId, n.companyId), eq(ropCalls.bitrixCallId, externalKey)))
    .limit(1)
  if (existing) return null

  const values: NewRopCall = {
    tenantId: n.companyId,
    interactionType: n.type,
    channel: n.channel,
    contentText: n.contentText ?? null,
    bitrixCallId: externalKey,
    bitrixDealId: n.bitrixDealId ?? null,
    bitrixLeadId: n.bitrixLeadId ?? null,
    bitrixContactId: n.bitrixContactId ?? null,
    bitrixActivityId: n.bitrixActivityId ?? null,
    managerId: n.managerId ?? null,
    managerName: n.managerName ?? null,
    clientPhone: n.clientPhone ?? null,
    direction: n.direction ?? null,
    startedAt: n.startedAt ? new Date(n.startedAt) : null,
    durationSec: n.durationSec ?? 0,
    recordingUrl: n.recordingUrl ?? null,
    status: n.initialStatus ?? "pending",
    attempts: 0,
  }

  const [created] = await db
    .insert(ropCalls)
    .values(values)
    .onConflictDoNothing({ target: [ropCalls.tenantId, ropCalls.bitrixCallId] })
    .returning({ id: ropCalls.id })
  return created?.id ?? null
}

/** Мост к устаревшему числовому контракту SaveInteractionFn — см. docblock файла. */
export function toLegacySaveInteractionFn(companyId: string): LegacySaveInteractionFn {
  return async (n: LegacyNormalizedInteraction) => {
    const created = await saveInteraction({
      externalId: n.externalId,
      companyId,
      type: n.type,
      channel: n.channel,
      direction: n.direction,
      managerId: n.managerId,
      managerName: n.managerName,
      clientPhone: n.clientPhone,
      bitrixDealId: n.bitrixDealId,
      bitrixLeadId: n.bitrixLeadId,
      bitrixContactId: n.bitrixContactId,
      bitrixActivityId: n.bitrixActivityId,
      startedAt: n.startedAt,
      durationSec: n.durationSec,
      recordingUrl: n.recordingUrl,
      contentText: n.contentText,
      initialStatus: n.initialStatus,
    })
    return created ? 1 : null
  }
}
