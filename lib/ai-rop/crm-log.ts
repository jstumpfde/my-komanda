/**
 * Журнал записей в Bitrix24 CRM (rop_crm_write_log) — реализация колбэков
 * LogCrmWriteFn/AlreadySentLiveFn, которые ждёт lib/ai-rop/bitrix-write.ts
 * (порт call-agent lib/crm-log.ts, без ленивого CREATE TABLE — схема уже
 * есть, миграция 0276).
 *
 * ГОТЧА для координатора: types.ts::CrmWriteLogEntry (заморожен, фаза 2a)
 * типизирует tenantId/callId как `number` — унаследовано от bigint PK
 * оригинального call-agent. Реальная схема (rop_crm_write_log) — uuid.
 * На практике pipeline.ts передаёт сюда настоящие uuid-строки (просто
 * TS-тип поля говорит number) — оборачиваем String(...) на границе: это
 * ничего не меняет в рантайме (String("uuid") === "uuid"), но позволяет
 * типобезопасно записать в uuid-колонку без `as unknown as`.
 */
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCrmWriteLog, type RopCrmWriteLog } from "@/lib/db/schema"
import type { CrmAction, CrmMode, CrmWriteLogEntry } from "./types"
import { makeIdempotencyKey } from "./types"

export type { CrmAction, CrmMode } from "./types"

/** Уже отправляли live с этим ключом? (дедуп перед live-вызовом в Bitrix). */
export async function alreadySentLive(idempotencyKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: ropCrmWriteLog.id })
    .from(ropCrmWriteLog)
    .where(
      and(
        eq(ropCrmWriteLog.idempotencyKey, idempotencyKey),
        eq(ropCrmWriteLog.mode, "live"),
        eq(ropCrmWriteLog.status, "sent")
      )
    )
    .limit(1)
  return !!row
}

/** Записать намерение (dry) или факт (live) CRM-записи — колбэк LogCrmWriteFn для bitrix-write.ts. */
export async function logCrmWrite(entry: CrmWriteLogEntry): Promise<void> {
  const tenantId = String(entry.tenantId)
  const callId = String(entry.callId)
  const idempotencyKey = makeIdempotencyKey(entry.callId, entry.action, entry.entityType, entry.entityId)
  await db.insert(ropCrmWriteLog).values({
    tenantId,
    callId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    mode: entry.mode,
    status: entry.status,
    payloadJson: entry.payload as object,
    resultJson: (entry.result as object) ?? null,
    idempotencyKey,
  })
}

/** Лог за период — для страницы /ai-rop/crm-log (фаза 4, не эта зона). */
export async function listCrmLog(args: {
  companyId: string
  limit?: number
  mode?: CrmMode
}): Promise<RopCrmWriteLog[]> {
  const limit = args.limit ?? 100
  const clauses = [eq(ropCrmWriteLog.tenantId, args.companyId)]
  if (args.mode) clauses.push(eq(ropCrmWriteLog.mode, args.mode))
  return db
    .select()
    .from(ropCrmWriteLog)
    .where(and(...clauses))
    .orderBy(desc(ropCrmWriteLog.createdAt))
    .limit(limit)
}
