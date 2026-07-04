// GET ?category= — список отложенных постов владельца платформы.
// POST — создать новый отложенный пост.
import { NextRequest } from "next/server"
import { and, eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { telegramScheduledPosts } from "@/lib/db/schema"
import { apiError, apiSuccess, requirePlatformAdmin } from "@/lib/api-helpers"

const ALLOWED_CATEGORIES = new Set(["vacancy", "product"])
const ALLOWED_REPEAT = new Set(["none", "daily", "weekly"])
const MAX_STAGGER_MINUTES = 480 // 8ч — не ломает DELIVERY_WINDOW_MS (12ч) в sender.ts

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const category = req.nextUrl.searchParams.get("category")

    const where = category
      ? and(eq(telegramScheduledPosts.userId, user.id as string), eq(telegramScheduledPosts.category, category))
      : eq(telegramScheduledPosts.userId, user.id as string)

    const items = await db
      .select()
      .from(telegramScheduledPosts)
      .where(where)
      .orderBy(desc(telegramScheduledPosts.scheduledAt))

    return apiSuccess({ items })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/posts] GET", err)
    return apiError("Ошибка загрузки постов", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePlatformAdmin()
    const body = await req.json().catch(() => ({}))

    const category = body.category
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const bodyText = typeof body.body === "string" ? body.body : ""
    const chatIds = Array.isArray(body.chat_ids) ? body.chat_ids : []
    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null
    const repeatRule = body.repeat_rule ?? "none"
    const imagePath = typeof body.image_path === "string" && body.image_path ? body.image_path : null
    const linkUrl = typeof body.link_url === "string" && body.link_url.trim() ? body.link_url.trim() : null
    const staggerMinutesRaw = body.stagger_minutes
    const staggerMinutes = staggerMinutesRaw === undefined || staggerMinutesRaw === null ? 0 : Number(staggerMinutesRaw)

    if (!ALLOWED_CATEGORIES.has(category)) return apiError("Недопустимая категория", 400)
    if (!title) return apiError("Укажите название поста", 400)
    if (!bodyText.trim()) return apiError("Укажите текст поста", 400)
    if (chatIds.length === 0) return apiError("Выберите хотя бы один чат", 400)
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return apiError("Укажите дату и время публикации", 400)
    if (!ALLOWED_REPEAT.has(repeatRule)) return apiError("Недопустимое правило повтора", 400)
    if (!Number.isFinite(staggerMinutes) || staggerMinutes < 0 || staggerMinutes > MAX_STAGGER_MINUTES) {
      return apiError(`Разнесение по времени — от 0 до ${MAX_STAGGER_MINUTES} мин.`, 400)
    }

    const [created] = await db
      .insert(telegramScheduledPosts)
      .values({
        userId: user.id as string,
        category,
        title,
        body: bodyText,
        imagePath,
        linkUrl,
        staggerMinutes,
        chatIds,
        scheduledAt,
        repeatRule,
        status: "scheduled",
      })
      .returning()

    return apiSuccess({ item: created }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-posting/posts] POST", err)
    return apiError("Не удалось создать пост", 500)
  }
}
