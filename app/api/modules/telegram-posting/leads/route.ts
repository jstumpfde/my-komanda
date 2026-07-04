// GET ?source=&limit= — список лидов из входящих ЛС (авто-атрибуция userbot).
// source: id чата telegram_posting_chats, "none" — лиды без определённого источника.
import { NextRequest } from "next/server"
import { and, eq, desc, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramDmLeads, telegramPostingChats } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const source = req.nextUrl.searchParams.get("source")
    const limitParam = Number(req.nextUrl.searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT

    const conditions = [eq(telegramDmLeads.userId, user.id as string)]
    if (source === "none") {
      conditions.push(isNull(telegramDmLeads.sourceChatId))
    } else if (source) {
      conditions.push(eq(telegramDmLeads.sourceChatId, source))
    }

    const rows = await db
      .select({
        id:                telegramDmLeads.id,
        tgUserId:          telegramDmLeads.tgUserId,
        tgUsername:        telegramDmLeads.tgUsername,
        displayName:       telegramDmLeads.displayName,
        firstMessageAt:    telegramDmLeads.firstMessageAt,
        firstMessageText:  telegramDmLeads.firstMessageText,
        sourceChatId:      telegramDmLeads.sourceChatId,
        sourceConfidence:  telegramDmLeads.sourceConfidence,
        candidateChatIds:  telegramDmLeads.candidateChatIds,
        notes:             telegramDmLeads.notes,
        createdAt:         telegramDmLeads.createdAt,
        sourceChatTitle:   telegramPostingChats.title,
      })
      .from(telegramDmLeads)
      .leftJoin(telegramPostingChats, eq(telegramDmLeads.sourceChatId, telegramPostingChats.id))
      .where(and(...conditions))
      .orderBy(desc(telegramDmLeads.firstMessageAt))
      .limit(limit)

    // Для лидов с несколькими кандидатами (source_confidence='ambiguous')
    // подтягиваем названия чатов-кандидатов — UI покажет их во всплывающей
    // подсказке, чтобы владелец выбирал одним кликом из своих же чатов.
    const allChats = await db
      .select({ id: telegramPostingChats.id, title: telegramPostingChats.title })
      .from(telegramPostingChats)
      .where(eq(telegramPostingChats.userId, user.id as string))
    const chatTitleById = new Map(allChats.map((c) => [c.id, c.title]))

    const items = rows.map((r) => ({
      ...r,
      candidateChatTitles: Array.isArray(r.candidateChatIds)
        ? (r.candidateChatIds as string[]).map((id) => chatTitleById.get(id) ?? "?")
        : null,
    }))

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(telegramDmLeads)
      .where(eq(telegramDmLeads.userId, user.id as string))

    return apiSuccess({ items, total: count })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/leads] GET", err)
    return apiError("Ошибка загрузки лидов", 500)
  }
}
