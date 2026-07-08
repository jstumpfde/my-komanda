/**
 * scripts/strip-legacy-perfactor-rejection.ts
 *
 * Гигиена данных (Юрий 08.07, ТК РФ). Пер-факторный текст отказа стоп-факторов
 * упразднён — теперь ОДИН нейтральный текст на весь блок. Старый пер-факторный
 * rejectionText (мог раскрывать причину: «принимаем только граждан РФ»,
 * «возрастное ограничение») matcher уже игнорирует (см. stop-factors-matcher.ts),
 * но он физически лежит в БД. Этот скрипт его вычищает из:
 *   1. vacancies.stop_factors_json.<factor>.rejectionText  (боевое)
 *   2. vacancy_specs.spec.stopFactors.<factor>.rejectionText (Портрет)
 *
 * НЕ трогает блочный stop_factors_json.rejectionText (новый единый текст).
 * НЕ трогает никакие другие поля факторов (enabled/allowed/minAge/…).
 *
 * По умолчанию DRY-RUN. Запись — флаг --apply.
 *   pnpm exec tsx --env-file=.env.local scripts/strip-legacy-perfactor-rejection.ts
 *   pnpm exec tsx --env-file=.env.local scripts/strip-legacy-perfactor-rejection.ts --apply
 */

import { eq } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { vacancies, vacancySpecs } from "@/lib/db/schema"

const APPLY = process.argv.slice(2).includes("--apply")

const FACTOR_KEYS = ["city", "format", "age", "experience", "documents", "citizenship", "nativeLanguage", "salaryExpectation"] as const

// Убирает rejectionText из каждого пер-факторного под-объекта. Возвращает
// [новый объект, список вычищенных текстов] или null, если чистить нечего.
function stripPerFactorRejection(sf: Record<string, unknown> | null | undefined): { next: Record<string, unknown>; removed: Array<{ factor: string; text: string }> } | null {
  if (!sf || typeof sf !== "object") return null
  const removed: Array<{ factor: string; text: string }> = []
  const next: Record<string, unknown> = { ...sf }
  for (const key of FACTOR_KEYS) {
    const f = next[key]
    if (f && typeof f === "object" && "rejectionText" in (f as Record<string, unknown>)) {
      const txt = (f as Record<string, unknown>).rejectionText
      if (typeof txt === "string" && txt.trim().length > 0) {
        removed.push({ factor: key, text: txt.trim() })
      }
      const { rejectionText: _drop, ...rest } = f as Record<string, unknown>
      next[key] = rest
    }
  }
  return removed.length > 0 || next !== sf ? { next, removed } : null
}

async function main() {
  console.log(`\n=== Чистка legacy пер-факторного текста отказа ${APPLY ? "(ЗАПИСЬ)" : "(DRY-RUN)"} ===\n`)

  // 1) Боевое
  const vacs = await db.select({ id: vacancies.id, shortCode: vacancies.shortCode, title: vacancies.title, sf: vacancies.stopFactorsJson }).from(vacancies)
  let vacTouched = 0
  for (const v of vacs) {
    const res = stripPerFactorRejection(v.sf as Record<string, unknown>)
    if (!res || res.removed.length === 0) continue
    vacTouched++
    console.log(`[боевое] ${v.shortCode ?? v.id} «${v.title ?? ""}»`)
    for (const r of res.removed) console.log(`    − ${r.factor}: «${r.text.slice(0, 80)}${r.text.length > 80 ? "…" : ""}»`)
    if (APPLY) await db.update(vacancies).set({ stopFactorsJson: res.next as typeof vacancies.$inferInsert["stopFactorsJson"] }).where(eq(vacancies.id, v.id))
  }

  // 2) Портрет (vacancy_specs)
  const specs = await db.select({ vacancyId: vacancySpecs.vacancyId, spec: vacancySpecs.spec }).from(vacancySpecs)
  let specTouched = 0
  for (const s of specs) {
    const spec = s.spec as Record<string, unknown> | null
    if (!spec || typeof spec !== "object") continue
    const res = stripPerFactorRejection(spec.stopFactors as Record<string, unknown>)
    if (!res || res.removed.length === 0) continue
    specTouched++
    console.log(`[Портрет] vacancy ${s.vacancyId}`)
    for (const r of res.removed) console.log(`    − ${r.factor}: «${r.text.slice(0, 80)}${r.text.length > 80 ? "…" : ""}»`)
    if (APPLY) {
      const nextSpec = { ...spec, stopFactors: res.next }
      await db.update(vacancySpecs).set({ spec: nextSpec as typeof vacancySpecs.$inferInsert["spec"] }).where(eq(vacancySpecs.vacancyId, s.vacancyId))
    }
  }

  console.log(`\nИтог: боевое — ${vacTouched} вакансий, Портрет — ${specTouched} спеков с legacy-текстом.`)
  if (!APPLY) console.log(`Запись НЕ выполнялась. Применить: --apply\n`)
  else console.log(`Записано.\n`)
  await pgClient.end()
}

main().catch(async (e) => { console.error(e); await pgClient.end(); process.exit(1) })
