// GET /api/modules/hr/awaiting-review (P0-9 — переписан)
//
// Возвращает дельту «свежих» кандидатов с прошлого захода HR в карточку
// вакансии:
//
//   {
//     freshTotal: number,                          // сумма по всем вакансиям
//     vacancies:  [{ id, title, freshCount }]      // только где freshCount > 0
//   }
//
// Используется баннером /hr/dashboard. Свежим считается кандидат в стадии
// 'anketa_filled' с created_at > last_seen_at (запись в user_vacancy_views
// для пары user × vacancy). Если HR никогда не открывал вакансию —
// все anketa_filled считаются свежими (COALESCE с epoch).
//
// Заменяет P0-8 «N ждут разбора» (застывшее болото) на UX-метафору
// дельты с прошлого захода.

import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auth } from "@/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const companyId = session.user.companyId
  const userId = session.user.id

  // SQL: для каждой опубликованной вакансии компании считаем anketa_filled
  // c created_at > COALESCE(last_seen, epoch). HAVING > 0 отрезает пустые.
  // status IN ('published','active') — у Орлинка часть вакансий со статусом
  // 'active' (см. CLAUDE.md, не трогать). Сортировка по убыванию для UX.
  const rows = await db.execute(sql<{
    id: string; title: string; fresh_count: number | string
  }>`
    SELECT
      v.id,
      v.title,
      COUNT(c.id) FILTER (
        WHERE c.stage = 'anketa_filled'
          AND c.created_at > COALESCE(uvv.last_seen_at, '1970-01-01'::timestamptz)
      )::int AS fresh_count
    FROM vacancies v
    LEFT JOIN candidates c ON c.vacancy_id = v.id
    LEFT JOIN user_vacancy_views uvv
      ON uvv.vacancy_id = v.id AND uvv.user_id = ${userId}
    WHERE v.company_id = ${companyId}
      AND v.status IN ('published', 'active')
    GROUP BY v.id, v.title, uvv.last_seen_at
    HAVING COUNT(c.id) FILTER (
      WHERE c.stage = 'anketa_filled'
        AND c.created_at > COALESCE(uvv.last_seen_at, '1970-01-01'::timestamptz)
    ) > 0
    ORDER BY fresh_count DESC, v.title ASC
  `)

  // drizzle execute → { rows: [...] } для node-postgres-style драйверов.
  // На всякий случай поддержим и массив (postgres.js драйвер).
  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
    id: string; title: string; fresh_count: number | string
  }>

  const vacancies = list.map(r => ({
    id:         r.id,
    title:      r.title,
    freshCount: Number(r.fresh_count) || 0,
  }))
  const freshTotal = vacancies.reduce((s, v) => s + v.freshCount, 0)

  return NextResponse.json({ freshTotal, vacancies })
}
