import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { radarItems, radarTopics } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { requireRadarAccess } from "@/lib/radar/access"

// POST — наполнить демо-данными, чтобы посмотреть Ленту/Таблицу до подключения
// источников. Срабатывает только если контента ещё нет (идемпотентно).
// Удаляется кнопкой «Очистить демо» (DELETE) — строки помечены raw.demo=true.
export async function POST() {
  try {
    const user = await requireRadarAccess()
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(radarItems).where(eq(radarItems.userId, user.id))
    if (n > 0) return apiSuccess({ skipped: true, message: "Контент уже есть — демо не добавляю." })

    const [smm] = await db.insert(radarTopics).values({ companyId: user.companyId, name: "Маркетинг", color: "#7c3aed" }).returning()
    const [reels] = await db.insert(radarTopics).values({ companyId: user.companyId, parentId: smm.id, name: "Reels / SMM" }).returning()
    const [b2b] = await db.insert(radarTopics).values({ companyId: user.companyId, parentId: smm.id, name: "B2B / привлечение" }).returning()

    await db.insert(radarItems).values([
      {
        companyId: user.companyId, userId: user.id, source: "telegram", sourceAccount: "@smm_secrets",
        url: "https://t.me/smm_secrets/1234", mediaType: "text", title: "3 хука для Reels в первые 2 секунды",
        summary: "Удержание растёт, если в первом кадре — конфликт или вопрос. Разбор 3 шаблонов хука и как их адаптировать под нишу.",
        transcript: "В первые две секунды зритель решает — смотреть или листать дальше...",
        topicId: reels.id, tags: ["reels", "хуки", "удержание"], service: "—", status: "new",
        pipelineStatus: "categorized", capturedAt: new Date("2026-06-27T10:00:00Z"), raw: { demo: true },
      },
      {
        companyId: user.companyId, userId: user.id, source: "instagram_saved", sourceAccount: "@growth.alex",
        viewedOn: "@my_main", url: "https://instagram.com/reel/abc", mediaType: "video",
        title: "Воронка прогрева для B2B через карусели",
        summary: "Карусель ведёт на лид-магнит, дальше Директ-бот по промослову. Логика прогрева и пример оффера.",
        transcript: "Смотрите, мы берём холодную аудиторию и через серию каруселей...",
        topicId: b2b.id, tags: ["b2b", "воронка", "лид-магнит"], service: "ManyChat", status: "apply",
        pipelineStatus: "categorized", capturedAt: new Date("2026-06-26T14:30:00Z"), raw: { demo: true },
      },
      {
        companyId: user.companyId, userId: user.id, source: "instagram_dm", sourceAccount: "@content.maria",
        url: "https://t.me/maria_guides", mediaType: "link", title: "Гайд по промослову «РОСТ» → ссылка в Telegram",
        summary: "Прислали по промослову: гайд из 12 шагов по раскачке аккаунта. Внутри — чек-лист и шаблоны сторис.",
        topicId: reels.id, tags: ["гайд", "промослово", "сторис"], service: "Telegram", status: "later",
        pipelineStatus: "transcribed", capturedAt: new Date("2026-06-25T09:15:00Z"), raw: { demo: true },
      },
    ])

    return apiSuccess({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}

// DELETE — снести демо-данные (строки raw.demo=true и их демо-темы).
export async function DELETE() {
  try {
    const user = await requireRadarAccess()
    await db.delete(radarItems).where(and(eq(radarItems.userId, user.id), sql`${radarItems.raw}->>'demo' = 'true'`))
    return apiSuccess({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return apiError((e as Error).message || "Ошибка", 500)
  }
}
