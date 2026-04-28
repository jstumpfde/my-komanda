import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"
import { requireAuth, apiError, apiSuccess } from "@/lib/api-helpers"

interface PreferencesPayload {
  viewMode?: string | null
  columns?: Record<string, boolean> | null
}

const ALLOWED_VIEW_MODES = new Set(["funnel", "list", "kanban", "tiles"])

async function loadOrCreate(userId: string) {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1)
  if (row) return row
  const [created] = await db.insert(userPreferences).values({ userId }).returning()
  return created
}

export async function GET() {
  try {
    const user = await requireAuth()
    const row = await loadOrCreate(user.id)
    return apiSuccess({
      viewMode: row.candidatesViewMode ?? "list",
      columns: (row.candidatesColumnsJson as Record<string, boolean> | null) ?? {},
    })
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

    if (Object.keys(patch).length === 1) {
      // Только updatedAt — невалидный запрос
      return apiError("No valid fields to update", 400)
    }

    const [updated] = await db
      .update(userPreferences)
      .set(patch)
      .where(eq(userPreferences.userId, user.id))
      .returning()

    return apiSuccess({
      viewMode: updated.candidatesViewMode ?? "list",
      columns: (updated.candidatesColumnsJson as Record<string, boolean> | null) ?? {},
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
