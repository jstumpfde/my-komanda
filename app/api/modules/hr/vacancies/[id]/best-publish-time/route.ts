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
    // Используем company_id (а не одну вакансию) — статистика по всем вакансиям компании достовернее.
    //
    // Берём РЕАЛЬНОЕ время отклика на hh.ru — negotiation.created_at из raw_data.
    // Это поле хранится в raw_data как строка ISO 8601 и совпадает с тем временем,
    // которое hh.ru показывает в «Чате hh» (напр. «27.06, 20:35»).
    // Fallback на hh_responses.created_at только если raw_data-поле отсутствует
    // (не-hh кандидаты, ранние записи без сохранённого raw_data).
    const rows = await db.execute(sql`
      SELECT
        EXTRACT(DOW FROM COALESCE(
          NULLIF(raw_data->>'created_at', '')::timestamptz,
          created_at
        ) AT TIME ZONE 'Europe/Moscow')::int AS dow,
        EXTRACT(HOUR FROM COALESCE(
          NULLIF(raw_data->>'created_at', '')::timestamptz,
          created_at
        ) AT TIME ZONE 'Europe/Moscow')::int AS hour,
        COUNT(*)::int AS cnt
      FROM hh_responses
      WHERE company_id = ${vac.companyId}
      GROUP BY dow, hour
      ORDER BY cnt DESC
      LIMIT 100
    `)

    // db.execute() в зависимости от драйвера возвращает либо { rows: [...] }
    // (node-postgres), либо сам массив строк (postgres.js). Поддерживаем оба,
    // иначе на проде rows.rows = undefined → .reduce падал (500).
    const raw = rows as unknown as { rows?: unknown[] } | unknown[]
    const rawRows = (Array.isArray(raw) ? raw : raw.rows ?? []) as Array<{ dow: unknown; hour: unknown; cnt: unknown }>
    // postgres.js может вернуть числа строками — приводим явно, иначе reduce
    // сконкатенирует, а DAY_NAMES[dow] промахнётся.
    const data = rawRows.map(r => ({ dow: Number(r.dow), hour: Number(r.hour), cnt: Number(r.cnt) }))
    const total = data.reduce((s, r) => s + r.cnt, 0)
    
    if (total < 5) {
      return NextResponse.json({ enough: false, total })
    }

    // Срок, за который собраны эти отклики: от ПЕРВОГО отклика (реальное время hh)
    // до сейчас. Возвращаем и сам момент первого отклика — показываем «за Nд. с …».
    const spanRes = await db.execute(sql`
      SELECT
        EXTRACT(EPOCH FROM (now() - MIN(COALESCE(
          NULLIF(raw_data->>'created_at', '')::timestamptz, created_at
        ))))::float8 AS secs,
        MIN(COALESCE(
          NULLIF(raw_data->>'created_at', '')::timestamptz, created_at
        )) AS first_at
      FROM hh_responses WHERE company_id = ${vac.companyId}
    `)
    const spanRaw = spanRes as unknown as { rows?: unknown[] } | unknown[]
    const spanRows = (Array.isArray(spanRaw) ? spanRaw : spanRaw.rows ?? []) as Array<{ secs: unknown; first_at: unknown }>
    const periodDays = Math.max(1, Math.ceil(Number(spanRows[0]?.secs ?? 0) / 86400))
    const firstAtRaw = spanRows[0]?.first_at
    const firstAt = firstAtRaw ? new Date(firstAtRaw as string | number | Date).toISOString() : null

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

    return NextResponse.json({ enough: true, total, periodDays, firstAt, topDays, topHours })
  } catch (e) {
    console.error("[best-publish-time]", e)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}
