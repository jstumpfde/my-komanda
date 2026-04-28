/**
 * Короткие идентификаторы вакансий и кандидатов.
 *
 *   vacancy.short_code  = "2604V001"      → YYMM(created_at) + 'V' + порядковый внутри YYMM
 *   candidate.short_id  = "2604V0010042"  → vacancy.short_code + LPAD(sequence, 4)
 *
 * Особый sequence = 0 (короткий id оканчивается на 0000) — зарезервирован для
 * директорского preview каждой вакансии.
 */

import { sql } from "drizzle-orm"
import type { PostgresJsDatabase, PostgresJsTransaction } from "drizzle-orm/postgres-js"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type * as schema from "@/lib/db/schema"

// ─── Типы ───────────────────────────────────────────────────────────────────

type Schema = typeof schema
type DbLike =
  | PostgresJsDatabase<Schema>
  | PostgresJsTransaction<Schema, ExtractTablesWithRelations<Schema>>

// ─── Распознавание формата ──────────────────────────────────────────────────

const UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_CODE_RE = /^\d{4}V\d{3}$/                  // вакансия: 2604V001
const SHORT_ID_RE   = /^\d{4}V\d{3}\d{4}$/             // кандидат: 2604V0010042
const PREVIEW_RE    = /^test-demo-preview-\d+$/

export const isUuid          = (s: string) => UUID_RE.test(s)
export const isShortCode     = (s: string) => SHORT_CODE_RE.test(s)
export const isShortId       = (s: string) => SHORT_ID_RE.test(s)
export const isPreviewToken  = (s: string) => PREVIEW_RE.test(s)

export function formatYYMM(d: Date): string {
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${yy}${mm}`
}

// ─── Генерация ──────────────────────────────────────────────────────────────

/**
 * Сгенерировать новый short_code для вакансии. Должна вызываться внутри
 * транзакции (`db.transaction(...)`) — advisory_xact_lock освобождается на коммите.
 */
export async function generateVacancyShortCode(
  tx: DbLike,
  createdAt: Date = new Date(),
): Promise<string> {
  const yymm = formatYYMM(createdAt)

  // advisory lock на ключ (vacancy_shortcode, yymm) — один писатель на YYMM.
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext('vacancy_shortcode'), hashtext(${yymm}))
  `)

  const rows = (await tx.execute(sql`
    SELECT short_code FROM vacancies
    WHERE short_code LIKE ${yymm + "V%"}
    ORDER BY short_code DESC
    LIMIT 1
  `)) as Array<{ short_code: string }>

  let next = 1
  if (rows.length > 0) {
    const m = rows[0].short_code?.match(/^\d{4}V(\d{3})$/)
    if (m) next = parseInt(m[1], 10) + 1
  }
  return `${yymm}V${String(next).padStart(3, "0")}`
}

/**
 * Сгенерировать short_id для нового кандидата. Должна вызываться внутри
 * транзакции. Возвращает { shortId, sequenceNumber }.
 */
export async function generateCandidateShortId(
  tx: DbLike,
  vacancyId: string,
): Promise<{ shortId: string; sequenceNumber: number } | null> {
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext('candidate_seq'), hashtext(${vacancyId}))
  `)

  const vacRows = (await tx.execute(sql`
    SELECT short_code FROM vacancies WHERE id = ${vacancyId}::uuid LIMIT 1
  `)) as Array<{ short_code: string | null }>

  const code = vacRows[0]?.short_code
  if (!code) return null // вакансия без short_code (битая миграция) — пропускаем

  const seqRows = (await tx.execute(sql`
    SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
    FROM candidates
    WHERE vacancy_id = ${vacancyId}::uuid
      AND sequence_number IS NOT NULL
      AND sequence_number > 0
  `)) as Array<{ max_seq: number | string }>

  const maxSeq = Number(seqRows[0]?.max_seq ?? 0)
  const next = maxSeq + 1
  return {
    shortId: `${code}${String(next).padStart(4, "0")}`,
    sequenceNumber: next,
  }
}

/**
 * Получить short_id для preview-кандидата вакансии (sequence = 0). Не вставляет —
 * только возвращает строку. Если у вакансии уже есть preview-кандидат с этим
 * short_id — повторное использование происходит на уровне SELECT в роутере.
 */
export async function generatePreviewCandidateShortId(
  tx: DbLike,
  vacancyId: string,
): Promise<string | null> {
  const rows = (await tx.execute(sql`
    SELECT short_code FROM vacancies WHERE id = ${vacancyId}::uuid LIMIT 1
  `)) as Array<{ short_code: string | null }>

  const code = rows[0]?.short_code
  if (!code) return null
  return `${code}0000`
}
