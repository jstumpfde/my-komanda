// GET — сводка по каналам: постов отправлено, кликов по трекинг-ссылкам,
// лидов (по source_chat_id), расход (постов × cost_per_post), CPL.
// Плюс строка «не определён» — лиды без source_chat_id.
import { eq, and, sql, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  telegramPostingChats,
  telegramPostDeliveries,
  telegramScheduledPosts,
  telegramPostLinks,
  telegramDmLeads,
} from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

export interface ChannelAnalyticsRow {
  chatId: string | null
  chatTitle: string
  postsSent: number
  clicks: number
  leads: number
  costPerPost: number | null
  spend: number | null
  cpl: number | null
}

export async function GET() {
  try {
    const user = await requirePlatformAdmin()
    const userId = user.id as string

    const chats = await db
      .select()
      .from(telegramPostingChats)
      .where(eq(telegramPostingChats.userId, userId))

    // Постов отправлено на чат (кол-во 'sent' deliveries, каждая = один пост
    // в этот чат) — не уникальные посты, а фактические отправки, т.к. расход
    // считается за каждое размещение.
    const deliveryCounts = await db
      .select({
        chatId: telegramPostDeliveries.chatId,
        count: sql<number>`count(*)::int`,
      })
      .from(telegramPostDeliveries)
      .innerJoin(telegramScheduledPosts, eq(telegramPostDeliveries.postId, telegramScheduledPosts.id))
      .where(and(eq(telegramScheduledPosts.userId, userId), eq(telegramPostDeliveries.status, "sent")))
      .groupBy(telegramPostDeliveries.chatId)

    const clicksByChat = await db
      .select({
        chatId: telegramPostLinks.chatId,
        clicks: sql<number>`coalesce(sum(${telegramPostLinks.clicks}), 0)::int`,
      })
      .from(telegramPostLinks)
      .innerJoin(telegramScheduledPosts, eq(telegramPostLinks.postId, telegramScheduledPosts.id))
      .where(eq(telegramScheduledPosts.userId, userId))
      .groupBy(telegramPostLinks.chatId)

    const leadsByChat = await db
      .select({
        chatId: telegramDmLeads.sourceChatId,
        count: sql<number>`count(*)::int`,
      })
      .from(telegramDmLeads)
      .where(and(eq(telegramDmLeads.userId, userId), sql`${telegramDmLeads.sourceChatId} IS NOT NULL`))
      .groupBy(telegramDmLeads.sourceChatId)

    const [{ unattributedLeads }] = await db
      .select({ unattributedLeads: sql<number>`count(*)::int` })
      .from(telegramDmLeads)
      .where(and(eq(telegramDmLeads.userId, userId), isNull(telegramDmLeads.sourceChatId)))

    const deliveryMap = new Map(deliveryCounts.map((r) => [r.chatId, r.count]))
    const clicksMap = new Map(clicksByChat.map((r) => [r.chatId, r.clicks]))
    const leadsMap = new Map(leadsByChat.map((r) => [r.chatId as string, r.count]))

    const rows: ChannelAnalyticsRow[] = chats.map((c) => {
      const postsSent = deliveryMap.get(c.id) ?? 0
      const clicks = clicksMap.get(c.id) ?? 0
      const leads = leadsMap.get(c.id) ?? 0
      const costPerPost = c.costPerPost != null ? Number(c.costPerPost) : null
      const spend = costPerPost != null ? Math.round(costPerPost * postsSent * 100) / 100 : null
      const cpl = spend != null && leads > 0 ? Math.round((spend / leads) * 100) / 100 : null
      return {
        chatId: c.id,
        chatTitle: c.title,
        postsSent,
        clicks,
        leads,
        costPerPost,
        spend,
        cpl,
      }
    })

    // Строка «не определён» — только если есть такие лиды.
    if (unattributedLeads > 0) {
      rows.push({
        chatId: null,
        chatTitle: "Не определён",
        postsSent: 0,
        clicks: 0,
        leads: unattributedLeads,
        costPerPost: null,
        spend: null,
        cpl: null,
      })
    }

    rows.sort((a, b) => b.leads - a.leads)

    const totals = rows.reduce(
      (acc, r) => ({
        postsSent: acc.postsSent + r.postsSent,
        clicks: acc.clicks + r.clicks,
        leads: acc.leads + r.leads,
        spend: acc.spend + (r.spend ?? 0),
      }),
      { postsSent: 0, clicks: 0, leads: 0, spend: 0 }
    )
    const totalCpl = totals.leads > 0 ? Math.round((totals.spend / totals.leads) * 100) / 100 : null

    return apiSuccess({ items: rows, totals: { ...totals, cpl: totalCpl } })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/analytics] GET", err)
    return apiError("Ошибка загрузки аналитики", 500)
  }
}
