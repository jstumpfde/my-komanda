/**
 * migrate-experience-text-to-int.ts
 *
 * Одноразовый скрипт: переносит данные из text-колонки candidates.experience
 * в integer-колонку candidates.experience_years.
 *
 * Запуск:
 *   npx tsx scripts/migrate-experience-text-to-int.ts
 *
 * Идемпотентен: пропускает кандидатов, у которых experience_years уже выставлен.
 *
 * Логика парсинга:
 *   - "5 лет"             → 5
 *   - "более 3 лет"       → 3
 *   - "от 3 до 6 лет"     → 3 (берём минимум)
 *   - "10+ лет"           → 10
 *   - "без опыта" / null  → 0
 *   - "1 год"             → 1
 */

import { eq, isNull, and } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates } from "@/lib/db/schema"

function parseExperienceText(raw: string | null | undefined): number | null {
  if (!raw) return 0
  const t = raw.trim().toLowerCase()
  if (!t) return 0
  if (/без\s+опыта|нет\s+опыта|^нет$/.test(t)) return 0

  // Берём первое число в строке (для "от 3 до 6", "более 3", "10+")
  const m = t.match(/-?\d+/)
  if (!m) return null
  const n = Number.parseInt(m[0], 10)
  if (Number.isNaN(n) || n < 0) return null
  return Math.min(n, 50)
}

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] migrate-experience-text-to-int: старт`)

  let migrated = 0
  let skipped = 0
  let unparsed = 0

  try {
    const rows = await db
      .select({ id: candidates.id, experience: candidates.experience, experienceYears: candidates.experienceYears })
      .from(candidates)
      .where(and(isNull(candidates.experienceYears)))

    console.log(`  найдено ${rows.length} кандидатов с пустым experience_years`)

    for (const r of rows) {
      const parsed = parseExperienceText(r.experience)
      if (parsed == null) {
        unparsed++
        continue
      }
      await db.update(candidates).set({ experienceYears: parsed }).where(eq(candidates.id, r.id))
      migrated++
    }

    skipped = rows.length - migrated - unparsed

    const elapsedMs = Date.now() - start
    console.log(`  ✓ перенесено: ${migrated}`)
    console.log(`  - не распарсено (оставлено NULL): ${unparsed}`)
    console.log(`  - пропущено: ${skipped}`)
    console.log(`[${new Date().toISOString()}] готово. Время: ${elapsedMs} мс`)

    await pgClient.end({ timeout: 5 })
    process.exit(0)
  } catch (err) {
    console.error("Ошибка:", err)
    try { await pgClient.end({ timeout: 5 }) } catch { /* ignore */ }
    process.exit(1)
  }
}

main()
