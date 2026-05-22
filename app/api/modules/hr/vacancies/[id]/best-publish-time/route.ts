import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import {vacancies} from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

const DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { id: vacancyId } = await ctx.params

    // Берём company_id из вакансии
    const [vac] = await db.select({ companyId: vacancies.companyId, hhVacancyId: vacancies.hhVacancyId }).from(vacancies).where(eq(vacancies.id, vacancyId)).limit(1)
    if (!vac) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

    // Аггрегируем по дню недели и часу (МСК = UTC+3)
    // Используем company_id (а не одну вакансию) — статистика по всем вакансиям компании достовернее
    const rows = await db.execute(sql`
      SELECT 
        EXTRACT(DOW FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS dow,
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Moscow')::int AS hour,
        COUNT(*)::int AS cnt
      FROM hh_responses
      WHERE company_id = ${vac.companyId}
      GROUP BY dow, hour
      ORDER BY cnt DESC
      LIMIT 100
    `)

    const data = rows.rows as { dow: number; hour: number; cnt: number }[]
    const total = data.reduce((s, r) => s + r.cnt, 0)
    
    if (total < 5) {
      return NextResponse.json({ enough: false, total })
    }

    // Группируем по дням недели
    const byDay = new Map<number, number>()
    const byHour = new Map<number, number>()
    for (const r of data) {
      byDay.set(r.dow, (byDay.get(r.dow) ?? 0) + r.cnt)
      byHour.set(r.hour, (byHour.get(r.hour) ?? 0) + r.cnt)
    }

    // Top-3 дни и часы
    const topDays = Array.from(byDay.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([dow, cnt]) => ({ name: DAY_NAMES[dow], pct: Math.round((cnt / total) * 100) }))

    const topHours = Array.from(byHour.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h, cnt]) => ({ range: `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`, pct: Math.round((cnt / total) * 100) }))

    return NextResponse.json({ enough: true, total, topDays, topHours })
  } catch (e) {
    console.error("[best-publish-time]", e)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}
