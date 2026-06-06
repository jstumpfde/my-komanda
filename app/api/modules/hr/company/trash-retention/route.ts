import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Per-company «Корзина — срок хранения»: через сколько дней вакансия из корзины
// (deleted_at IS NOT NULL) удаляется навсегда cron'ом /api/cron/trash-cleanup.
// GET   — текущее значение.
// PATCH — сохранить { retentionDays }. Допустимы только 1/3/7/14/30/60/90.

export const ALLOWED_TRASH_RETENTION_DAYS = [1, 3, 7, 14, 30, 60, 90] as const
export const DEFAULT_TRASH_RETENTION_DAYS = 30

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({ days: companies.trashRetentionDays })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    if (!row) return apiError("Company not found", 404)
    return apiSuccess({ retentionDays: row.days ?? DEFAULT_TRASH_RETENTION_DAYS })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { retentionDays?: unknown }

    const raw = body.retentionDays
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!(ALLOWED_TRASH_RETENTION_DAYS as readonly number[]).includes(value)) {
      return apiError(
        `retentionDays должно быть одним из: ${ALLOWED_TRASH_RETENTION_DAYS.join(", ")}`,
        400,
      )
    }

    const [r] = await db.update(companies)
      .set({ trashRetentionDays: value, updatedAt: new Date() })
      .where(eq(companies.id, user.companyId))
      .returning({ id: companies.id })
    if (!r) return apiError("Company not found", 404)

    return apiSuccess({ ok: true, retentionDays: value })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PATCH /company/trash-retention]", err)
    return apiError("Internal server error", 500)
  }
}
