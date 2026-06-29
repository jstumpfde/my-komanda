/**
 * migrate-skills-consolidation.ts
 *
 * Одноразовый идемпотентный скрипт: для каждой вакансии объединяет
 *   descriptionJson.anketa.requiredSkills  (legacy)
 *   descriptionJson.anketa.desiredSkills   (legacy)
 * в единое видимое поле
 *   descriptionJson.anketa.vacancySkills   (hh-навыки, отображается на вкладке «Вакансия»)
 *
 * После переноса очищает requiredSkills / desiredSkills.
 *
 * Идемпотентность:
 *   - Если requiredSkills и desiredSkills пусты — вакансия пропускается (уже мигрирована
 *     или данных не было).
 *   - Дедуп через dedupeSkills (канонический ключ: нижний регистр, ё→е, дефис→пробел).
 *   - При повторном запуске vacancySkills уже содержит объединённые данные, а
 *     requiredSkills/desiredSkills пусты → вакансия снова пропускается.
 *
 * Запуск:
 *   npx tsx scripts/migrate-skills-consolidation.ts
 *
 * ВАЖНО: НЕ применяет SQL-миграцию схемы. Работает только с данными в JSONB-колонке
 * description_json. Поля requiredSkills/desiredSkills остаются в TypeScript-типе (для
 * совместимости с уже сохранёнными данными), но после этого скрипта будут пусты.
 */

import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { dedupeSkills } from "@/lib/skills/normalize"
import { sql } from "drizzle-orm"

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.map(String).filter(s => s.trim().length > 0)
}

async function main() {
  console.log("=== migrate-skills-consolidation: старт ===\n")

  // Выбираем все вакансии с непустым description_json
  const rows = await db
    .select({
      id:              vacancies.id,
      companyId:       vacancies.companyId,
      title:           vacancies.title,
      descriptionJson: vacancies.descriptionJson,
    })
    .from(vacancies)
    .where(sql`description_json IS NOT NULL`)

  console.log(`Всего вакансий с description_json: ${rows.length}\n`)

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    try {
      const desc = (row.descriptionJson as Record<string, unknown>) ?? {}
      const anketa = (desc.anketa as Record<string, unknown>) ?? {}

      const required = toStringArray(anketa.requiredSkills)
      const desired  = toStringArray(anketa.desiredSkills)

      // Нечего переносить — уже мигрирована или данных не было
      if (required.length === 0 && desired.length === 0) {
        skipped++
        continue
      }

      const existingVacancySkills = toStringArray(anketa.vacancySkills)

      // Объединяем: сначала уже имеющиеся hh-навыки, потом legacy (дедуп по канону)
      const merged = dedupeSkills([...existingVacancySkills, ...required, ...desired])

      const newAnketa = {
        ...anketa,
        vacancySkills:  merged,
        requiredSkills: [],
        desiredSkills:  [],
      }

      const newDesc = { ...desc, anketa: newAnketa }

      await db
        .update(vacancies)
        .set({ descriptionJson: newDesc })
        .where(sql`id = ${row.id}`)

      console.log(`[OK] ${row.id} «${row.title ?? "—"}» (компания ${row.companyId})`)
      if (required.length > 0)
        console.log(`     requiredSkills (${required.length}): ${required.slice(0, 5).join(", ")}${required.length > 5 ? " …" : ""}`)
      if (desired.length > 0)
        console.log(`     desiredSkills  (${desired.length}): ${desired.slice(0, 5).join(", ")}${desired.length > 5 ? " …" : ""}`)
      console.log(`     → vacancySkills (${merged.length}): ${merged.slice(0, 8).join(", ")}${merged.length > 8 ? " …" : ""}\n`)

      migrated++
    } catch (err) {
      console.error(`[ERR] ${row.id} «${row.title ?? "—"}»:`, err instanceof Error ? err.message : err)
      errors++
    }
  }

  console.log("=== Итог ===")
  console.log(`Мигрировано: ${migrated}`)
  console.log(`Пропущено (уже мигрированы или пусто): ${skipped}`)
  console.log(`Ошибки: ${errors}`)

  if (errors > 0) process.exit(1)
}

main().catch(err => {
  console.error("Критическая ошибка:", err)
  process.exit(1)
})
