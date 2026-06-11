import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies, type PostDemoSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { syncLiveBattleOnSave, syncLiveBattleOnDelete } from "@/lib/content-blocks/sync-live-battle"

// Verify demo exists and belongs to the user's company
async function getOwnedDemo(demoId: string, companyId: string) {
  const [row] = await db
    .select({
      id: demos.id,
      vacancyId: demos.vacancyId,
      kind: demos.kind,
      title: demos.title,
      status: demos.status,
      lessonsJson: demos.lessonsJson,
      postDemoSettings: demos.postDemoSettings,
      sortOrder: demos.sortOrder,
      contentType: demos.contentType,
      createdAt: demos.createdAt,
      updatedAt: demos.updatedAt,
    })
    .from(demos)
    .innerJoin(vacancies, eq(demos.vacancyId, vacancies.id))
    .where(and(eq(demos.id, demoId), eq(vacancies.companyId, companyId)))
    .limit(1)

  return row ?? null
}

// GET /api/demos/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const demo = await getOwnedDemo(id, user.companyId)
    if (!demo) return apiError("Демо не найдено", 404)

    return apiSuccess(demo)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id] GET] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// PUT /api/demos/[id] — обновить { title?, status?, lessons_json? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const existing = await getOwnedDemo(id, user.companyId)
    if (!existing) return apiError("Демо не найдено", 404)

    const body = await req.json() as {
      title?: unknown
      status?: unknown
      lessons_json?: unknown
      post_demo_settings?: unknown
      content_type?: unknown
      sort_order?: unknown
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: new Date() }

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim()
    }
    if (typeof body.status === "string" && ["draft", "published"].includes(body.status)) {
      updates.status = body.status
    }
    if (Array.isArray(body.lessons_json)) {
      updates.lessonsJson = body.lessons_json
    }
    // Этап 2.6: настройки блока «Тестовое задание» (и пр.) — мерджим с
    // существующими, чтобы частичный PUT не затирал чужие ключи postDemoSettings.
    if (body.post_demo_settings && typeof body.post_demo_settings === "object" && !Array.isArray(body.post_demo_settings)) {
      const prev = (existing.postDemoSettings && typeof existing.postDemoSettings === "object")
        ? existing.postDemoSettings as Record<string, unknown>
        : {}
      updates.postDemoSettings = { ...prev, ...(body.post_demo_settings as Record<string, unknown>) }
    }
    // Миграция 0179: content_type и sort_order для динамических блоков контента
    const CONTENT_TYPES = ["presentation", "test", "task"]
    if (typeof body.content_type === "string" && CONTENT_TYPES.includes(body.content_type)) {
      updates.contentType = body.content_type
    }
    if (typeof body.sort_order === "number" && Number.isInteger(body.sort_order) && body.sort_order >= 0) {
      updates.sortOrder = body.sort_order
    }

    const [updated] = await db
      .update(demos)
      .set(updates)
      .where(eq(demos.id, id))
      .returning()

    // Dual-write: если это динамический блок конструктора (kind='block:*')
    // и он помечен как боевой (isLiveBattle=true) — синкаем в kind='test'/'demo'.
    if (updated && updated.kind.startsWith("block:")) {
      const settings = (updated.postDemoSettings as PostDemoSettings | null) ?? null
      await syncLiveBattleOnSave({
        vacancyId:        updated.vacancyId,
        blockId:          updated.id,
        contentType:      updated.contentType,
        title:            updated.title,
        lessonsJson:      Array.isArray(updated.lessonsJson) ? updated.lessonsJson : [],
        postDemoSettings: settings,
      }).catch(e => console.error("[demos/[id] PUT] syncLiveBattle failed:", e))
    }

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id] PUT] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// POST = тот же апдейт, что PUT. navigator.sendBeacon (flush черновика демо/
// теста при уходе со страницы, hooks/use-demo.ts) умеет слать ТОЛЬКО POST —
// без этого последняя правка (баллы по вариантам, ИИ-проверка и т.п.) терялась
// при быстрой перезагрузке. Объявляем РЕАЛЬНОЙ функцией (а не `export const
// POST = PUT`) — иначе Turbopack может не зарегистрировать метод-хендлер.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return PUT(req, ctx)
}

// DELETE /api/demos/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const existing = await getOwnedDemo(id, user.companyId)
    if (!existing) return apiError("Демо не найдено", 404)

    // Dual-write: если удаляем боевой блок конструктора — переводим kind='test'/'demo' в draft.
    if (existing.kind.startsWith("block:")) {
      const settings = (existing.postDemoSettings as PostDemoSettings | null) ?? null
      await syncLiveBattleOnDelete({
        vacancyId:        existing.vacancyId,
        contentType:      existing.contentType,
        postDemoSettings: settings,
      }).catch(e => console.error("[demos/[id] DELETE] syncLiveBattle failed:", e))
    }

    await db.delete(demos).where(eq(demos.id, id))

    return apiSuccess({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id] DELETE] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
