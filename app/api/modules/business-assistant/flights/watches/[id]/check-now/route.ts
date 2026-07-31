import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { flightPriceWatches } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { checkSingleWatch } from "@/lib/business-assistant/flights/check-watch"

type Ctx = { params: Promise<{ id: string }> }

// POST — «Проверить сейчас»: прогоняет ОДИН watch немедленно (та же логика,
// что и крон — checkSingleWatch), не дожидаясь расписания. Дедуп уведомлений
// (6ч) внутри checkSingleWatch по-прежнему действует — повторный клик подряд
// не наспамит новых уведомлений/TG-сообщений, просто обновит last/best цену.
export async function POST(_req: NextRequest, ctx: Ctx) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  const { id } = await ctx.params

  const [watch] = await db
    .select()
    .from(flightPriceWatches)
    .where(and(eq(flightPriceWatches.id, id), eq(flightPriceWatches.companyId, user.companyId), eq(flightPriceWatches.userId, user.id)))
    .limit(1)

  if (!watch) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  const result = await checkSingleWatch(watch)
  return NextResponse.json(result)
}
