/**
 * SalesRadar — агрегация для экрана «Контрагенты» (app/(modules)/ai-rop/
 * counterparties). Единая лента касаний по всем каналам (звонки rop_calls +
 * сообщения rop_messages) + «Разложено по сделкам» — ключевой визуальный
 * акцент MVP: сколько сообщений разошлось по скольким сделкам-нитям.
 *
 * Только ЧИТАЕТ таблицы — не трогает attribution.ts/threads.ts/rollup.ts.
 */
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  ropCounterparties,
  ropDealThreads,
  ropMessages,
  ropMessageDealLinks,
  ropChannelConnectors,
  ropCalls,
} from "@/lib/db/schema"

export interface CounterpartyListItem {
  id: string
  name: string | null
  kind: string
  channels: string[]
  dealCount: number
  lastActivityAt: string | null
}

export interface CounterpartyListFilters {
  companyId: string
  kind?: string
  search?: string
  limit?: number
}

export async function listCounterparties(filters: CounterpartyListFilters): Promise<CounterpartyListItem[]> {
  const { companyId, kind, search, limit = 200 } = filters
  const conditions = [eq(ropCounterparties.companyId, companyId), eq(ropCounterparties.isArchived, false)]
  if (kind && kind !== "all") conditions.push(eq(ropCounterparties.kind, kind))
  if (search?.trim()) {
    const like = `%${search.trim()}%`
    conditions.push(sql`(${ropCounterparties.name} ILIKE ${like} OR ${ropCounterparties.primaryPhone} ILIKE ${like})`)
  }

  const dealAgg = db
    .select({
      counterpartyId: ropDealThreads.counterpartyId,
      dealCount: sql<number>`count(*)`.as("deal_count"),
    })
    .from(ropDealThreads)
    .where(and(eq(ropDealThreads.companyId, companyId), sql`${ropDealThreads.mergedIntoId} IS NULL`))
    .groupBy(ropDealThreads.counterpartyId)
    .as("deal_agg")

  const channelAgg = db
    .select({
      counterpartyId: ropMessages.counterpartyId,
      channels: sql<string[]>`array_agg(distinct ${ropChannelConnectors.kind})`.as("channels"),
    })
    .from(ropMessages)
    .leftJoin(ropChannelConnectors, eq(ropChannelConnectors.id, ropMessages.connectorId))
    .where(and(eq(ropMessages.companyId, companyId), sql`${ropMessages.counterpartyId} IS NOT NULL`))
    .groupBy(ropMessages.counterpartyId)
    .as("channel_agg")

  const rows = await db
    .select({
      id: ropCounterparties.id,
      name: ropCounterparties.name,
      kind: ropCounterparties.kind,
      lastActivityAt: ropCounterparties.lastActivityAt,
      dealCount: sql<number>`coalesce(${dealAgg.dealCount}, 0)`,
      channels: sql<string[]>`coalesce(${channelAgg.channels}, '{}')`,
    })
    .from(ropCounterparties)
    .leftJoin(dealAgg, eq(dealAgg.counterpartyId, ropCounterparties.id))
    .leftJoin(channelAgg, eq(channelAgg.counterpartyId, ropCounterparties.id))
    .where(and(...conditions))
    .orderBy(desc(ropCounterparties.lastActivityAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    channels: (r.channels ?? []).filter(Boolean) as string[],
    dealCount: Number(r.dealCount ?? 0),
    lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null,
  }))
}

export interface TimelineTouch {
  id: string
  source: "call" | "message"
  channel: string // rop_calls.channel либо connector.kind
  direction: "in" | "out" | null
  text: string | null // summary звонка либо текст сообщения
  at: string
  dealThreadId: string | null
  dealThreadTitle: string | null
}

/** Разбивка «один поток сообщений разошёлся по N сделкам» — ключевой блок карточки контрагента. */
export interface DealBreakdownItem {
  dealThreadId: string
  title: string | null
  status: string
  kind: "crm" | "shadow"
  messageCount: number
}

export interface CounterpartyDetail {
  id: string
  name: string | null
  kind: string
  inn: string | null
  primaryPhone: string | null
  firstSeenAt: string
  lastActivityAt: string | null
  timeline: TimelineTouch[]
  dealBreakdown: DealBreakdownItem[]
  totalMessages: number
}

export async function getCounterpartyDetail(companyId: string, counterpartyId: string): Promise<CounterpartyDetail | null> {
  const [cp] = await db
    .select()
    .from(ropCounterparties)
    .where(and(eq(ropCounterparties.id, counterpartyId), eq(ropCounterparties.companyId, companyId)))
    .limit(1)
  if (!cp) return null

  const [messageRows, callRows, breakdownRows] = await Promise.all([
    db
      .select({
        id: ropMessages.id,
        connectorKind: ropChannelConnectors.kind,
        direction: ropMessages.direction,
        text: ropMessages.text,
        sentAt: ropMessages.sentAt,
        dealThreadId: ropMessageDealLinks.dealThreadId,
        dealThreadTitle: ropDealThreads.title,
      })
      .from(ropMessages)
      .leftJoin(ropChannelConnectors, eq(ropChannelConnectors.id, ropMessages.connectorId))
      .leftJoin(
        ropMessageDealLinks,
        and(eq(ropMessageDealLinks.messageId, ropMessages.id), sql`${ropMessageDealLinks.supersededById} IS NULL`),
      )
      .leftJoin(ropDealThreads, eq(ropDealThreads.id, ropMessageDealLinks.dealThreadId))
      .where(and(eq(ropMessages.companyId, companyId), eq(ropMessages.counterpartyId, counterpartyId)))
      .orderBy(desc(ropMessages.sentAt))
      .limit(200),
    db
      .select({
        id: ropCalls.id,
        channel: ropCalls.channel,
        direction: ropCalls.direction,
        summary: ropCalls.detectedProduct,
        startedAt: ropCalls.startedAt,
        dealThreadId: ropCalls.dealThreadId,
        dealThreadTitle: ropDealThreads.title,
      })
      .from(ropCalls)
      .leftJoin(ropDealThreads, eq(ropDealThreads.id, ropCalls.dealThreadId))
      .where(and(eq(ropCalls.tenantId, companyId), eq(ropCalls.counterpartyId, counterpartyId)))
      .orderBy(desc(ropCalls.startedAt))
      .limit(200),
    db
      .select({
        dealThreadId: ropMessageDealLinks.dealThreadId,
        title: ropDealThreads.title,
        status: ropDealThreads.status,
        kind: ropDealThreads.kind,
        messageCount: sql<number>`count(distinct ${ropMessageDealLinks.messageId})`,
      })
      .from(ropMessageDealLinks)
      .innerJoin(ropDealThreads, eq(ropDealThreads.id, ropMessageDealLinks.dealThreadId))
      .innerJoin(ropMessages, eq(ropMessages.id, ropMessageDealLinks.messageId))
      .where(
        and(
          eq(ropMessageDealLinks.companyId, companyId),
          eq(ropMessages.counterpartyId, counterpartyId),
          sql`${ropMessageDealLinks.supersededById} IS NULL`,
        ),
      )
      .groupBy(ropMessageDealLinks.dealThreadId, ropDealThreads.title, ropDealThreads.status, ropDealThreads.kind)
      .orderBy(desc(sql`count(distinct ${ropMessageDealLinks.messageId})`)),
  ])

  const timeline: TimelineTouch[] = [
    ...messageRows.map((m) => ({
      id: m.id,
      source: "message" as const,
      channel: m.connectorKind ?? "other",
      direction: m.direction as "in" | "out" | null,
      text: m.text,
      at: new Date(m.sentAt).toISOString(),
      dealThreadId: m.dealThreadId,
      dealThreadTitle: m.dealThreadTitle,
    })),
    ...callRows
      .filter((c) => c.startedAt)
      .map((c) => ({
        id: c.id,
        source: "call" as const,
        channel: c.channel,
        direction: c.direction as "in" | "out" | null,
        text: c.summary,
        at: new Date(c.startedAt as Date).toISOString(),
        dealThreadId: c.dealThreadId,
        dealThreadTitle: c.dealThreadTitle,
      })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  const dealBreakdown: DealBreakdownItem[] = breakdownRows.map((b) => ({
    dealThreadId: b.dealThreadId,
    title: b.title,
    status: b.status,
    kind: b.kind as "crm" | "shadow",
    messageCount: Number(b.messageCount ?? 0),
  }))

  return {
    id: cp.id,
    name: cp.name,
    kind: cp.kind,
    inn: cp.inn,
    primaryPhone: cp.primaryPhone,
    firstSeenAt: new Date(cp.firstSeenAt).toISOString(),
    lastActivityAt: cp.lastActivityAt ? new Date(cp.lastActivityAt).toISOString() : null,
    timeline,
    dealBreakdown,
    totalMessages: messageRows.length,
  }
}
