/**
 * scripts/mass-rescore-vacancy.ts
 *
 * Массовый пересчёт AI-баллов кандидатов ОДНОЙ вакансии по измерениям
 * «Портрет» (resume + portrait) и «Анкета» (answers) — после фиксов 05.07
 * (вход Портрета с workHistory для осевого скоринга; единый балл анкеты,
 * см. lib/demo/unified-score.ts).
 *
 * Переиспользует ТОЧНО те же вызовы, что и живой рескор-роут
 * app/api/modules/hr/vacancies/[id]/rescore/route.ts (dimension resume/
 * portrait/answers) — тот же гейт Spec/portraitScoring, тот же осевой
 * скоринг с workHistory из hh_responses.raw_data, тот же scoreCandidateV2 /
 * scoreDemoAnswers. Разница только в том, что роут ограничен 50 кандидатами
 * за раз (UI-выделение) — здесь проходим всю вакансию пачками с паузами,
 * без ограничения в 50.
 *
 * НЕ двигает стадии, НЕ шлёт кандидатам/HR никаких сообщений и уведомлений —
 * все три используемые функции (screenResume/scoreResumeByAxes,
 * scoreCandidateV2, scoreDemoAnswers) — чистый скоринг + запись баллов,
 * без side-effects (проверено чтением их исходников — единственный побочный
 * эффект — addVacancyTokens, учёт токенов, не влияет на кандидата).
 *
 * Конкуренция: максимум 3 кандидата одновременно, между пачками пауза
 * 1-2 сек (не душить прод и AI rate-limit).
 *
 * Аргументы CLI:
 *   --vacancy=<uuid>         обязателен
 *   --dims=resume,portrait,answers   по умолчанию все три
 *   --limit=<n>              взять только первых N кандидатов (смоук-тест)
 *   --only-stale             пропускать кандидатов, у которых updated_at
 *                            уже ПОЗЖЕ момента запуска скрипта — резюмируемость
 *                            после обрыва (перезапуск того же вызова подхватит
 *                            только ещё не тронутых).
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env.local scripts/mass-rescore-vacancy.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b --limit=3
 *
 * Требует env: DATABASE_URL, ANTHROPIC_API_KEY (+ CLAUDE_PROXY_URL опц.).
 */

import { and, eq, inArray, desc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { screenResume } from "@/lib/ai-screen-resume"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { scoreCandidateV2 } from "@/lib/ai-score-candidate-v2"
import { isSpecScoringEnabled, buildSpecResumeInput, specHasScoringContent } from "@/lib/core/spec/resume-input"
import { getSpec } from "@/lib/core/spec/store"
import { scoreResumeByAxes } from "@/lib/core/spec/axis-scorer"
import { scoreDemoAnswers } from "@/lib/demo/score-answers"

// ─── CLI args ──────────────────────────────────────────────────────────────

type Dim = "resume" | "portrait" | "answers"
const ALL_DIMS: Dim[] = ["resume", "portrait", "answers"]
const CONCURRENCY = 3
const BATCH_PAUSE_MS = 1500 // между пачками 1-2 сек

interface Options {
  vacancyId: string
  dims: Dim[]
  limit: number | null
  onlyStale: boolean
  help: boolean
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2)
  let vacancyId = ""
  let dims: Dim[] = ALL_DIMS
  let limit: number | null = null
  let onlyStale = false
  let help = false
  for (const a of args) {
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a === "--only-stale") { onlyStale = true; continue }
    if (a.startsWith("--vacancy=")) { vacancyId = a.slice("--vacancy=".length).trim(); continue }
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
      continue
    }
    if (a.startsWith("--dims=")) {
      const raw = a.slice("--dims=".length).split(",").map(s => s.trim()).filter(Boolean)
      const valid = raw.filter((d): d is Dim => (ALL_DIMS as string[]).includes(d))
      if (valid.length) dims = valid
      continue
    }
  }
  return { vacancyId, dims, limit, onlyStale, help }
}

function printHelp() {
  console.log(`mass-rescore-vacancy — массовый пересчёт «Портрет»/«Анкета» по вакансии.

  --vacancy=<uuid>                 ОБЯЗАТЕЛЕН — id вакансии
  --dims=resume,portrait,answers    по умолчанию все три (через запятую)
  --limit=<n>                      только первые N кандидатов (смоук-тест)
  --only-stale                     пропускать кандидатов, обновлённых уже
                                    ПОСЛЕ старта этого запуска скрипта
                                    (резюмируемость после обрыва)

Пример смоука:
  pnpm exec tsx --env-file=.env.local scripts/mass-rescore-vacancy.ts \\
    --vacancy=6916db01-a765-4c4e-a652-81475566f95b --limit=3
`)
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) { printHelp(); process.exit(0) }
  if (!opts.vacancyId) {
    console.error("Ошибка: --vacancy=<uuid> обязателен. --help для справки.")
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL не задан"); process.exit(1) }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY не задан"); process.exit(1) }

  const scriptStartedAt = new Date()
  console.log(`\n[${scriptStartedAt.toISOString()}] mass-rescore-vacancy`)
  console.log(`  Вакансия: ${opts.vacancyId}`)
  console.log(`  Измерения: ${opts.dims.join(", ")}`)
  if (opts.limit) console.log(`  Лимит (смоук): ${opts.limit}`)
  if (opts.onlyStale) console.log(`  --only-stale: пропускаем уже обновлённых после старта скрипта`)

  const [vac] = await db
    .select({
      id: vacancies.id,
      title: vacancies.title,
      city: vacancies.city,
      companyId: vacancies.companyId,
      descriptionJson: vacancies.descriptionJson,
      portraitScoring: vacancies.portraitScoring,
    })
    .from(vacancies)
    .where(eq(vacancies.id, opts.vacancyId))
    .limit(1)
  if (!vac) {
    console.error("Вакансия не найдена")
    await pgClient.end({ timeout: 5 })
    process.exit(1)
  }

  const dj = (vac.descriptionJson ?? {}) as Record<string, unknown>
  const anketa = dj.anketa as Record<string, unknown> | undefined

  // Кандидаты вакансии, не удалённые (фильтр deletedAt — после выборки, т.к.
  // это soft-delete-поле и проще отфильтровать в JS вместе с --only-stale).
  const allCandRows = await db
    .select({
      id: candidates.id,
      name: candidates.name,
      city: candidates.city,
      salaryMin: candidates.salaryMin,
      experienceYears: candidates.experienceYears,
      keySkills: candidates.keySkills,
      skills: candidates.skills,
      educationLevel: candidates.educationLevel,
      workFormat: candidates.workFormat,
      languages: candidates.languages,
      relocationReady: candidates.relocationReady,
      professionalRoles: candidates.professionalRoles,
      citizenshipNames: candidates.citizenshipNames,
      anketaAnswers: candidates.anketaAnswers,
      updatedAt: candidates.updatedAt,
      deletedAt: candidates.deletedAt,
    })
    .from(candidates)
    .where(and(eq(candidates.vacancyId, opts.vacancyId)))
    .orderBy(desc(candidates.createdAt))

  let cands = allCandRows.filter(c => c.deletedAt == null)

  if (opts.onlyStale) {
    const before = cands.length
    cands = cands.filter(c => !(c.updatedAt && c.updatedAt.getTime() > scriptStartedAt.getTime()))
    console.log(`  --only-stale: ${before} → ${cands.length} (пропущено уже свежих: ${before - cands.length})`)
  }

  if (opts.limit) cands = cands.slice(0, opts.limit)

  console.log(`  Кандидатов к обработке: ${cands.length}\n`)

  const ids = cands.map(c => c.id)

  // ── Гейт Portrait/Spec для resume — идентично рескор-роуту ────────────────
  const specForResume = (opts.dims.includes("resume") && (isSpecScoringEnabled(opts.vacancyId) || vac.portraitScoring === true))
    ? await getSpec(opts.vacancyId)
    : null

  const useSpecForResume = !!specForResume
    && (vac.portraitScoring === true
      ? specHasScoringContent(specForResume)
      : (specForResume.mustHave.length > 0 || specForResume.portraitRequiredSkills.length > 0))

  // ── workHistory для осевого скоринга — из hh_responses.rawData ────────────
  const workHistoryByCand = new Map<string, NonNullable<ReturnType<typeof extractHhResumeFields>["workHistory"]>>()
  if (specForResume?.scoringMode === "axes" && ids.length > 0) {
    const hhRows = await db
      .select({ cid: hhResponses.localCandidateId, rawData: hhResponses.rawData })
      .from(hhResponses)
      .where(inArray(hhResponses.localCandidateId, ids))
    for (const row of hhRows) {
      if (!row.cid || workHistoryByCand.has(row.cid)) continue
      const raw = row.rawData as { resume?: Record<string, unknown> } | null
      const wh = extractHhResumeFields(raw?.resume).workHistory
      if (wh && wh.length) workHistoryByCand.set(row.cid, wh)
    }
  }

  // ── Счётчики итоговой сводки ───────────────────────────────────────────────
  const summary = {
    resume:   { updated: 0, skipped: 0, errors: 0 },
    portrait: { updated: 0, skipped: 0, errors: 0 },
    answers:  { updated: 0, skipped: 0, errors: 0 },
  }
  let processedCount = 0
  const total = cands.length

  // ── Обработчик одного кандидата (все запрошенные измерения последовательно
  //    для этого кандидата, чтобы не плодить лишний параллелизм внутри) ──────
  async function processOne(c: typeof cands[number], index: number): Promise<void> {
    const label = `${index + 1}/${total}`
    for (const dim of opts.dims) {
      try {
        if (dim === "resume") {
          const resumeForScreen = {
            name: c.name, city: c.city, salaryMin: c.salaryMin,
            experienceYears: c.experienceYears, keySkills: c.keySkills, skills: c.skills,
            educationLevel: c.educationLevel, workFormat: c.workFormat, languages: c.languages,
            relocationReady: c.relocationReady, professionalRoles: c.professionalRoles,
            citizenshipNames: c.citizenshipNames,
          }
          const axWorkHistory = workHistoryByCand.get(c.id)
          const [prevRow] = await db.select({ resumeScore: candidates.resumeScore }).from(candidates).where(eq(candidates.id, c.id)).limit(1)
          const oldScore = prevRow?.resumeScore ?? null

          if (specForResume?.scoringMode === "axes" && axWorkHistory) {
            const ax = await scoreResumeByAxes(
              { ...resumeForScreen, workHistory: axWorkHistory },
              { title: vac.title, city: vac.city },
              specForResume,
              opts.vacancyId,
            )
            if (ax) {
              await db.update(candidates)
                .set({ resumeScore: ax.score, aiScoreBreakdown: ax })
                .where(eq(candidates.id, c.id))
              summary.resume.updated++
              console.log(`  ${label} [resume/axes] ${c.id} ${oldScore ?? "—"} → ${ax.score}`)
              continue
            }
            // ax === null → falls through to screenResume ниже (как в роуте).
          }
          const r = await screenResume(
            useSpecForResume && specForResume
              ? buildSpecResumeInput(resumeForScreen, { title: vac.title, city: vac.city }, specForResume, { respectHardness: vac.portraitScoring === true })
              : {
                  resume: resumeForScreen,
                  vacancy: {
                    title: vac.title, city: vac.city,
                    aiIdealProfile: (anketa?.aiIdealProfile as string | undefined) ?? null,
                    aiRequiredHardSkills: (anketa?.aiRequiredHardSkills as string[] | undefined) ?? null,
                    aiStopFactors: (anketa?.aiStopFactors as string[] | undefined) ?? null,
                    screeningQuestions: (anketa?.screeningQuestions as string[] | undefined) ?? null,
                    aiWeights: (anketa?.aiWeights as Record<string, string> | undefined) ?? null,
                    customCriteria: (anketa?.aiCustomCriteria as { label: string; weight: string }[] | undefined) ?? null,
                  },
                },
          )
          if (r) {
            await db.update(candidates).set({ resumeScore: r.score, aiScoreBreakdown: null }).where(eq(candidates.id, c.id))
            summary.resume.updated++
            console.log(`  ${label} [resume] ${c.id} ${oldScore ?? "—"} → ${r.score}`)
          } else {
            summary.resume.skipped++
            console.log(`  ${label} [resume] ${c.id} пропущен (screenResume вернул null)`)
          }
        } else if (dim === "portrait") {
          const [prevRow] = await db.select({ aiScoreV2: candidates.aiScoreV2 }).from(candidates).where(eq(candidates.id, c.id)).limit(1)
          const oldScore = prevRow?.aiScoreV2 ?? null
          const v2 = await scoreCandidateV2({ candidateId: c.id, vacancyId: opts.vacancyId, skipIfScored: false })
          if (v2) {
            await db.update(candidates).set({
              aiScoreV2:        v2.score,
              aiScoreV2Details: v2,
              aiScoredAt:       new Date(),
            }).where(eq(candidates.id, c.id))
            summary.portrait.updated++
            console.log(`  ${label} [portrait] ${c.id} ${oldScore ?? "—"} → ${v2.score}`)
          } else {
            summary.portrait.skipped++
            console.log(`  ${label} [portrait] ${c.id} пропущен (нет критериев Портрета)`)
          }
        } else if (dim === "answers") {
          if (!c.anketaAnswers || (Array.isArray(c.anketaAnswers) && c.anketaAnswers.length === 0)) {
            summary.answers.skipped++
            console.log(`  ${label} [answers] ${c.id} пропущен (анкета не сдана)`)
            continue
          }
          const [prevRow] = await db.select({ demoAnswersScore: candidates.demoAnswersScore }).from(candidates).where(eq(candidates.id, c.id)).limit(1)
          const oldScore = prevRow?.demoAnswersScore ?? null
          const r = await scoreDemoAnswers({ candidateId: c.id, vacancyId: opts.vacancyId, skipIfScored: false })
          if (r != null) {
            summary.answers.updated++
            console.log(`  ${label} [answers] ${c.id} ${oldScore ?? "—"} → ${r.score}`)
          } else {
            summary.answers.skipped++
            console.log(`  ${label} [answers] ${c.id} пропущен (scoreDemoAnswers вернул null — нет реальных ответов)`)
          }
        }
      } catch (e) {
        summary[dim].errors++
        console.error(`  ${label} [${dim}] ${c.id} ОШИБКА:`, e instanceof Error ? e.message : e)
      }
    }
  }

  // ── Пачки по CONCURRENCY с паузой между пачками ────────────────────────────
  for (let i = 0; i < cands.length; i += CONCURRENCY) {
    const batch = cands.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map((c, j) => processOne(c, i + j)))
    processedCount += batch.length
    if (i + CONCURRENCY < cands.length) {
      await sleep(BATCH_PAUSE_MS)
    }
  }

  // ── Итоговая сводка ─────────────────────────────────────────────────────────
  console.log(`\n=== ИТОГО (обработано кандидатов: ${processedCount}/${total}) ===`)
  for (const dim of opts.dims) {
    const s = summary[dim]
    console.log(`  ${dim.padEnd(9)} обновлено=${s.updated} пропущено=${s.skipped} ошибок=${s.errors}`)
  }
  console.log("")
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[mass-rescore-vacancy] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
