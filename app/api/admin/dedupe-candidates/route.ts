// POST /api/admin/dedupe-candidates
// Репорт о найденных дублях кандидатов внутри одной вакансии по
// нормализованным телефону / email. Автомёрджа НЕ делает (ТЗ задача 3).
//
// Тело (всё опционально):
//   { vacancyId?: string, companyId?: string, limit?: number }
// Без vacancyId — поиск по всем компаниям (только platform_admin).
// limit — ограничение размера ответа (default 200, max 1000).

import { NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

interface DedupeBody {
  vacancyId?: unknown
  companyId?: unknown
  limit?:     unknown
}

interface DupCluster {
  vacancyId:   string
  matchKey:    string  // нормализованный phone или email (с префиксом)
  candidates:  Array<{
    id:        string
    name:      string | null
    stage:     string | null
    source:    string | null
    phone:     string | null
    email:     string | null
    createdAt: string  // ISO
  }>
}

export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin()
    const body = (await req.json().catch(() => ({}))) as DedupeBody

    const vacancyId = typeof body.vacancyId === "string" ? body.vacancyId : null
    const companyId = typeof body.companyId === "string" ? body.companyId : null
    const limit     = Math.min(Math.max(Number(body.limit) || 200, 1), 1000)

    // Один SQL: группируем кандидатов по (vacancy_id, normalized_phone) и
    // (vacancy_id, normalized_email) с COUNT > 1, делаем UNION ALL.
    // Игнорируем пустые ключи (NULLIF), чтобы не схлопывать всех «без email».
    const rows = await db.execute(sql`
      WITH dups AS (
        SELECT
          'phone'                                                                          AS key_type,
          vacancy_id,
          NULLIF(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')                   AS match_key
        FROM candidates
        WHERE phone IS NOT NULL AND phone <> ''
        UNION ALL
        SELECT
          'email'                                                                          AS key_type,
          vacancy_id,
          NULLIF(lower(trim(coalesce(email, ''))), '')                                     AS match_key
        FROM candidates
        WHERE email IS NOT NULL AND email <> ''
      ),
      grouped AS (
        SELECT key_type, vacancy_id, match_key, COUNT(*) AS n
        FROM dups
        WHERE match_key IS NOT NULL
        GROUP BY key_type, vacancy_id, match_key
        HAVING COUNT(*) > 1
      )
      SELECT
        g.key_type,
        g.vacancy_id,
        g.match_key,
        c.id,
        c.name,
        c.stage,
        c.source,
        c.phone,
        c.email,
        c.created_at,
        v.company_id
      FROM grouped g
      JOIN candidates c
        ON c.vacancy_id = g.vacancy_id
       AND (
         (g.key_type = 'phone' AND regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = g.match_key)
         OR
         (g.key_type = 'email' AND lower(trim(coalesce(c.email, '')))               = g.match_key)
       )
      JOIN vacancies v ON v.id = g.vacancy_id
      WHERE
        (${vacancyId}::uuid IS NULL OR g.vacancy_id  = ${vacancyId}::uuid)
        AND
        (${companyId}::uuid IS NULL OR v.company_id = ${companyId}::uuid)
      ORDER BY g.vacancy_id, g.key_type, g.match_key, c.created_at
      LIMIT ${limit}
    `) as unknown as Array<{
      key_type:   "phone" | "email"
      vacancy_id: string
      match_key:  string
      id:         string
      name:       string | null
      stage:      string | null
      source:     string | null
      phone:      string | null
      email:      string | null
      created_at: string | Date
    }>

    // Сворачиваем плоские строки в кластеры.
    const clusters = new Map<string, DupCluster>()
    for (const r of rows) {
      const ck = `${r.vacancy_id}::${r.key_type}::${r.match_key}`
      let cluster = clusters.get(ck)
      if (!cluster) {
        cluster = {
          vacancyId: r.vacancy_id,
          matchKey:  `${r.key_type}:${r.match_key}`,
          candidates: [],
        }
        clusters.set(ck, cluster)
      }
      cluster.candidates.push({
        id:        r.id,
        name:      r.name,
        stage:     r.stage,
        source:    r.source,
        phone:     r.phone,
        email:     r.email,
        createdAt: r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
      })
    }

    const list = Array.from(clusters.values())
    return apiSuccess({
      ok:           true,
      clustersCount: list.length,
      duplicatesCount: list.reduce((s, c) => s + c.candidates.length, 0),
      truncated:    rows.length >= limit,
      clusters:     list,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/dedupe-candidates]", err)
    return apiError("Internal server error", 500)
  }
}
