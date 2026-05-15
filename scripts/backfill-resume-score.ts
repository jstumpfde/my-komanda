/**
 * backfill-resume-score.ts
 *
 * Одноразовый backfill для AI-скора резюме (candidates.resume_score).
 *
 * Берёт кандидатов с source='hh', у которых resume_score IS NULL и есть
 * связанный hh_response с raw_data (т.е. отклик пришёл через интеграцию hh).
 * Для каждого: извлекает резюме-поля из hh raw_data, anketa из vacancies.
 * descriptionJson, вызывает screenResume() и пишет результат в candidates.
 *
 * Идемпотентен: повторный запуск пропустит уже скоренных (resume_score IS NULL
 * больше не выполнится для них).
 *
 * Запуск:
 *   npx tsx scripts/backfill-resume-score.ts
 *
 * Параметры через ENV:
 *   BATCH_LIMIT=200   — сколько кандидатов за один прогон (default 200)
 *   DELAY_MS=500      — пауза между AI-запросами (default 500)
 */

import { eq, and, isNull, desc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, hhResponses, vacancies } from "@/lib/db/schema"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { screenResume } from "@/lib/ai-screen-resume"

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function main() {
  const start = Date.now()
  const BATCH_LIMIT = Math.max(1, Math.min(2000, Number(process.env.BATCH_LIMIT) || 200))
  const DELAY_MS    = Math.max(0, Math.min(10_000, Number(process.env.DELAY_MS) || 500))

  console.log(`[${new Date().toISOString()}] backfill-resume-score: старт (limit=${BATCH_LIMIT}, delay=${DELAY_MS}ms)`)

  let processed = 0
  let scored    = 0
  let skipped   = 0
  let failed    = 0

  try {
    // Берём кандидатов с source='hh' и без скора, джойним hh_responses для
    // raw_data резюме (одна строка на кандидата — берём свежайшую по synced_at)
    // и vacancies для descriptionJson.
    const rows = await db
      .select({
        candidateId:        candidates.id,
        candidateName:      candidates.name,
        candidateCity:      candidates.city,
        salaryMin:          candidates.salaryMin,
        experienceYears:    candidates.experienceYears,
        keySkills:          candidates.keySkills,
        skills:             candidates.skills,
        educationLevel:     candidates.educationLevel,
        workFormat:         candidates.workFormat,
        vacancyTitle:       vacancies.title,
        vacancyCity:        vacancies.city,
        descriptionJson:    vacancies.descriptionJson,
        rawData:            hhResponses.rawData,
      })
      .from(candidates)
      .innerJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(
        isNull(candidates.resumeScore),
        eq(candidates.source, "hh"),
      ))
      .orderBy(desc(candidates.createdAt))
      .limit(BATCH_LIMIT)

    console.log(`  найдено ${rows.length} кандидатов без resume_score`)

    for (const r of rows) {
      processed++

      try {
        // Дедуп по candidateId — в hh_responses может быть несколько строк
        // (старые fallback'и до dedup-фикса). Берём первую попавшуюся.
        const raw = r.rawData as { resume?: Record<string, unknown> } | null
        const extracted = extractHhResumeFields(raw?.resume)

        const descJson = r.descriptionJson as Record<string, unknown> | null
        const anketa = (descJson?.anketa as Record<string, unknown> | undefined) ?? {}

        const result = await screenResume({
          resume: {
            name:            r.candidateName,
            city:            r.candidateCity ?? extracted.city ?? null,
            salaryMin:       r.salaryMin ?? extracted.salaryMin ?? null,
            experienceYears: r.experienceYears ?? extracted.experienceYears ?? null,
            keySkills:       r.keySkills ?? extracted.keySkills ?? null,
            skills:          r.skills    ?? extracted.skills    ?? null,
            educationLevel:  r.educationLevel ?? extracted.educationLevel ?? null,
            workFormat:      r.workFormat ?? extracted.workFormat ?? null,
          },
          vacancy: {
            title:                r.vacancyTitle,
            city:                 r.vacancyCity,
            aiIdealProfile:       (anketa.aiIdealProfile as string | undefined) ?? null,
            aiRequiredHardSkills: (anketa.aiRequiredHardSkills as string[] | undefined) ?? null,
            aiStopFactors:        (anketa.aiStopFactors as string[] | undefined) ?? null,
          },
        })

        if (result) {
          await db.update(candidates)
            .set({ resumeScore: result.score })
            .where(eq(candidates.id, r.candidateId))
          scored++
          if (scored % 10 === 0) {
            console.log(`  …${scored}/${rows.length} (score=${result.score}, verdict=${result.verdict})`)
          }
        } else {
          skipped++
        }
      } catch (err) {
        failed++
        console.warn(`  ✗ ${r.candidateId}: ${err instanceof Error ? err.message : err}`)
      }

      if (DELAY_MS > 0 && processed < rows.length) await sleep(DELAY_MS)
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000)
    console.log(`[${new Date().toISOString()}] готово.`)
    console.log(`  ✓ скорено:   ${scored}`)
    console.log(`  - пропущено: ${skipped} (AI вернул null)`)
    console.log(`  ✗ ошибок:    ${failed}`)
    console.log(`  ~ всего:     ${processed}`)
    console.log(`  время:       ${elapsedSec}с`)

    await pgClient.end({ timeout: 5 })
    process.exit(0)
  } catch (err) {
    console.error("Фатальная ошибка:", err)
    try { await pgClient.end({ timeout: 5 }) } catch { /* ignore */ }
    process.exit(1)
  }
}

main()
