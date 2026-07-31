// resolveCounterparty(): склейка контрагента по identityHints через
// rop_counterparty_identities (kind='phone'|'email'|'tg_user_id'|...).
// Телефон нормализуется через lib/ai-rop/pii-mask.ts::normalizePhone — та же
// нормализация, которой backfill уже материализовал контрагентов из
// rop_calls.client_phone, поэтому склейка "старый звонок + новое письмо"
// работает бесшовно.
//
// НЕ трогать rop_deal_threads/attribution — это зона другого агента
// (attribution.ts/threads.ts).

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCounterparties, ropCounterpartyIdentities } from "@/lib/db/schema"
import { normalizePhone } from "@/lib/ai-rop/pii-mask"
import type { IdentityHints } from "./types"

export type IdentityKind =
  | "phone"
  | "email"
  | "tg_user_id"
  | "tg_username"
  | "wa_jid"
  | "vk_id"
  | "avito_chat"
  | "bitrix_contact"

export interface IdentityCandidate {
  kind: IdentityKind
  value: string
}

/** Нормализует identityHints в список кандидатов-идентификаторов (kind, value). Пустые/мусорные хинты отбрасываются. */
export function buildIdentityCandidates(hints: IdentityHints): IdentityCandidate[] {
  const out: IdentityCandidate[] = []
  if (hints.phone) {
    const normalized = normalizePhone(hints.phone)
    if (normalized.length >= 10) out.push({ kind: "phone", value: normalized })
  }
  if (hints.email) {
    const normalized = hints.email.trim().toLowerCase()
    if (normalized.includes("@")) out.push({ kind: "email", value: normalized })
  }
  if (hints.tgUserId) out.push({ kind: "tg_user_id", value: hints.tgUserId.trim() })
  if (hints.tgUsername) out.push({ kind: "tg_username", value: hints.tgUsername.trim().toLowerCase().replace(/^@/, "") })
  if (hints.waJid) out.push({ kind: "wa_jid", value: hints.waJid.trim() })
  if (hints.vkId) out.push({ kind: "vk_id", value: hints.vkId.trim() })
  if (hints.avitoChatId) out.push({ kind: "avito_chat", value: hints.avitoChatId.trim() })
  if (hints.bitrixContactId) out.push({ kind: "bitrix_contact", value: hints.bitrixContactId.trim() })
  return out
}

/**
 * Резолвит контрагента по хинтам: если хотя бы один идентификатор уже
 * привязан к контрагенту — возвращает его и доливает недостающие
 * идентификаторы (склейка новых каналов к уже известному контрагенту).
 * Если ничего не найдено — создаёт нового контрагента kind='unknown' со
 * всеми переданными идентификаторами.
 * Возвращает null, если хинтов нет вовсе (аноним без единого идентификатора).
 */
export async function resolveCounterparty(
  companyId: string,
  hints: IdentityHints,
  opts?: { source?: string; defaultKind?: "client" | "supplier" | "partner" | "internal" | "unknown"; nameHint?: string }
): Promise<string | null> {
  const candidates = buildIdentityCandidates(hints)
  if (candidates.length === 0) return null

  const source = opts?.source ?? "connector"

  const existing = await db
    .select({ counterpartyId: ropCounterpartyIdentities.counterpartyId, kind: ropCounterpartyIdentities.kind, value: ropCounterpartyIdentities.value })
    .from(ropCounterpartyIdentities)
    .where(
      and(
        eq(ropCounterpartyIdentities.companyId, companyId),
        inArray(
          ropCounterpartyIdentities.value,
          candidates.map((c) => c.value)
        )
      )
    )

  const matched = existing.find((row) => candidates.some((c) => c.kind === row.kind && c.value === row.value))

  let counterpartyId: string
  if (matched) {
    counterpartyId = matched.counterpartyId
  } else {
    const [created] = await db
      .insert(ropCounterparties)
      .values({
        companyId,
        kind: opts?.defaultKind ?? "unknown",
        name: opts?.nameHint ?? null,
        primaryPhone: candidates.find((c) => c.kind === "phone")?.value ?? null,
        lastActivityAt: new Date(),
      })
      .returning({ id: ropCounterparties.id })
    counterpartyId = created.id
  }

  // Доливаем недостающие идентификаторы (в т.ч. для только что созданного
  // контрагента) — onConflictDoNothing на случай гонки параллельных ingest.
  const missing = candidates.filter((c) => !existing.some((row) => row.kind === c.kind && row.value === c.value))
  if (missing.length > 0) {
    await db
      .insert(ropCounterpartyIdentities)
      .values(
        missing.map((c) => ({
          companyId,
          counterpartyId,
          kind: c.kind,
          value: c.value,
          source,
        }))
      )
      .onConflictDoNothing({ target: [ropCounterpartyIdentities.companyId, ropCounterpartyIdentities.kind, ropCounterpartyIdentities.value] })
  }

  return counterpartyId
}
