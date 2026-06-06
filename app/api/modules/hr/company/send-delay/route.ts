import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Per-company «Безопасность отправки сообщений»: минимальная задержка между
// отправками follow-up касаний в hh-чат (секунды).
// GET   — текущее значение.
// PATCH — сохранить { sendDelaySeconds }. Валидация 21..600.

export const MIN_SEND_DELAY_SECONDS = 21
export const MAX_SEND_DELAY_SECONDS = 600
export const DEFAULT_SEND_DELAY_SECONDS = 31

export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select({ seconds: companies.followUpSendDelaySeconds })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    if (!row) return apiError("Company not found", 404)
    return apiSuccess({ sendDelaySeconds: row.seconds ?? DEFAULT_SEND_DELAY_SECONDS })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { sendDelaySeconds?: unknown }

    const raw = body.sendDelaySeconds
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return apiError("sendDelaySeconds должно быть целым числом", 400)
    }
    if (value < MIN_SEND_DELAY_SECONDS || value > MAX_SEND_DELAY_SECONDS) {
      return apiError(
        `sendDelaySeconds должно быть в диапазоне ${MIN_SEND_DELAY_SECONDS}..${MAX_SEND_DELAY_SECONDS}`,
        400,
      )
    }

    const [r] = await db.update(companies)
      .set({ followUpSendDelaySeconds: value, updatedAt: new Date() })
      .where(eq(companies.id, user.companyId))
      .returning({ id: companies.id })
    if (!r) return apiError("Company not found", 404)

    return apiSuccess({ ok: true, sendDelaySeconds: value })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[PATCH /company/send-delay]", err)
    return apiError("Internal server error", 500)
  }
}
