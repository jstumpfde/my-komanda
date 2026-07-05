// POST /api/modules/pricing/objects/[id]/run — ручной прогон мониторинга объекта сейчас.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorObjects } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { assertPriceMonitorModule } from "@/lib/price-monitor/entitlement"
import { runObjectMonitor } from "@/lib/price-monitor/run-monitor"

export const maxDuration = 300

const MIN_INTERVAL_MS = 5 * 60_000

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    await assertPriceMonitorModule(user.companyId)
    const { id } = await ctx.params

    const [object] = await db
      .select()
      .from(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, user.companyId)))
      .limit(1)
    if (!object) return apiError("Объект не найден", 404)

    if (object.lastCheckedAt && Date.now() - object.lastCheckedAt.getTime() < MIN_INTERVAL_MS) {
      return apiError("Слишком часто, подождите пару минут", 429)
    }

    const result = await runObjectMonitor(object)

    return apiSuccess({ result })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
