// GET/PUT /api/modules/pricing/settings — company-level дефолты мониторинга цен.
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorSettings } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

const DEFAULTS = {
  radiusM: 1000,
  periods: [7, 14, 28, 30],
  intervalMinutes: 1440,
  runAtTime: "06:00",
  currency: "RUB",
}

const ALLOWED_CURRENCIES = new Set(["RUB", "EUR", "USD"])

export async function GET() {
  try {
    const user = await requireCompany()

    const [row] = await db
      .select()
      .from(priceMonitorSettings)
      .where(eq(priceMonitorSettings.companyId, user.companyId))
      .limit(1)

    if (!row) {
      return apiSuccess({ settings: { ...DEFAULTS, isDefault: true } })
    }

    return apiSuccess({
      settings: {
        radiusM: row.radiusM,
        periods: row.periods,
        intervalMinutes: row.intervalMinutes,
        runAtTime: row.runAtTime,
        currency: row.currency,
        isDefault: false,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()

    const body = (await req.json().catch(() => ({}))) as {
      radiusM?: number
      periods?: number[]
      intervalMinutes?: number
      runAtTime?: string
      currency?: string
    }

    if (typeof body.radiusM !== "number" || body.radiusM < 100 || body.radiusM > 20000) {
      return apiError("radiusM должен быть числом от 100 до 20000", 400)
    }
    if (!Array.isArray(body.periods) || body.periods.length === 0 || body.periods.length > 10) {
      return apiError("periods должен быть массивом от 1 до 10 чисел", 400)
    }
    for (const p of body.periods) {
      if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 365) {
        return apiError("periods: каждое значение должно быть целым числом от 1 до 365", 400)
      }
    }
    if (typeof body.intervalMinutes !== "number" || body.intervalMinutes < 15 || body.intervalMinutes > 43200) {
      return apiError("intervalMinutes должен быть числом от 15 до 43200", 400)
    }
    if (typeof body.runAtTime !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(body.runAtTime)) {
      return apiError("runAtTime должен быть в формате HH:MM", 400)
    }
    if (typeof body.currency !== "string" || !ALLOWED_CURRENCIES.has(body.currency)) {
      return apiError("currency должен быть одним из: RUB, EUR, USD", 400)
    }

    const now = new Date()
    const [upserted] = await db
      .insert(priceMonitorSettings)
      .values({
        companyId: user.companyId,
        radiusM: body.radiusM,
        periods: body.periods,
        intervalMinutes: body.intervalMinutes,
        runAtTime: body.runAtTime,
        currency: body.currency,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: priceMonitorSettings.companyId,
        set: {
          radiusM: body.radiusM,
          periods: body.periods,
          intervalMinutes: body.intervalMinutes,
          runAtTime: body.runAtTime,
          currency: body.currency,
          updatedAt: now,
        },
      })
      .returning()

    return apiSuccess({
      settings: {
        radiusM: upserted.radiusM,
        periods: upserted.periods,
        intervalMinutes: upserted.intervalMinutes,
        runAtTime: upserted.runAtTime,
        currency: upserted.currency,
        isDefault: false,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
