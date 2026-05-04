/**
 * seed-candidate-demo-data.ts
 *
 * ⚠️ ТОЛЬКО для staging / dev. НЕ запускать в production!
 *
 * Заполняет демо-данными новые HR-020 поля у кандидатов, у которых они NULL/empty:
 *   - birth_date            → случайная дата 25–45 лет назад
 *   - experience_years      → random 0–15 (если ещё не выставлен)
 *   - work_format           → random из ['office', 'hybrid', 'remote']
 *   - education_level       → random из ['secondary', 'specialized', 'higher', 'mba']
 *   - languages             → random subset из ['russian', 'english', 'german', 'other']
 *   - relocation_ready      → random boolean
 *   - business_trips_ready  → random boolean
 *
 * Запуск:
 *   npx tsx scripts/seed-candidate-demo-data.ts
 */

import { eq } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates } from "@/lib/db/schema"

const WORK_FORMATS  = ["office", "hybrid", "remote"] as const
const EDUCATION     = ["secondary", "specialized", "higher", "mba"] as const
const LANG_POOL     = ["russian", "english", "german", "other"] as const

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randomInt(minIncl: number, maxIncl: number): number {
  return Math.floor(Math.random() * (maxIncl - minIncl + 1)) + minIncl
}
function randomBirthDate(): string {
  const yearsAgo = randomInt(25, 45)
  const d = new Date()
  d.setFullYear(d.getFullYear() - yearsAgo)
  d.setMonth(randomInt(0, 11))
  d.setDate(randomInt(1, 28))
  return d.toISOString().slice(0, 10)
}
function randomLanguages(): string[] {
  // 1..3 случайных языка, обязательно «russian»
  const pool = [...LANG_POOL].filter((l) => l !== "russian")
  const n = randomInt(0, 2)
  const picked: string[] = ["russian"]
  for (let i = 0; i < n; i++) {
    const l = rand(pool)
    if (!picked.includes(l)) picked.push(l)
  }
  return picked
}

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] seed-candidate-demo-data: старт (staging/dev only!)`)

  let updated = 0
  let skipped = 0

  try {
    const rows = await db
      .select({
        id: candidates.id,
        birthDate: candidates.birthDate,
        experienceYears: candidates.experienceYears,
        workFormat: candidates.workFormat,
        educationLevel: candidates.educationLevel,
        languages: candidates.languages,
        relocationReady: candidates.relocationReady,
        businessTripsReady: candidates.businessTripsReady,
      })
      .from(candidates)

    console.log(`  всего кандидатов: ${rows.length}`)

    for (const r of rows) {
      const patch: Partial<typeof candidates.$inferInsert> = {}
      if (!r.birthDate)                                 patch.birthDate           = randomBirthDate()
      if (r.experienceYears == null)                    patch.experienceYears     = randomInt(0, 15)
      if (!r.workFormat)                                patch.workFormat          = rand(WORK_FORMATS)
      if (!r.educationLevel)                            patch.educationLevel      = rand(EDUCATION)
      if (!r.languages || r.languages.length === 0)     patch.languages           = randomLanguages()
      if (r.relocationReady == null)                    patch.relocationReady     = Math.random() > 0.5
      if (r.businessTripsReady == null)                 patch.businessTripsReady  = Math.random() > 0.5

      if (Object.keys(patch).length === 0) { skipped++; continue }

      await db.update(candidates).set(patch).where(eq(candidates.id, r.id))
      updated++
    }

    const elapsedMs = Date.now() - start
    console.log(`  ✓ обновлено:  ${updated}`)
    console.log(`  - пропущено:  ${skipped} (все поля уже заполнены)`)
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
