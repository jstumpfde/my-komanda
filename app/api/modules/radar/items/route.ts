import { NextRequest } from "next/server"
import { and, eq, ilike, or, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { radarItems, radarTopics, type RadarSource, type RadarItemStatus } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireRadarAccess } from "@/lib/radar/access"

const SOURCES: RadarSource[] = ["telegram", "instagram_saved", "instagram_dm"]
const STATUSES: RadarItemStatus[] = ["new", "apply", "skip", "later"]

// GET ?source=&topic=&status=&q=&limit=&offset=
// Лента/таблица контента владельца + дерево тем со счётчиками + сводки.
export async function GET(req: NextRequest) {
  try {
    const user = await requireRadarAccess()
    const sp = req.nextUrl.searchParams
    const source = sp.get("source") as RadarSource | null
    const topic = sp.get("topic")           // id темы или "none"
    const status = sp.get("status") as RadarItemStatus | null
    const q = (sp.get("q") || "").trim()
    const limit = Math.min(Number(sp.get("limit") || 60), 200)
    const offset = Math.max(Number(sp.get("offset") || 0), 0)

    const mine = eq(radarItems.userId, user.id)
    const where = and(
      mine,
      source && SOURCES.includes(source) ? eq(radarItems.source, source) : undefined,
      status && STATUSES.includes(status) ? eq(radarItems.status, status) : undefined,
      topic === "none" ? sql`${radarItems.topicId} is null`
        : topic ? eq(radarItems.topicId, topic) : undefined,
      q ? or(
        ilike(radarItems.title, `%${q}%`),
        ilike(radarItems.summary, `%${q}%`),
        ilike(radarItems.transcript, `%${q}%`),
        ilike(radarItems.rawText, `%${q}%`),
        ilike(radarItems.service, `%${q}%`),
        ilike(radarItems.sourceAccount, `%${q}%`),
      ) : undefined,
    )

    const items = await db.select({
      id: radarItems.id, source: radarItems.source, sourceAccount: radarItems.sourceAccount,
      viewedOn: radarItems.viewedOn, url: radarItems.url, mediaType: radarItems.mediaType,
      mediaUrl: radarItems.mediaUrl, title: radarItems.title, rawText: radarItems.rawText,
      transcript: radarItems.transcript, summary: radarItems.summary, topicId: radarItems.topicId,
      tags: radarItems.tags, service: radarItems.service, status: radarItems.status,
      pipelineStatus: radarItems.pipelineStatus, capturedAt: radarItems.capturedAt,
      createdAt: radarItems.createdAt,
    })
      .from(radarItems).where(where)
      .orderBy(desc(sql`coalesce(${radarItems.capturedAt}, ${radarItems.createdAt})`))
      .limit(limit).offset(offset)

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(radarItems).where(where)

    // Сводки (по всей моей базе, без фильтров) — для бейджей вкладок/источников.
    const byStatusRows = await db.select({ status: radarItems.status, n: sql<number>`count(*)::int` })
      .from(radarItems).where(mine).groupBy(radarItems.status)
    const bySourceRows = await db.select({ source: radarItems.source, n: sql<number>`count(*)::int` })
      .from(radarItems).where(mine).groupBy(radarItems.source)
    const byStatus = Object.fromEntries(byStatusRows.map((r) => [r.status, r.n]))
    const bySource = Object.fromEntries(bySourceRows.map((r) => [r.source, r.n]))

    // Дерево тем со счётчиками контента.
    const topics = await db.select({
      id: radarTopics.id, parentId: radarTopics.parentId, name: radarTopics.name, color: radarTopics.color,
    }).from(radarTopics).where(eq(radarTopics.companyId, user.companyId)).orderBy(radarTopics.sortOrder, radarTopics.name)
    const topicCountRows = await db.select({ topicId: radarItems.topicId, n: sql<number>`count(*)::int` })
      .from(radarItems).where(mine).groupBy(radarItems.topicId)
    const topicCount = Object.fromEntries(topicCountRows.map((r) => [r.topicId ?? "none", r.n]))
    const topicsTree = topics.map((t) => ({ ...t, count: topicCount[t.id] ?? 0 }))

    return apiSuccess({
      items, total, byStatus, bySource, topics: topicsTree,
      uncategorized: topicCount["none"] ?? 0,
    })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}

// POST — создать единицу контента вручную (также вход для воркеров-ингесторов).
// Дедуп по (source, external_id) на уровне БД; повтор — мягко игнорируем.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRadarAccess()
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const source = b.source as RadarSource
    if (!SOURCES.includes(source)) return apiError("Неизвестный источник", 400)

    const [row] = await db.insert(radarItems).values({
      companyId: user.companyId,
      userId: user.id,
      source,
      sourceAccount: (b.sourceAccount as string) ?? null,
      viewedOn: (b.viewedOn as string) ?? null,
      externalId: (b.externalId as string) ?? null,
      url: (b.url as string) ?? null,
      mediaType: (b.mediaType as string) ?? null,
      mediaUrl: (b.mediaUrl as string) ?? null,
      title: (b.title as string) ?? null,
      rawText: (b.rawText as string) ?? null,
      transcript: (b.transcript as string) ?? null,
      summary: (b.summary as string) ?? null,
      service: (b.service as string) ?? null,
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      capturedAt: b.capturedAt ? new Date(b.capturedAt as string) : null,
      raw: (b.raw as object) ?? null,
    }).onConflictDoNothing().returning({ id: radarItems.id })

    return apiSuccess({ id: row?.id ?? null, duplicate: !row })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}
