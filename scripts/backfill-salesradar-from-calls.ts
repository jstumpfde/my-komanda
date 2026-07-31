/**
 * scripts/backfill-salesradar-from-calls.ts
 *
 * SalesRadar (Фаза 1, шаг 1) — идемпотентный backfill новых таблиц из
 * существующих rop_calls. Материализует то, что раньше считалось на лету:
 *
 *   1. rop_counterparties + rop_counterparty_identities (kind='phone') из
 *      DISTINCT normalizePhone(client_phone) по rop_calls.
 *   2. rop_deal_threads(kind='crm') из DISTINCT bitrix_deal_id (+ title из
 *      bitrix_deal_title).
 *   3. rop_message_deal_links(method='crm_explicit', confidence=1.0,
 *      interaction_id=rop_calls.id) для всех rop_calls с bitrix_deal_id.
 *   4. Проставляет rop_calls.counterparty_id / rop_calls.deal_thread_id.
 *
 * Идемпотентность: identities — UNIQUE(company_id, kind, value), deal_threads
 * — partial UNIQUE(company_id, bitrix_deal_id), message_deal_links — partial
 * UNIQUE(message_id) НЕ применяется тут (у нас interaction_id, не message_id),
 * поэтому шаг 3 сам проверяет существование активной привязки перед вставкой.
 * Повторный запуск не плодит дублей и просто дозаполняет новые звонки.
 *
 * По умолчанию DRY-RUN (только печатает, что будет сделано). Запись — флаг --apply.
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-salesradar-from-calls.ts
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-salesradar-from-calls.ts --apply
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-salesradar-from-calls.ts --apply --company=<uuid>
 */

import { and, eq, isNull, isNotNull, sql } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import {
  ropCalls,
  ropCounterparties,
  ropCounterpartyIdentities,
  ropDealThreads,
  ropMessageDealLinks,
} from "@/lib/db/schema"
import { normalizePhone } from "@/lib/ai-rop/pii-mask"

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const companyArg = args.find((a) => a.startsWith("--company="))
const ONLY_COMPANY = companyArg ? companyArg.split("=")[1] : null

function log(...parts: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...parts)
}

async function main() {
  log(`старт backfill SalesRadar. режим: ${APPLY ? "APPLY (пишем в БД)" : "DRY-RUN (только считаем)"}${ONLY_COMPANY ? `, компания=${ONLY_COMPANY}` : ""}`)

  const companyFilter = ONLY_COMPANY ? eq(ropCalls.tenantId, ONLY_COMPANY) : undefined

  // ---- Шаг 1: контрагенты + phone-identities ----
  const phoneRows = await db
    .select({
      companyId: ropCalls.tenantId,
      clientPhone: ropCalls.clientPhone,
    })
    .from(ropCalls)
    .where(companyFilter ? and(isNotNull(ropCalls.clientPhone), companyFilter) : isNotNull(ropCalls.clientPhone))

  const phoneKey = (companyId: string, phone: string) => `${companyId}::${phone}`
  const distinctPhones = new Map<string, { companyId: string; phone: string }>()
  for (const r of phoneRows) {
    if (!r.clientPhone) continue
    const normalized = normalizePhone(r.clientPhone)
    if (!normalized) continue
    const key = phoneKey(r.companyId, normalized)
    if (!distinctPhones.has(key)) distinctPhones.set(key, { companyId: r.companyId, phone: normalized })
  }
  log(`шаг 1: ${distinctPhones.size} уникальных пар (компания, телефон) для контрагентов`)

  let createdCounterparties = 0
  let createdIdentities = 0
  const counterpartyIdByPhoneKey = new Map<string, string>()

  for (const { companyId, phone } of distinctPhones.values()) {
    // уже есть identity на этот телефон?
    const existingIdentity = await db
      .select({ counterpartyId: ropCounterpartyIdentities.counterpartyId })
      .from(ropCounterpartyIdentities)
      .where(
        and(
          eq(ropCounterpartyIdentities.companyId, companyId),
          eq(ropCounterpartyIdentities.kind, "phone"),
          eq(ropCounterpartyIdentities.value, phone),
        ),
      )
      .limit(1)

    if (existingIdentity.length > 0) {
      counterpartyIdByPhoneKey.set(phoneKey(companyId, phone), existingIdentity[0].counterpartyId)
      continue
    }

    if (!APPLY) {
      createdCounterparties++
      createdIdentities++
      continue
    }

    const [counterparty] = await db
      .insert(ropCounterparties)
      .values({
        companyId,
        kind: "client",
        primaryPhone: phone,
      })
      .returning({ id: ropCounterparties.id })

    // на случай гонки — ON CONFLICT DO NOTHING по уникальному индексу, затем перечитать
    const insertedIdentity = await db
      .insert(ropCounterpartyIdentities)
      .values({
        companyId,
        counterpartyId: counterparty.id,
        kind: "phone",
        value: phone,
        confidence: "1.0",
        source: "backfill",
      })
      .onConflictDoNothing({
        target: [ropCounterpartyIdentities.companyId, ropCounterpartyIdentities.kind, ropCounterpartyIdentities.value],
      })
      .returning({ counterpartyId: ropCounterpartyIdentities.counterpartyId })

    const finalCounterpartyId = insertedIdentity[0]?.counterpartyId ?? counterparty.id
    counterpartyIdByPhoneKey.set(phoneKey(companyId, phone), finalCounterpartyId)
    createdCounterparties++
    createdIdentities++
  }
  log(`шаг 1: контрагентов создано=${createdCounterparties}, identities создано=${createdIdentities}`)

  // ---- Шаг 2: сделки-нити (kind='crm') из bitrix_deal_id ----
  const dealRows = await db
    .select({
      companyId: ropCalls.tenantId,
      bitrixDealId: ropCalls.bitrixDealId,
      bitrixDealTitle: ropCalls.bitrixDealTitle,
    })
    .from(ropCalls)
    .where(companyFilter ? and(isNotNull(ropCalls.bitrixDealId), companyFilter) : isNotNull(ropCalls.bitrixDealId))

  const dealKey = (companyId: string, dealId: string) => `${companyId}::${dealId}`
  const distinctDeals = new Map<string, { companyId: string; bitrixDealId: string; title: string | null }>()
  for (const r of dealRows) {
    if (!r.bitrixDealId) continue
    const key = dealKey(r.companyId, r.bitrixDealId)
    if (!distinctDeals.has(key)) {
      distinctDeals.set(key, { companyId: r.companyId, bitrixDealId: r.bitrixDealId, title: r.bitrixDealTitle })
    }
  }
  log(`шаг 2: ${distinctDeals.size} уникальных сделок Bitrix`)

  let createdDealThreads = 0
  const dealThreadIdByKey = new Map<string, string>()

  for (const { companyId, bitrixDealId, title } of distinctDeals.values()) {
    const existing = await db
      .select({ id: ropDealThreads.id })
      .from(ropDealThreads)
      .where(and(eq(ropDealThreads.companyId, companyId), eq(ropDealThreads.bitrixDealId, bitrixDealId)))
      .limit(1)

    if (existing.length > 0) {
      dealThreadIdByKey.set(dealKey(companyId, bitrixDealId), existing[0].id)
      continue
    }

    if (!APPLY) {
      createdDealThreads++
      continue
    }

    const [thread] = await db
      .insert(ropDealThreads)
      .values({
        companyId,
        kind: "crm",
        bitrixDealId,
        title: title ?? `Сделка ${bitrixDealId}`,
        status: "open",
        confidence: "1.0",
        createdBy: "crm",
      })
      .onConflictDoNothing({
        target: [ropDealThreads.companyId, ropDealThreads.bitrixDealId],
      })
      .returning({ id: ropDealThreads.id })

    let finalId = thread?.id
    if (!finalId) {
      const reread = await db
        .select({ id: ropDealThreads.id })
        .from(ropDealThreads)
        .where(and(eq(ropDealThreads.companyId, companyId), eq(ropDealThreads.bitrixDealId, bitrixDealId)))
        .limit(1)
      finalId = reread[0]?.id
    }
    if (finalId) dealThreadIdByKey.set(dealKey(companyId, bitrixDealId), finalId)
    createdDealThreads++
  }
  log(`шаг 2: сделок-нитей создано=${createdDealThreads}`)

  // ---- Шаг 3+4: привязки message_deal_links + проставление колонок в rop_calls ----
  const callsToLink = await db
    .select({
      id: ropCalls.id,
      companyId: ropCalls.tenantId,
      bitrixDealId: ropCalls.bitrixDealId,
      clientPhone: ropCalls.clientPhone,
      counterpartyId: ropCalls.counterpartyId,
      dealThreadId: ropCalls.dealThreadId,
    })
    .from(ropCalls)
    .where(
      companyFilter
        ? and(companyFilter, sql`(${ropCalls.counterpartyId} IS NULL OR ${ropCalls.dealThreadId} IS NULL)`)
        : sql`(${ropCalls.counterpartyId} IS NULL OR ${ropCalls.dealThreadId} IS NULL)`,
    )

  log(`шаг 3-4: ${callsToLink.length} звонков нуждаются в проставлении counterparty_id/deal_thread_id`)

  let linksCreated = 0
  let callsUpdated = 0

  for (const call of callsToLink) {
    const normalizedPhone = call.clientPhone ? normalizePhone(call.clientPhone) : null
    const counterpartyId =
      call.counterpartyId ??
      (normalizedPhone ? counterpartyIdByPhoneKey.get(phoneKey(call.companyId, normalizedPhone)) : undefined) ??
      null

    const dealThreadId =
      call.dealThreadId ??
      (call.bitrixDealId ? dealThreadIdByKey.get(dealKey(call.companyId, call.bitrixDealId)) : undefined) ??
      null

    if (!counterpartyId && !dealThreadId) continue

    if (!APPLY) {
      if (dealThreadId && call.bitrixDealId) linksCreated++
      callsUpdated++
      continue
    }

    if (counterpartyId || dealThreadId) {
      await db
        .update(ropCalls)
        .set({
          ...(counterpartyId ? { counterpartyId } : {}),
          ...(dealThreadId ? { dealThreadId } : {}),
        })
        .where(eq(ropCalls.id, call.id))
      callsUpdated++
    }

    if (dealThreadId && call.bitrixDealId) {
      // уже есть активная (не superseded) привязка на этот interaction?
      const existingLink = await db
        .select({ id: ropMessageDealLinks.id })
        .from(ropMessageDealLinks)
        .where(and(eq(ropMessageDealLinks.interactionId, call.id), isNull(ropMessageDealLinks.supersededById)))
        .limit(1)

      if (existingLink.length === 0) {
        await db.insert(ropMessageDealLinks).values({
          companyId: call.companyId,
          interactionId: call.id,
          dealThreadId,
          confidence: "1.0",
          method: "crm_explicit",
          evidence: "backfill: rop_calls.bitrix_deal_id",
        })
        linksCreated++
      }
    }
  }
  log(`шаг 3-4: привязок создано=${linksCreated}, звонков обновлено=${callsUpdated}`)

  if (!APPLY) {
    log("DRY-RUN завершён — изменений в БД не было. Повторить с --apply для записи.")
  } else {
    log("backfill завершён.")
  }

  await pgClient.end({ timeout: 5 })
  process.exit(0)
}

main().catch(async (err) => {
  console.error("Фатальная ошибка:", err)
  try {
    await pgClient.end({ timeout: 5 })
  } catch {
    /* ignore */
  }
  process.exit(1)
})
