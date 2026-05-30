import { NextRequest } from "next/server"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  getTrashRetentionDays,
  setPlatformSetting,
  TRASH_RETENTION_KEY,
  TRASH_RETENTION_OPTIONS,
} from "@/lib/platform/settings"

// GET /api/admin/trash/settings — текущий срок авто-удаления Корзины (дни).
export async function GET(_req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }
  const retentionDays = await getTrashRetentionDays()
  return apiSuccess({ retentionDays, options: TRASH_RETENTION_OPTIONS })
}

// PATCH /api/admin/trash/settings — изменить срок авто-удаления (дни).
export async function PATCH(req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const body = await req.json().catch(() => ({}))
  const days = Number((body as { retentionDays?: unknown }).retentionDays)

  if (!Number.isFinite(days) || !TRASH_RETENTION_OPTIONS.includes(days as never)) {
    return apiError("Недопустимый срок хранения", 400)
  }

  await setPlatformSetting(TRASH_RETENTION_KEY, days)
  return apiSuccess({ retentionDays: days })
}
