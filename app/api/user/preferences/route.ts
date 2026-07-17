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
  // Личный override колонок списка кандидатов (Портрет/Демо/Анкета/…) поверх
  // company-default (hiring-defaults.candidateColumns) — решение владельца
  // 17.07: тумблеры активны у ВСЕХ, не только у директора (было B5 10.06).
  // Partial — храним только реально переключённые ключи.
  candidateColumns?: Record<string, boolean> | null
  // null — явный сброс выбора (вернёмся к серверному дефолту).
  listSort?: ListSortPref | null
}

const ALLOWED_VIEW_MODES = new Set(["funnel", "list", "kanban", "tiles"])

// Whitelist должен совпадать с ListSortKey из components/dashboard/list-view.tsx.
// Дублирую константой, чтобы не тянуть UI-импорт в API-роут.
const ALLOWED_LIST_SORT_KEYS = new Set([
  "favorite", "name", "aiScore", "resumeScore", "progress", "salary",
  "responseDate", "status", "city", "source",
])

// Whitelist должен совпадать с CardDisplaySettings из
// components/dashboard/card-settings.tsx (дублирую константой по той же
// причине, что и ALLOWED_LIST_SORT_KEYS — не тянуть UI-импорт в API-роут).
const ALLOWED_CANDIDATE_COLUMN_KEYS = new Set([
  "showSalary", "showSalaryFull", "showScore", "showResumeScore", "showPortraitScore",
  "showAnswersScore", "showTestScore", "showNextInterview", "showAge", "showSource",
  "showCity", "showExperience", "showSkills", "showActions", "showProgress",
  "showResponseDate", "showNameWarning",
])

function normalizeListSort(raw: unknown): ListSortPref | null | undefined {
  if (raw === null) return null
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as { key?: unknown; dir?: unknown }
  if (typeof r.key !== "string" || !ALLOWED_LIST_SORT_KEYS.has(r.key)) return undefined
  if (r.dir !== "asc" && r.dir !== "desc") return undefined
  return { key: r.key, dir: r.dir }
}

// Фильтруем произвольный объект до known-boolean-ключей (защита от мусора/
// огромных payload'ов в jsonb-колонке — по аналогии с normalizeListSort).
function normalizeCandidateColumns(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ALLOWED_CANDIDATE_COLUMN_KEYS.has(k) && typeof v === "boolean") out[k] = v
  }
  return out
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
    candidateColumns: (row.candidatesColumnsJson as Record<string, boolean> | null) ?? {},
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
    if (body.candidateColumns && typeof body.candidateColumns === "object") {
      const normalized = normalizeCandidateColumns(body.candidateColumns)
      if (normalized) patch.candidatesColumnsJson = normalized
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
