// GET /api/modules/pricing/objects/[id]/forward — «Цены вперёд»: последний
// срез помесячного семпла гостевой цены нашего объекта на 6 месяцев вперёд.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorObjects } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { loadLatestForward } from "@/lib/price-monitor/forward-prices"

const MONTH_LABELS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
]

function monthLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateIso
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await ctx.params

    const [object] = await db
      .select()
      .from(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, user.companyId)))
      .limit(1)
    if (!object) return apiError("Объект не найден", 404)

    const forward = await loadLatestForward(object.id)

    return apiSuccess({
      nights: forward.nights,
      currency: forward.currency,
      points: forward.points.map((p) => ({
        checkinDate: p.checkinDate,
        monthLabel: monthLabel(p.checkinDate),
        pricePerNight: p.pricePerNight,
        priceTotal: p.priceTotal,
        available: p.available,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
