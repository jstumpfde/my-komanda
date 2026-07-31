// ingestMessages(): идемпотентная запись NormalizedMessage[] в rop_messages
// + identity resolution (identity.ts). Общая точка входа для pull-крона
// (salesradar-pull) и webhook-роута — оба нормализуют через connector и
// зовут это один раз на батч.
//
// НЕ трогает rop_deal_threads/rop_message_deal_links/rollup в rop_calls —
// это attribution.ts/rollup.ts другого агента. ingestMessages только пишет
// rop_messages с attributionStatus='pending', дальше подхватывает их крон
// атрибуции (не в этой зоне).

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropChannelConnectors, ropCounterparties, ropMessages } from "@/lib/db/schema"
import { resolveCounterparty } from "./identity"
import type { NormalizedMessage } from "./types"

export interface IngestResult {
  inserted: number
  skipped: number
  errors: string[]
}

/**
 * Пишет батч нормализованных сообщений одного коннектора. Идемпотентность —
 * UNIQUE(connectorId, externalId) на rop_messages: повторная вставка того же
 * externalId молча пропускается (onConflictDoNothing), безопасно звать
 * повторно при ретраях pull/webhook.
 */
export async function ingestMessages(companyId: string, connectorId: string, messages: NormalizedMessage[]): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, errors: [] }
  if (messages.length === 0) return result

  for (const msg of messages) {
    try {
      let counterpartyId: string | null = null
      try {
        counterpartyId = await resolveCounterparty(companyId, msg.identityHints, {
          source: "connector",
          nameHint: msg.author.name,
        })
      } catch (e) {
        // identity resolution не должна блокировать запись сырого сообщения —
        // без counterpartyId оно всё равно попадёт в rop_messages и его можно
        // будет доклеить вручную/повторной атрибуцией позже.
        result.errors.push(`identity(${msg.externalId}): ${e instanceof Error ? e.message : String(e)}`)
      }

      const inserted = await db
        .insert(ropMessages)
        .values({
          companyId,
          connectorId,
          threadKey: msg.threadKey,
          externalId: msg.externalId,
          counterpartyId,
          direction: msg.direction,
          authorExternalId: msg.author.externalId ?? null,
          authorName: msg.author.name ?? null,
          isOurs: msg.author.isOurs,
          text: msg.text,
          attachmentsJson: msg.attachments.length > 0 ? msg.attachments : null,
          sentAt: msg.sentAt,
          attributionStatus: "pending",
        })
        .onConflictDoNothing({ target: [ropMessages.connectorId, ropMessages.externalId] })
        .returning({ id: ropMessages.id })

      if (inserted.length > 0) {
        result.inserted++
        if (counterpartyId) {
          await db.update(ropCounterparties).set({ lastActivityAt: msg.sentAt, updatedAt: new Date() }).where(eq(ropCounterparties.id, counterpartyId))
        }
      } else {
        result.skipped++
      }
    } catch (e) {
      result.errors.push(`${msg.externalId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}

/** Обновляет статус/курсор/ошибку коннектора после pull-прогона или webhook-приёма. */
export async function markConnectorSync(connectorId: string, patch: { cursor?: unknown; status?: "active" | "error"; error?: string | null }): Promise<void> {
  await db
    .update(ropChannelConnectors)
    .set({
      ...(patch.cursor !== undefined ? { cursorJson: patch.cursor } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      lastError: patch.error ?? null,
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ropChannelConnectors.id, connectorId))
}
