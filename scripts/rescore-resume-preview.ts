/**
 * scripts/rescore-resume-preview.ts
 *
 * DRY-RUN превью новой AI-оценки резюме (candidates.resume_score, колонка
 * «AI-резюме» в списке). Берёт кандидатов вакансии, для каждого воспроизводит
 * ТОТ ЖЕ вход, что боевой process-queue (резюме из hh_responses.raw_data +
 * колонки candidates; критерии — из Spec «Кого ищем» либо legacy-анкеты),
 * вызывает НОВЫЙ screenResume и печатает таблицу «Имя | было | стало | Δ».
 *
 * НИЧЕГО НЕ ПИШЕТ В БД. Только SELECT + печать. Применение — отдельным
 * скриптом scripts/rescore-resume-apply.ts.
 *
 * Запуск:
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... \
 *     pnpm exec tsx scripts/rescore-resume-preview.ts [--vacancy-id <uuid>] [--limit N]
 *
 * Дефолтная вакансия: 6916db01-a765-4c4e-a652-81475566f95b
 *
 * ВАЖНО: воспроизводит боевую логику выбора критериев из process-queue:
 *   - Spec-скоринг включён по умолчанию (isSpecScoringEnabled), КРОМЕ
 *     SPEC_SCORING_LEGACY_VACANCY_IDS.
 *   - Контур «Портрет» (vacancies.portrait_scoring=true) → respectHardness.
 *   - Fallback на legacy-анкету (description_json.anketa), если Spec пуст.
 */

import { eq, and, isNotNull, desc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { screenResume, hasSubstantiveRoleHistory, type ResumeScreenInput } from "@/lib/ai-screen-resume"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { getSpec } from "@/lib/core/spec/store"
import {
  buildSpecResumeInput,
  isSpecScoringEnabled,
  specHasScoringContent,
} from "@/lib/core/spec/resume-input"

const DEFAULT_VACANCY_ID = "6916db01-a765-4c4e-a652-81475566f95b"

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { vacancyId: string; limit: number; help: boolean } {
  const args = argv.slice(2)
  let vacancyId = DEFAULT_VACANCY_ID
  let limit = 200
  let help = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a === "--vacancy-id" && args[i + 1]) { vacancyId = args[++i]; continue }
    if (a === "--limit" && args[i + 1]) { limit = Math.min(500, Math.max(1, parseInt(args[++i], 10) || 200)); continue }
  }
  return { vacancyId, limit, help }
}

function printHelp() {
  console.log(`
rescore-resume-preview — DRY-RUN превью новой AI-оценки резюме (НЕ пишет в БД)

ИСПОЛЬЗОВАНИЕ:
  DATABASE_URL=... ANTHROPIC_API_KEY=... \\
    pnpm exec tsx scripts/rescore-resume-preview.ts [опции]

ОПЦИИ:
  --vacancy-id <uuid>  Вакансия (default ${DEFAULT_VACANCY_ID})
  --limit N            Кол-во кандидатов (default 200, max 500)
  --help               Эта справка

ВЫХОД:
  stdout — таблица «Имя | было | стало | Δ», отсортировано по стало (убыв.),
           слабые (стало<45) помечены 🔴.

ЧТО ДЕЛАЕТ:
  Воспроизводит боевой вход screenResume из process-queue (Spec/Портрет/legacy)
  и считает НОВЫЙ балл тем же скорером. НИКАКИХ UPDATE — только SELECT + печать.
`)
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function trunc(s: string, n: number): string {
  const str = s ?? ""
  if (str.length <= n) return str.padEnd(n)
  return str.slice(0, n - 1) + "…"
}

async function screenWithRetry(input: ResumeScreenInput, retries = 1): Promise<Awaited<ReturnType<typeof screenResume>>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await screenResume(input)
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`  [retry ${attempt + 1}/${retries}] ${err instanceof Error ? err.message : err}`)
      await sleep(1500)
    }
  }
  return null
}

interface Row {
  candidateId: string
  name: string
  oldScore: number | null   // текущий resume_score в БД
  newScore: number | null   // пересчитанный (null = не удалось)
  delta: number | null
  verdict: string | null
  summary: string | null
  // Восстановилась ли из raw_data содержательная история должностей. Если нет —
  // вход обеднён (в БД только сырое hh-превью без experience[]), «было» считалось
  // вживую на полном резюме, а «стало» — на обеднённом. Сравнение недостоверно.
  inputComplete: boolean
  workHistoryLen: number
  error?: string
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) { printHelp(); process.exit(0) }

  if (!process.env.DATABASE_URL) {
    console.error("Ошибка: DATABASE_URL не задан")
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ПРЕДУПРЕЖДЕНИЕ: ANTHROPIC_API_KEY не задан — скоринг вернёт null")
  }

  console.log(`\n[${new Date().toISOString()}] rescore-resume-preview (DRY-RUN, не пишет в БД)`)
  console.log(`  Вакансия: ${opts.vacancyId}`)

  const [vac] = await db
    .select({
      id:               vacancies.id,
      title:            vacancies.title,
      city:             vacancies.city,
      descriptionJson:  vacancies.descriptionJson,
      portraitScoring:  vacancies.portraitScoring,
    })
    .from(vacancies)
    .where(eq(vacancies.id, opts.vacancyId))
    .limit(1)

  if (!vac) {
    console.error("Вакансия не найдена")
    await pgClient.end({ timeout: 5 })
    process.exit(1)
  }
  console.log(`  Название: "${vac.title}"`)

  // ── Как process-queue выбирает критерии ────────────────────────────────────
  const portraitOn = vac.portraitScoring === true
  let specVacancyInput: ResumeScreenInput["vacancy"] | null = null
  let mode = "legacy-анкета"

  if (isSpecScoringEnabled(vac.id) || portraitOn) {
    try {
      const spec = await getSpec(vac.id)
      const useSpec = !!spec && (portraitOn
        ? specHasScoringContent(spec)
        : (spec.mustHave.length > 0 || spec.portraitRequiredSkills.length > 0))
      if (spec && useSpec) {
        // resume подставим на каждого кандидата ниже; здесь только vacancy-часть.
        const dummy = buildSpecResumeInput({}, { title: vac.title, city: vac.city }, spec, { respectHardness: portraitOn })
        specVacancyInput = dummy.vacancy
        mode = portraitOn ? "Spec / Портрет" : "Spec"
      }
    } catch (err) {
      console.warn(`  Spec недоступен, fallback на legacy: ${err instanceof Error ? err.message : err}`)
    }
  }

  // legacy-анкета (fallback) — как в process-queue.
  const descJson = (vac.descriptionJson ?? {}) as Record<string, unknown>
  const anketa = (descJson.anketa as Record<string, unknown> | undefined) ?? {}
  const legacyVacancyInput: ResumeScreenInput["vacancy"] = {
    title:                vac.title,
    city:                 vac.city,
    aiIdealProfile:       (anketa.aiIdealProfile as string | undefined) ?? null,
    aiRequiredHardSkills: (anketa.aiRequiredHardSkills as string[] | undefined) ?? null,
    aiStopFactors:        (anketa.aiStopFactors as string[] | undefined) ?? null,
    screeningQuestions:   (anketa.screeningQuestions as string[] | undefined) ?? null,
    aiWeights:            (anketa.aiWeights as Record<string, string> | undefined) ?? null,
    customCriteria:       (anketa.aiCustomCriteria as { label: string; weight: string }[] | undefined) ?? null,
  }

  const vacancyInput = specVacancyInput ?? legacyVacancyInput
  console.log(`  Режим критериев: ${mode}`)

  // ── Кандидаты (с уже выставленным resume_score) ────────────────────────────
  console.log(`\n  Загрузка кандидатов (limit=${opts.limit}, resume_score IS NOT NULL)…`)
  const rows = await db
    .select({
      candidateId:      candidates.id,
      candidateName:    candidates.name,
      candidateCity:    candidates.city,
      salaryMin:        candidates.salaryMin,
      experienceYears:  candidates.experienceYears,
      keySkills:        candidates.keySkills,
      skills:           candidates.skills,
      educationLevel:   candidates.educationLevel,
      workFormat:       candidates.workFormat,
      languages:        candidates.languages,
      relocationReady:  candidates.relocationReady,
      professionalRoles:candidates.professionalRoles,
      citizenshipNames: candidates.citizenshipNames,
      resumeScore:      candidates.resumeScore,
      hhRawData:        hhResponses.rawData,
    })
    .from(candidates)
    .leftJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
    .where(and(
      eq(candidates.vacancyId, vac.id),
      isNotNull(candidates.resumeScore),
    ))
    .orderBy(desc(candidates.createdAt))
    .limit(opts.limit)

  // Дедуп по candidateId (leftJoin может дать несколько hh-строк).
  const seen = new Set<string>()
  const uniqueRows = rows.filter(r => (seen.has(r.candidateId) ? false : (seen.add(r.candidateId), true)))
  console.log(`  Найдено кандидатов: ${uniqueRows.length}`)

  if (uniqueRows.length === 0) {
    console.log("\n  Нет кандидатов с resume_score — выход.")
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  // ── Пересчёт (конкурентность 2, retry 1) ────────────────────────────────────
  console.log(`\n  Пересчёт новым скорером…\n`)
  const results: Row[] = []
  const CONCURRENCY = 2

  for (let i = 0; i < uniqueRows.length; i += CONCURRENCY) {
    const batch = uniqueRows.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(async (r): Promise<Row> => {
      const raw = r.hhRawData as { resume?: Record<string, unknown> } | null
      const extracted = extractHhResumeFields(raw?.resume)

      const resumeObj: ResumeScreenInput["resume"] = {
        name:             r.candidateName,
        city:             r.candidateCity ?? extracted.city ?? null,
        salaryMin:        r.salaryMin ?? extracted.salaryMin ?? null,
        experienceYears:  r.experienceYears ?? extracted.experienceYears ?? null,
        keySkills:        (r.keySkills as string[] | null) ?? extracted.keySkills ?? null,
        skills:           (r.skills as string[] | null) ?? extracted.skills ?? null,
        educationLevel:   r.educationLevel ?? extracted.educationLevel ?? null,
        workFormat:       r.workFormat ?? extracted.workFormat ?? null,
        languages:        (r.languages as string[] | null) ?? extracted.languages ?? null,
        relocationReady:  r.relocationReady ?? extracted.relocationReady ?? null,
        professionalRoles:(r.professionalRoles as string[] | null) ?? extracted.professionalRoles ?? null,
        citizenshipNames: (r.citizenshipNames as string[] | null) ?? extracted.citizenshipNames ?? null,
        // Новое: история занятости из raw hh (главный сигнал релевантности).
        workHistory:      extracted.workHistory ?? null,
      }

      // Достоверность входа: удалось ли восстановить содержательную историю
      // должностей из raw_data. Нет → «стало» посчитано на обеднённом входе,
      // а «было» бралось из live-скоринга на полном резюме → сравнение неверно.
      const workHistoryLen = resumeObj.workHistory?.length ?? 0
      const inputComplete = hasSubstantiveRoleHistory(resumeObj)

      let newScore: number | null = null
      let verdict: string | null = null
      let summary: string | null = null
      let error: string | undefined
      try {
        const res = await screenWithRetry({ resume: resumeObj, vacancy: vacancyInput })
        if (res) { newScore = res.score; verdict = res.verdict; summary = res.summary }
        else error = "screenResume вернул null (нет ключа/недоступен API)"
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        console.warn(`  ✗ ${r.candidateName}: ${error}`)
      }

      const oldScore = r.resumeScore ?? null
      const delta = newScore !== null && oldScore !== null ? newScore - oldScore : null
      return { candidateId: r.candidateId, name: r.candidateName, oldScore, newScore, delta, verdict, summary, inputComplete, workHistoryLen, error }
    }))
    results.push(...batchResults)
    console.log(`  …${Math.min(i + CONCURRENCY, uniqueRows.length)}/${uniqueRows.length}`)
    if (i + CONCURRENCY < uniqueRows.length) await sleep(600)
  }

  // ── Таблица (сортировка по новому баллу, убыв.) ─────────────────────────────
  const sorted = [...results].sort((a, b) => (b.newScore ?? -1) - (a.newScore ?? -1))

  console.log("\n" + "═".repeat(84))
  console.log(` РЕЗУЛЬТАТ — вакансия "${vac.title}" (${mode})`)
  console.log("═".repeat(84))
  console.log(` ${"Имя".padEnd(26)} | было | стало |   Δ   | вход | вердикт`)
  console.log("─".repeat(84))
  for (const r of sorted) {
    const oldS = r.oldScore != null ? String(r.oldScore).padStart(4) : "  — "
    // Флаг достоверности входа: ⚠ = обеднён (нет истории должностей в raw_data).
    const inp = r.inputComplete ? " ok " : " ⚠  "
    if (r.newScore === null) {
      console.log(` ${trunc(r.name, 26)} | ${oldS} |  N/A  |   —   |${inp}| ${r.error ?? "ошибка"}`)
      continue
    }
    const newS = String(r.newScore).padStart(5)
    const dStr = r.delta === null ? "  —  " : (r.delta >= 0 ? `+${r.delta}` : `${r.delta}`).padStart(5)
    const weak = r.newScore < 45 ? " 🔴" : ""
    console.log(` ${trunc(r.name, 26)} | ${oldS} | ${newS} | ${dStr} |${inp}| ${r.verdict ?? ""}${weak}`)
    // Обоснование «за счёт чего» — вторая строка под кандидатом (почему такой балл).
    if (r.summary) console.log(`      └─ ${r.summary}`)
  }
  console.log("─".repeat(84))

  // ── Сводка ──────────────────────────────────────────────────────────────────
  // Достоверную статистику Δ считаем ТОЛЬКО по кандидатам с полным входом:
  // у обеднённых «было» бралось из live-скоринга на полном hh-резюме (с
  // ролями), а «стало» посчитано на обеднённом входе из raw_data → сравнение
  // невалидно и завышало бы разброс.
  const scored     = results.filter(r => r.newScore !== null)
  const impoverished = results.filter(r => !r.inputComplete)
  const valid      = scored.filter(r => r.inputComplete)
  const withDelta  = valid.filter(r => r.delta !== null)
  const avgDelta = withDelta.length ? Math.round(withDelta.reduce((s, r) => s + r.delta!, 0) / withDelta.length) : 0
  const avgAbs   = withDelta.length ? Math.round(withDelta.reduce((s, r) => s + Math.abs(r.delta!), 0) / withDelta.length) : 0
  const raised   = withDelta.filter(r => r.delta! > 0).length
  const lowered  = withDelta.filter(r => r.delta! < 0).length
  const weakNew  = valid.filter(r => r.newScore! < 45).length
  const weakOld  = valid.filter(r => r.oldScore != null && r.oldScore < 45).length

  console.log(`  Оценено:            ${scored.length} из ${results.length} (ошибок: ${results.length - scored.length})`)
  console.log(`  Достоверный вход:   ${valid.length}   ⚠ обеднённый вход: ${impoverished.length} (исключены из статистики Δ)`)
  console.log(`  ── статистика ТОЛЬКО по достоверным (${withDelta.length}) ──`)
  console.log(`  Средний Δ:          ${avgDelta >= 0 ? "+" : ""}${avgDelta} (|Δ| среднее ${avgAbs})`)
  console.log(`  Балл вырос:         ${raised}   Балл упал: ${lowered}`)
  console.log(`  Слабых (<45):       было ${weakOld} → стало ${weakNew}`)
  if (impoverished.length > 0) {
    console.log(`\n  ⚠️  У ${impoverished.length} кандидатов в raw_data нет истории должностей (experience[]).`)
    console.log(`      Для них «было» считалось вживую на полном hh-резюме, «стало» — на`)
    console.log(`      обеднённом входе. Сравнение недостоверно; масс-апдейт по ним делать`)
    console.log(`      НЕЛЬЗЯ, пока не будет исходного резюме (репарсинг с hh).`)
  }
  console.log(`\n  ⚠️  Это ПРЕВЬЮ. Ни одно поле в БД не изменено.`)
  console.log(`      Применить: scripts/rescore-resume-apply.ts (тот же вход, но с UPDATE).\n`)

  await pgClient.end({ timeout: 5 })
  process.exit(0)
}

main().catch((err) => {
  console.error("Фатальная ошибка:", err instanceof Error ? err.message : err)
  pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ }).finally(() => process.exit(1))
})
