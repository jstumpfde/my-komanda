/**
 * CRUD сделок-нитей (rop_deal_threads) — раздел B плана SalesRadar.
 *
 * Нить (thread) — либо CRM-сделка (kind='crm', создаётся backfill'ом/
 * коннектором из bitrixDealId), либо теневая (kind='shadow', создаётся
 * attribution.ts, когда AI решает, что это новая сделка, которой ещё нет в CRM).
 *
 * profileJson — компактный профиль для AI-матчинга (DealThreadProfile из
 * lib/salesradar/types.ts). Обновляется ИНКРЕМЕНТАЛЬНО через мердж патча
 * (mergeProfile), без пересчёта по всей истории сообщений — attribution.ts
 * вызывает patchThreadProfile() после каждой успешной привязки.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropDealThreads, type NewRopDealThread, type RopDealThread } from "@/lib/db/schema"
import type { DealThreadProfile, DealThreadProfilePatch } from "./types"

/** Пустой профиль — стартовое состояние для новой нити. */
export function emptyProfile(): DealThreadProfile {
  return { products: [], keyPhrases: [], participants: [], amounts: [], objects: [], aliases: [], lastSnippets: [] }
}

const MAX_KEY_PHRASES = 20
const MAX_LAST_SNIPPETS = 3
const MAX_LIST_FIELD = 30 // products/participants/amounts/objects/aliases — не даём профилю расти бесконечно

function dedupeUnion(base: string[], add: string[] | undefined, cap: number): string[] {
  if (!add?.length) return base
  const seen = new Set(base.map((v) => v.trim().toLowerCase()).filter(Boolean))
  const result = [...base]
  for (const raw of add) {
    const v = (raw ?? "").trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(v)
  }
  // Свежие важнее старых при переполнении — обрезаем с начала (сохраняем хвост).
  return result.length > cap ? result.slice(result.length - cap) : result
}

/**
 * Мердж патча в профиль. keyPhrases — без счётчика частот в самом JSONB (тип
 * DealThreadProfile хранит только строки): аппроксимируем «частоту» через
 * порядок — при повторном упоминании фраза переставляется в конец (свежее =
 * весомее), список стрижётся до top-20 по этому порядку. Для MVP этого
 * достаточно — точная частотная модель потребовала бы отдельного jsonb-поля
 * счётчиков, чего замороженный тип DealThreadProfile не предусматривает.
 */
export function mergeProfile(base: DealThreadProfile, patch: DealThreadProfilePatch): DealThreadProfile {
  const next: DealThreadProfile = {
    products: dedupeUnion(base.products ?? [], patch.products, MAX_LIST_FIELD),
    participants: dedupeUnion(base.participants ?? [], patch.participants, MAX_LIST_FIELD),
    amounts: dedupeUnion(base.amounts ?? [], patch.amounts, MAX_LIST_FIELD),
    objects: dedupeUnion(base.objects ?? [], patch.objects, MAX_LIST_FIELD),
    aliases: dedupeUnion(base.aliases ?? [], patch.aliases, MAX_LIST_FIELD),
    keyPhrases: base.keyPhrases ?? [],
    lastSnippets: base.lastSnippets ?? [],
  }

  if (patch.keyPhrases?.length) {
    // Каждая упомянутая фраза «всплывает» в конец (recency-приближение частоты).
    let phrases = [...next.keyPhrases]
    for (const raw of patch.keyPhrases) {
      const v = (raw ?? "").trim()
      if (!v) continue
      const key = v.toLowerCase()
      phrases = phrases.filter((p) => p.toLowerCase() !== key)
      phrases.push(v)
    }
    next.keyPhrases = phrases.length > MAX_KEY_PHRASES ? phrases.slice(phrases.length - MAX_KEY_PHRASES) : phrases
  }

  if (patch.lastSnippets?.length) {
    const merged = [...next.lastSnippets, ...patch.lastSnippets.filter(Boolean)]
    next.lastSnippets = merged.slice(Math.max(0, merged.length - MAX_LAST_SNIPPETS))
  }

  return next
}

function toProfile(raw: unknown): DealThreadProfile {
  if (!raw || typeof raw !== "object") return emptyProfile()
  const p = raw as Partial<DealThreadProfile>
  return {
    products: Array.isArray(p.products) ? p.products : [],
    keyPhrases: Array.isArray(p.keyPhrases) ? p.keyPhrases : [],
    participants: Array.isArray(p.participants) ? p.participants : [],
    amounts: Array.isArray(p.amounts) ? p.amounts : [],
    objects: Array.isArray(p.objects) ? p.objects : [],
    aliases: Array.isArray(p.aliases) ? p.aliases : [],
    lastSnippets: Array.isArray(p.lastSnippets) ? p.lastSnippets : [],
  }
}

/** Создать теневую нить (AI решил "new_deal"). */
export async function createShadowThread(args: {
  companyId: string
  counterpartyId: string | null
  title?: string | null
  confidence?: number
  profile?: DealThreadProfilePatch
  createdBy?: "ai" | "human"
}): Promise<RopDealThread> {
  const profile = mergeProfile(emptyProfile(), args.profile ?? {})
  const values: NewRopDealThread = {
    companyId: args.companyId,
    counterpartyId: args.counterpartyId,
    kind: "shadow",
    title: args.title ?? null,
    status: "open",
    profileJson: profile,
    confidence: String(args.confidence ?? 0.7),
    createdBy: args.createdBy ?? "ai",
    lastActivityAt: new Date(),
  }
  const [created] = await db.insert(ropDealThreads).values(values).returning()
  return created
}

export async function getThread(threadId: string): Promise<RopDealThread | null> {
  const [row] = await db.select().from(ropDealThreads).where(eq(ropDealThreads.id, threadId)).limit(1)
  return row ?? null
}

export function threadProfile(thread: RopDealThread): DealThreadProfile {
  return toProfile(thread.profileJson)
}

/**
 * Открытые нити контрагента, свежие сверху. limit держит окно кандидатов для
 * AI-attribution разумным (профиль каждой нити ~50-100 токенов).
 */
export async function findOpenThreadsForCounterparty(
  companyId: string,
  counterpartyId: string,
  limit = 20
): Promise<RopDealThread[]> {
  return db
    .select()
    .from(ropDealThreads)
    .where(and(eq(ropDealThreads.companyId, companyId), eq(ropDealThreads.counterpartyId, counterpartyId), eq(ropDealThreads.status, "open")))
    .orderBy(desc(ropDealThreads.lastActivityAt))
    .limit(limit)
}

/** Обновить lastActivityAt (двигаем нить вперёд при каждой новой привязанной реплике). */
export async function touchThreadActivity(threadId: string, at: Date = new Date()): Promise<void> {
  await db.update(ropDealThreads).set({ lastActivityAt: at, updatedAt: new Date() }).where(eq(ropDealThreads.id, threadId))
}

/** Инкрементальный patch профиля нити — мердж, не перезапись. */
export async function patchThreadProfile(threadId: string, patch: DealThreadProfilePatch): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return
  const thread = await getThread(threadId)
  if (!thread) return
  const merged = mergeProfile(threadProfile(thread), patch)
  await db.update(ropDealThreads).set({ profileJson: merged, updatedAt: new Date() }).where(eq(ropDealThreads.id, threadId))
}

/**
 * Пометить залежавшиеся открытые нити как stale (не участвуют в каскаде
 * attribution — findOpenThreadsForCounterparty фильтрует status='open').
 * Вызывается периодически (можно раз в сутки из отдельного крона/хвоста
 * salesradar-attribute) — тут просто SQL-функция, без own крона в Ф1.
 */
export async function markStaleThreads(companyId: string, staleAfterHours = 24 * 14): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterHours * 3600_000)
  const rows = await db
    .update(ropDealThreads)
    .set({ status: "stale", updatedAt: new Date() })
    .where(
      and(
        eq(ropDealThreads.companyId, companyId),
        eq(ropDealThreads.status, "open"),
        ne(ropDealThreads.kind, "crm"), // CRM-сделки не протухают автоматически — статус ведёт CRM
        sql`${ropDealThreads.lastActivityAt} IS NOT NULL AND ${ropDealThreads.lastActivityAt} < ${cutoff}`
      )
    )
    .returning({ id: ropDealThreads.id })
  return rows.length
}
