import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

interface ListSortPref {
  key: string
  dir: "asc" | "desc"
}

interface PreferencesPayload {
  viewMode?: string | null
  columns?: Record<string, boolean> | null
  // null — явный сброс выбора (вернёмся к серверному дефолту).
  listSort?: ListSortPref | null
}

const ALLOWED_VIEW_MODES = new Set(["funnel", "list", "kanban", "tiles"])

// Whitelist должен совпадать с ListSortKey из components/dashboard/list-view.tsx.
// Дублирую константой, чтобы не тянуть UI-импорт в API-роут.
const ALLOWED_LIST_SORT_KEYS = new Set([
  "favorite", "name", "aiScore", "progress", "salary",
  "responseDate", "status", "city", "source",
])

function normalizeListSort(raw: unknown): ListSortPref | null | undefined {
  if (raw === null) return null
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as { key?: unknown; dir?: unknown }
  if (typeof r.key !== "string" || !ALLOWED_LIST_SORT_KEYS.has(r.key)) return undefined
  if (r.dir !== "asc" && r.dir !== "desc") return undefined
  return { key: r.key, dir: r.dir }
}

async function loadOrCreate(userId: string) {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1)
  if (row) return row
  const [created] = await db.insert(userPreferences).values({ userId }).returning()
  return created
}

function serialize(row: typeof userPreferences.$inferSelect) {
  return {
    viewMode: row.candidatesViewMode ?? "list",
    columns: (row.candidatesColumnsJson as Record<string, boolean> | null) ?? {},
    listSort: (row.candidatesListSortJson as ListSortPref | null) ?? null,
  }
}

export async function GET() {
  try {
    const user = await requireAuth()
    const row = await loadOrCreate(user.id)
    return apiSuccess(serialize(row))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = (await req.json().catch(() => ({}))) as PreferencesPayload

    await loadOrCreate(user.id)

    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.viewMode === "string" && ALLOWED_VIEW_MODES.has(body.viewMode)) {
      patch.candidatesViewMode = body.viewMode
    }
    if (body.columns && typeof body.columns === "object") {
      patch.candidatesColumnsJson = body.columns
    }
    if ("listSort" in body) {
      // null → явный сброс; объект → валидируем; всё остальное игнорируем.
      const normalized = normalizeListSort(body.listSort)
      if (normalized !== undefined) {
        patch.candidatesListSortJson = normalized
      }
    }

    if (Object.keys(patch).length === 1) {
      // Только updatedAt — невалидный запрос
      return apiError("No valid fields to update", 400)
    }

    const [updated] = await db
      .update(userPreferences)
      .set(patch)
      .where(eq(userPreferences.userId, user.id))
      .returning()

    return apiSuccess(serialize(updated))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
