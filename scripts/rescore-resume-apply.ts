/**
 * scripts/rescore-resume-apply.ts
 *
 * ПРИМЕНЕНИЕ новой AI-оценки резюме: пересчитывает candidates.resume_score
 * новым screenResume и ЗАПИСЫВАЕТ результат в БД (UPDATE candidates.resume_score).
 *
 * ⚠️ ПИШЕТ В БД. Сначала прогоните превью (scripts/rescore-resume-preview.ts)
 *    и убедитесь, что результат ожидаемый. По умолчанию — dry-run (без --apply).
 *
 * Запуск:
 *   # dry-run (ничего не пишет, показывает что БЫ записал):
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... \
 *     pnpm exec tsx scripts/rescore-resume-apply.ts --vacancy-id <uuid>
 *
 *   # реальная запись:
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... \
 *     pnpm exec tsx scripts/rescore-resume-apply.ts --vacancy-id <uuid> --apply
 *
 * Обновляет ТОЛЬКО resume_score. Не трогает stage/ai_score/автодействия
 * (в отличие от process-queue — здесь только пересчёт балла колонки «AI-резюме»).
 */

import { eq, and, isNotNull, desc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { screenResume, type ResumeScreenInput } from "@/lib/ai-screen-resume"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { getSpec } from "@/lib/core/spec/store"
import {
  buildSpecResumeInput,
  isSpecScoringEnabled,
  specHasScoringContent,
} from "@/lib/core/spec/resume-input"

const DEFAULT_VACANCY_ID = "6916db01-a765-4c4e-a652-81475566f95b"

function parseArgs(argv: string[]): { vacancyId: string; limit: number; apply: boolean; help: boolean } {
  const args = argv.slice(2)
  let vacancyId = DEFAULT_VACANCY_ID
  let limit = 500
  let apply = false
  let help = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a === "--apply") { apply = true; continue }
    if (a === "--vacancy-id" && args[i + 1]) { vacancyId = args[++i]; continue }
    if (a === "--limit" && args[i + 1]) { limit = Math.min(1000, Math.max(1, parseInt(args[++i], 10) || 500)); continue }
  }
  return { vacancyId, limit, apply, help }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function screenWithRetry(input: ResumeScreenInput, retries = 1): Promise<Awaited<ReturnType<typeof screenResume>>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await screenResume(input) }
    catch (err) {
      if (attempt === retries) throw err
      await sleep(1500)
    }
  }
  return null
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log("rescore-resume-apply — пересчёт и ЗАПИСЬ resume_score. --apply для реальной записи (иначе dry-run).")
    process.exit(0)
  }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL не задан"); process.exit(1) }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY не задан"); process.exit(1) }

  console.log(`\n[${new Date().toISOString()}] rescore-resume-apply (${opts.apply ? "ЗАПИСЬ В БД" : "DRY-RUN"})`)
  console.log(`  Вакансия: ${opts.vacancyId}`)

  const [vac] = await db
    .select({
      id: vacancies.id, title: vacancies.title, city: vacancies.city,
      descriptionJson: vacancies.descriptionJson, portraitScoring: vacancies.portraitScoring,
    })
    .from(vacancies).where(eq(vacancies.id, opts.vacancyId)).limit(1)
  if (!vac) { console.error("Вакансия не найдена"); await pgClient.end({ timeout: 5 }); process.exit(1) }

  const portraitOn = vac.portraitScoring === true
  let specVacancyInput: ResumeScreenInput["vacancy"] | null = null
  if (isSpecScoringEnabled(vac.id) || portraitOn) {
    try {
      const spec = await getSpec(vac.id)
      const useSpec = !!spec && (portraitOn
        ? specHasScoringContent(spec)
        : (spec.mustHave.length > 0 || spec.portraitRequiredSkills.length > 0))
      if (spec && useSpec) {
        specVacancyInput = buildSpecResumeInput({}, { title: vac.title, city: vac.city }, spec, { respectHardness: portraitOn }).vacancy
      }
    } catch { /* fallback на legacy */ }
  }
  const descJson = (vac.descriptionJson ?? {}) as Record<string, unknown>
  const anketa = (descJson.anketa as Record<string, unknown> | undefined) ?? {}
  const vacancyInput: ResumeScreenInput["vacancy"] = specVacancyInput ?? {
    title: vac.title, city: vac.city,
    aiIdealProfile:       (anketa.aiIdealProfile as string | undefined) ?? null,
    aiRequiredHardSkills: (anketa.aiRequiredHardSkills as string[] | undefined) ?? null,
    aiStopFactors:        (anketa.aiStopFactors as string[] | undefined) ?? null,
    screeningQuestions:   (anketa.screeningQuestions as string[] | undefined) ?? null,
    aiWeights:            (anketa.aiWeights as Record<string, string> | undefined) ?? null,
    customCriteria:       (anketa.aiCustomCriteria as { label: string; weight: string }[] | undefined) ?? null,
  }

  const rows = await db
    .select({
      candidateId: candidates.id, candidateName: candidates.name, candidateCity: candidates.city,
      salaryMin: candidates.salaryMin, experienceYears: candidates.experienceYears,
      keySkills: candidates.keySkills, skills: candidates.skills, educationLevel: candidates.educationLevel,
      workFormat: candidates.workFormat, languages: candidates.languages, relocationReady: candidates.relocationReady,
      professionalRoles: candidates.professionalRoles, citizenshipNames: candidates.citizenshipNames,
      resumeScore: candidates.resumeScore, hhRawData: hhResponses.rawData,
    })
    .from(candidates)
    .leftJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
    .where(and(eq(candidates.vacancyId, vac.id), isNotNull(candidates.resumeScore)))
    .orderBy(desc(candidates.createdAt)).limit(opts.limit)

  const seen = new Set<string>()
  const uniqueRows = rows.filter(r => (seen.has(r.candidateId) ? false : (seen.add(r.candidateId), true)))
  console.log(`  Кандидатов: ${uniqueRows.length}\n`)

  let updated = 0, failed = 0
  for (const r of uniqueRows) {
    const raw = r.hhRawData as { resume?: Record<string, unknown> } | null
    const extracted = extractHhResumeFields(raw?.resume)
    const resumeObj: ResumeScreenInput["resume"] = {
      name: r.candidateName, city: r.candidateCity ?? extracted.city ?? null,
      salaryMin: r.salaryMin ?? extracted.salaryMin ?? null,
      experienceYears: r.experienceYears ?? extracted.experienceYears ?? null,
      keySkills: (r.keySkills as string[] | null) ?? extracted.keySkills ?? null,
      skills: (r.skills as string[] | null) ?? extracted.skills ?? null,
      educationLevel: r.educationLevel ?? extracted.educationLevel ?? null,
      workFormat: r.workFormat ?? extracted.workFormat ?? null,
      languages: (r.languages as string[] | null) ?? extracted.languages ?? null,
      relocationReady: r.relocationReady ?? extracted.relocationReady ?? null,
      professionalRoles: (r.professionalRoles as string[] | null) ?? extracted.professionalRoles ?? null,
      citizenshipNames: (r.citizenshipNames as string[] | null) ?? extracted.citizenshipNames ?? null,
      workHistory: extracted.workHistory ?? null,
    }
    let res: Awaited<ReturnType<typeof screenResume>> = null
    try { res = await screenWithRetry({ resume: resumeObj, vacancy: vacancyInput }) }
    catch (err) { console.warn(`  ✗ ${r.candidateName}: ${err instanceof Error ? err.message : err}`); failed++; continue }
    if (!res) { failed++; continue }

    const dStr = r.resumeScore != null ? (res.score - r.resumeScore >= 0 ? `+${res.score - r.resumeScore}` : `${res.score - r.resumeScore}`) : "—"
    console.log(`  ${r.candidateName.padEnd(28).slice(0, 28)} ${String(r.resumeScore ?? "—").padStart(4)} → ${String(res.score).padStart(3)} (Δ${dStr})`)

    if (opts.apply) {
      await db.update(candidates).set({ resumeScore: res.score }).where(eq(candidates.id, r.candidateId))
      updated++
    }
    await sleep(300)
  }

  console.log(`\n  ${opts.apply ? `Обновлено: ${updated}` : "DRY-RUN — ничего не записано (добавьте --apply)"}, ошибок: ${failed}\n`)
  await pgClient.end({ timeout: 5 })
  process.exit(0)
}

main().catch((err) => {
  console.error("Фатальная ошибка:", err instanceof Error ? err.message : err)
  pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ }).finally(() => process.exit(1))
})
