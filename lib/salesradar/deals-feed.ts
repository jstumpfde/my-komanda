/**
 * SalesRadar — агрегация для экрана «Сделки» (app/(modules)/ai-rop/deals).
 *
 * Главная ценность MVP: показать, что переписка в ОДНОМ чате/канале на самом
 * деле относится к НЕСКОЛЬКИМ сделкам — вместо одной свалки менеджер/директор
 * видит их разъединёнными по нитям (rop_deal_threads), с историей и фактами
 * по каждой.
 *
 * ВАЖНО: этот файл только ЧИТАЕТ rop_deal_threads/rop_message_deal_links/
 * rop_messages/rop_deal_facts — не трогает attribution.ts/threads.ts/
 * rollup.ts (зона другого агента), только импортирует схему.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  ropDealThreads,
  ropCounterparties,
  ropMessages,
  ropMessageDealLinks,
  ropDealFacts,
  ropChannelConnectors,
} from "@/lib/db/schema"

export interface DealListItem {
  id: string
  title: string | null
  counterpartyId: string | null
  counterpartyName: string | null
  kind: "crm" | "shadow"
  status: string
  stage: string | null
  amount: string | null
  currency: string | null
  channels: string[] // connector kind-ы, встретившиеся в нити
  messageCount: number
  lastActivityAt: string | null
  confidence: number
}

export interface DealListFilters {
  companyId: string
  counterpartyId?: string
  status?: string // open|won|lost|stale — 'all' или не задано = все
  shadowOnly?: boolean
  channel?: string // ConnectorKind
  search?: string
  limit?: number
}

/** Список сделок-нитей компании с агрегатами (сообщений в нити, каналы). */
export async function listDealThreads(filters: DealListFilters): Promise<DealListItem[]> {
  const { companyId, counterpartyId, status, shadowOnly, channel, search, limit = 200 } = filters

  const conditions = [eq(ropDealThreads.companyId, companyId), sql`${ropDealThreads.mergedIntoId} IS NULL`]
  if (counterpartyId) conditions.push(eq(ropDealThreads.counterpartyId, counterpartyId))
  if (status && status !== "all") conditions.push(eq(ropDealThreads.status, status))
  if (shadowOnly) conditions.push(eq(ropDealThreads.kind, "shadow"))
  if (search?.trim()) {
    const like = `%${search.trim()}%`
    conditions.push(sql`(${ropDealThreads.title} ILIKE ${like} OR ${ropCounterparties.name} ILIKE ${like})`)
  }

  // Каналы + счётчик сообщений в нити — через message_deal_links → messages → connectors.
  const linkAgg = db
    .select({
      dealThreadId: ropMessageDealLinks.dealThreadId,
      messageCount: sql<number>`count(distinct ${ropMessageDealLinks.messageId})`.as("message_count"),
      channels: sql<string[]>`array_agg(distinct ${ropChannelConnectors.kind})`.as("channels"),
    })
    .from(ropMessageDealLinks)
    .leftJoin(ropMessages, eq(ropMessages.id, ropMessageDealLinks.messageId))
    .leftJoin(ropChannelConnectors, eq(ropChannelConnectors.id, ropMessages.connectorId))
    .where(and(eq(ropMessageDealLinks.companyId, companyId), sql`${ropMessageDealLinks.supersededById} IS NULL`))
    .groupBy(ropMessageDealLinks.dealThreadId)
    .as("link_agg")

  let query = db
    .select({
      id: ropDealThreads.id,
      title: ropDealThreads.title,
      counterpartyId: ropDealThreads.counterpartyId,
      counterpartyName: ropCounterparties.name,
      kind: ropDealThreads.kind,
      status: ropDealThreads.status,
      stage: ropDealThreads.stage,
      amount: ropDealThreads.amount,
      currency: ropDealThreads.currency,
      confidence: ropDealThreads.confidence,
      lastActivityAt: ropDealThreads.lastActivityAt,
      messageCount: sql<number>`coalesce(${linkAgg.messageCount}, 0)`,
      channels: sql<string[]>`coalesce(${linkAgg.channels}, '{}')`,
    })
    .from(ropDealThreads)
    .leftJoin(ropCounterparties, eq(ropCounterparties.id, ropDealThreads.counterpartyId))
    .leftJoin(linkAgg, eq(linkAgg.dealThreadId, ropDealThreads.id))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${ropDealThreads.lastActivityAt}, ${ropDealThreads.firstSeenAt})`))
    .limit(limit)
    .$dynamic()

  const rows = await query

  const filtered = channel
    ? rows.filter((r) => (r.channels ?? []).includes(channel))
    : rows

  return filtered.map((r) => ({
    id: r.id,
    title: r.title,
    counterpartyId: r.counterpartyId,
    counterpartyName: r.counterpartyName,
    kind: r.kind as "crm" | "shadow",
    status: r.status,
    stage: r.stage,
    amount: r.amount,
    currency: r.currency,
    channels: (r.channels ?? []).filter(Boolean) as string[],
    messageCount: Number(r.messageCount ?? 0),
    lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null,
    confidence: Number(r.confidence ?? 1),
  }))
}

export interface DealMessageItem {
  id: string
  connectorKind: string | null
  direction: "in" | "out" | null
  authorName: string | null
  isOurs: boolean
  text: string | null
  sentAt: string
  linkConfidence: number
  linkMethod: string
  linkEvidence: string | null
}

export interface DealFactItem {
  id: string
  kind: string
  text: string
  status: string
  severity: string | null
  dueAt: string | null
  createdAt: string
}

export interface DealThreadDetail {
  id: string
  title: string | null
  kind: "crm" | "shadow"
  status: string
  stage: string | null
  amount: string | null
  currency: string | null
  createdBy: string
  confidence: number
  bitrixDealId: string | null
  bitrixLeadId: string | null
  firstSeenAt: string
  lastActivityAt: string | null
  counterparty: { id: string; name: string | null; kind: string } | null
  messages: DealMessageItem[]
  facts: DealFactItem[]
}

/** Карточка сделки: шапка + вся лента сообщений нити + факты. company-scoped. */
export async function getDealThreadDetail(companyId: string, dealThreadId: string): Promise<DealThreadDetail | null> {
  const [thread] = await db
    .select()
    .from(ropDealThreads)
    .where(and(eq(ropDealThreads.id, dealThreadId), eq(ropDealThreads.companyId, companyId)))
    .limit(1)
  if (!thread) return null

  const counterparty = thread.counterpartyId
    ? (
        await db
          .select({ id: ropCounterparties.id, name: ropCounterparties.name, kind: ropCounterparties.kind })
          .from(ropCounterparties)
          .where(eq(ropCounterparties.id, thread.counterpartyId))
          .limit(1)
      )[0] ?? null
    : null

  const messageRows = await db
    .select({
      id: ropMessages.id,
      connectorKind: ropChannelConnectors.kind,
      direction: ropMessages.direction,
      authorName: ropMessages.authorName,
      isOurs: ropMessages.isOurs,
      text: ropMessages.text,
      sentAt: ropMessages.sentAt,
      linkConfidence: ropMessageDealLinks.confidence,
      linkMethod: ropMessageDealLinks.method,
      linkEvidence: ropMessageDealLinks.evidence,
    })
    .from(ropMessageDealLinks)
    .innerJoin(ropMessages, eq(ropMessages.id, ropMessageDealLinks.messageId))
    .leftJoin(ropChannelConnectors, eq(ropChannelConnectors.id, ropMessages.connectorId))
    .where(
      and(
        eq(ropMessageDealLinks.dealThreadId, dealThreadId),
        eq(ropMessageDealLinks.companyId, companyId),
        sql`${ropMessageDealLinks.supersededById} IS NULL`,
      ),
    )
    .orderBy(asc(ropMessages.sentAt))

  const factRows = await db
    .select()
    .from(ropDealFacts)
    .where(and(eq(ropDealFacts.dealThreadId, dealThreadId), eq(ropDealFacts.companyId, companyId)))
    .orderBy(desc(ropDealFacts.createdAt))

  return {
    id: thread.id,
    title: thread.title,
    kind: thread.kind as "crm" | "shadow",
    status: thread.status,
    stage: thread.stage,
    amount: thread.amount,
    currency: thread.currency,
    createdBy: thread.createdBy,
    confidence: Number(thread.confidence ?? 1),
    bitrixDealId: thread.bitrixDealId,
    bitrixLeadId: thread.bitrixLeadId,
    firstSeenAt: new Date(thread.firstSeenAt).toISOString(),
    lastActivityAt: thread.lastActivityAt ? new Date(thread.lastActivityAt).toISOString() : null,
    counterparty,
    messages: messageRows.map((m) => ({
      id: m.id,
      connectorKind: m.connectorKind,
      direction: m.direction as "in" | "out" | null,
      authorName: m.authorName,
      isOurs: m.isOurs,
      text: m.text,
      sentAt: new Date(m.sentAt).toISOString(),
      linkConfidence: Number(m.linkConfidence ?? 1),
      linkMethod: m.linkMethod,
      linkEvidence: m.linkEvidence,
    })),
    facts: factRows.map((f) => ({
      id: f.id,
      kind: f.kind,
      text: f.text,
      status: f.status,
      severity: f.severity,
      dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
      createdAt: new Date(f.createdAt).toISOString(),
    })),
  }
}

/** Есть ли у компании хотя бы один подключённый канал — для пустого состояния списков. */
export async function hasAnyConnector(companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: ropChannelConnectors.id })
    .from(ropChannelConnectors)
    .where(eq(ropChannelConnectors.companyId, companyId))
    .limit(1)
  return !!row
}
