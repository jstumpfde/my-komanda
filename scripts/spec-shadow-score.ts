/**
 * scripts/spec-shadow-score.ts
 *
 * Теневая оценка кандидатов по Spec (R4 Candidate Spec) с сравнением
 * против боевого resume_score. БЕЗ записи в боевые колонки.
 *
 * Запуск:
 *   pnpm exec tsx scripts/spec-shadow-score.ts --vacancy-id <uuid> [--limit 30]
 *   pnpm exec tsx scripts/spec-shadow-score.ts --vacancy-title "Помощник по маркетингу" [--limit 30]
 *   pnpm exec tsx scripts/spec-shadow-score.ts --vacancy-id <uuid> --transfer-from-portrait
 *   pnpm exec tsx scripts/spec-shadow-score.ts --help
 *
 * Режимы:
 *   --vacancy-id <uuid>          — целевая вакансия по ID
 *   --vacancy-title <substring>  — поиск вакансии по подстроке заголовка (case-insensitive)
 *   --transfer-from-portrait     — если Spec пуст: выполнить маппинг «Перенести из Портрета»
 *                                   и сохранить Spec (спящий контур, боевое не меняет)
 *   --limit N                    — кол-во кандидатов (default 30, max 200)
 *
 * Выход:
 *   /tmp/spec-shadow-<vacancyId>.json  — подробный JSON
 *   stdout                             — читаемая таблица + сводка
 *
 * DATABASE_URL берётся из env. Требует запущенного PostgreSQL и таблицы
 * vacancy_specs (миграция 0197).
 */

import { eq, and, isNotNull, desc, ilike } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, hhResponses, vacancySpecs } from "@/lib/db/schema"
import type { CandidateSpec } from "@/lib/core/spec/types"
import { buildSpecFromLegacy } from "@/lib/core/spec/from-legacy"
import { screenResume, type ResumeScreenInput } from "@/lib/ai-screen-resume"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { writeFileSync } from "fs"

// ─── CLI-парсер ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  vacancyId?: string
  vacancyTitle?: string
  transferFromPortrait: boolean
  rerunLegacy: boolean
  limit: number
  help: boolean
} {
  const args = argv.slice(2)
  let vacancyId: string | undefined
  let vacancyTitle: string | undefined
  let transferFromPortrait = false
  let rerunLegacy = false
  let limit = 30
  let help = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a === "--transfer-from-portrait") { transferFromPortrait = true; continue }
    if (a === "--rerun-legacy") { rerunLegacy = true; continue }
    if (a === "--vacancy-id" && args[i + 1]) { vacancyId = args[++i]; continue }
    if (a === "--vacancy-title" && args[i + 1]) { vacancyTitle = args[++i]; continue }
    if (a === "--limit" && args[i + 1]) {
      const n = parseInt(args[++i], 10)
      if (!Number.isNaN(n)) limit = Math.max(1, Math.min(200, n))
      continue
    }
  }

  return { vacancyId, vacancyTitle, transferFromPortrait, rerunLegacy, limit, help }
}

function printHelp() {
  console.log(`
spec-shadow-score — теневая оценка кандидатов по Spec (R4)

ИСПОЛЬЗОВАНИЕ:
  pnpm exec tsx scripts/spec-shadow-score.ts --vacancy-id <uuid> [options]
  pnpm exec tsx scripts/spec-shadow-score.ts --vacancy-title <подстрока> [options]

ОПЦИИ:
  --vacancy-id <uuid>          Целевая вакансия по ID
  --vacancy-title <подстрока>  Поиск вакансии (case-insensitive, первое совпадение)
  --transfer-from-portrait     Если Spec пуст — перенести из Портрета кандидата
                                (сохраняет в vacancy_specs, спящий контур)
  --rerun-legacy               Честное A/B: пересчитать и legacy-оценку сейчас
                                (тем же screenResume с legacy-критериями), сравнение
                                идёт с пересчитанной, а не с сохранённой в БД
  --limit N                    Кол-во кандидатов для оценки (default 30, max 200)
  --help                       Эта справка

ВЫХОД:
  stdout            — таблица сравнения + сводка
  /tmp/spec-shadow-<vacancyId>.json — подробный JSON

ТРЕБОВАНИЯ:
  DATABASE_URL      — строка подключения к PostgreSQL (из .env)
  ANTHROPIC_API_KEY — ключ Anthropic (или CLAUDE_PROXY_URL для прокси)
  Таблица vacancy_specs — должна существовать (миграция 0197)

ПОЛИГОН:
  pnpm exec tsx scripts/spec-shadow-score.ts \\
    --vacancy-title "Помощник по маркетингу" \\
    --transfer-from-portrait \\
    --limit 30
`)
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Определить зону по порогам */
function getZone(score: number, upper: number, lower: number): "green" | "yellow" | "red" {
  if (score >= upper) return "green"
  if (score >= lower) return "yellow"
  return "red"
}

function zoneEmoji(z: "green" | "yellow" | "red"): string {
  return z === "green" ? "🟢" : z === "yellow" ? "🟡" : "🔴"
}

/** Обрезать строку для таблицы */
function trunc(s: string, n: number): string {
  if (s.length <= n) return s.padEnd(n)
  return s.slice(0, n - 1) + "…"
}

// ─── Spec-промпт builder ─────────────────────────────────────────────────────

/**
 * Строит ResumeScreenInput для screenResume(), подставляя критерии/стоп-факторы
 * из Spec вместо legacy-портрета.
 *
 * Ключевые различия от боевого скоринга:
 * - idealProfile берётся из spec.idealProfile (объединяет v2 + v1 portrait)
 * - aiRequiredHardSkills = spec.mustHave (v2) || spec.portraitRequiredSkills (v1 fallback)
 * - aiStopFactors = spec.portraitKnockouts (текстовые нокауты) — структурные
 *   стоп-факторы (city/age/format) в screenResume не проверяются (нет полей в резюме-объекте),
 *   они здесь записываются как текст для AI-контекста
 * - aiWeights строится из spec.scoringWeights (9-осевые числовые веса) или
 *   spec.customCriteria (если есть)
 * - screeningQuestions — из spec.mustHave как "проверочные вопросы"
 */
function buildSpecResumeInput(
  resume: ResumeScreenInput["resume"],
  vacancy: { title: string; city?: string | null },
  spec: CandidateSpec,
): ResumeScreenInput {
  // must-have: v2-критерии (mustHave) или v1-портрет (portraitRequiredSkills)
  const mustHave = spec.mustHave.length > 0
    ? spec.mustHave
    : spec.portraitRequiredSkills

  // nice-to-have → screeningQuestions (не стоп-факторы, но учитываются в оценке)
  const niceToHave = spec.niceToHave.length > 0
    ? spec.niceToHave
    : spec.portraitNiceSkills

  // deal-breakers + текстовые нокауты из портрета
  const knockouts = [
    ...spec.dealBreakers,
    ...spec.portraitKnockouts,
  ]

  // Структурные стоп-факторы переводим в текст для AI (city/format/age)
  const structuralStops: string[] = []
  const sf = spec.stopFactors
  if (sf.city?.enabled && sf.city.allowedCities?.length) {
    structuralStops.push(`Только города: ${sf.city.allowedCities.join(", ")}`)
  }
  if (sf.format?.enabled && sf.format.allowedFormats?.length) {
    structuralStops.push(`Формат работы: ${sf.format.allowedFormats.join(", ")}`)
  }
  if (sf.age?.enabled) {
    const parts: string[] = []
    if (sf.age.minAge != null) parts.push(`от ${sf.age.minAge}`)
    if (sf.age.maxAge != null) parts.push(`до ${sf.age.maxAge}`)
    if (parts.length) structuralStops.push(`Возраст: ${parts.join(" ")} лет`)
  }
  if (sf.experience?.enabled && sf.experience.minYears != null) {
    structuralStops.push(`Опыт не менее ${sf.experience.minYears} лет`)
  }

  const allKnockouts = [...knockouts, ...structuralStops]

  // aiWeights: из 9-осевых весов Spec (числа 0-100) → строковый формат screenResume
  // Маппинг: ключ scoringWeights → ключ WEIGHT_AXIS_LABELS в screenResume
  // screenResume понимает: industry_experience, specific_skills, salary_match, management, education
  // Из 9 осей Spec маппируем ближайшие:
  const aiWeights: Record<string, string> = {}
  const sw = spec.scoringWeights
  const toLevel = (w: number): string => {
    if (w >= 25) return "critical"
    if (w >= 15) return "important"
    if (w >= 5)  return "nice"
    return "irrelevant"
  }
  // relevant_experience → industry_experience
  if (sw.relevant_experience > 0) aiWeights["industry_experience"] = toLevel(sw.relevant_experience)
  // hard_skills → specific_skills
  if (sw.hard_skills > 0) aiWeights["specific_skills"] = toLevel(sw.hard_skills)
  // managerial_match → management
  if (sw.managerial_match > 0) aiWeights["management"] = toLevel(sw.managerial_match)
  // education → education
  if (sw.education > 0) aiWeights["education"] = toLevel(sw.education)

  return {
    resume,
    vacancy: {
      title:                vacancy.title,
      city:                 vacancy.city ?? null,
      aiIdealProfile:       spec.idealProfile || null,
      aiRequiredHardSkills: mustHave.length > 0 ? mustHave : null,
      aiStopFactors:        allKnockouts.length > 0 ? allKnockouts : null,
      screeningQuestions:   niceToHave.length > 0 ? niceToHave : null,
      aiWeights:            Object.keys(aiWeights).length > 0 ? aiWeights : null,
    },
  }
}

// ─── Transfer from Portrait (логика кнопки в spec-editor.tsx) ────────────────

/**
 * Переносит данные из legacy-портрета в Spec — точная копия transferFromPortrait()
 * в components/vacancies/spec-editor.tsx.
 *
 * Условие активации: spec.mustHave.length === 0 && spec.portraitRequiredSkills.length > 0
 *
 * Возвращает { applied: true, spec } если перенос выполнен,
 *            { applied: false } если Spec уже заполнен или портрет пуст.
 */
function applyTransferFromPortrait(spec: CandidateSpec): { applied: true; spec: CandidateSpec } | { applied: false } {
  const canTransfer = spec.mustHave.length === 0 && spec.portraitRequiredSkills.length > 0
  if (!canTransfer) return { applied: false }

  const must = spec.portraitRequiredSkills.slice(0, 5)
  const nice = spec.portraitNiceSkills.slice(0, 5)
  const deal = spec.portraitKnockouts.slice(0, 3)

  const updated: CandidateSpec = {
    ...spec,
    mustHave:     must,
    niceToHave:   spec.niceToHave.length > 0 ? spec.niceToHave : nice,
    dealBreakers: spec.dealBreakers.length  > 0 ? spec.dealBreakers : deal,
    updatedAt:    new Date().toISOString(),
  }

  return { applied: true, spec: updated }
}

// ─── Retry-обёртка для screenResume ─────────────────────────────────────────

async function screenResumeWithRetry(
  input: ResumeScreenInput,
  retries = 1,
): Promise<Awaited<ReturnType<typeof screenResume>>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await screenResume(input)
      return result
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`  [retry ${attempt + 1}/${retries}] screenResume failed: ${err instanceof Error ? err.message : err}`)
      await sleep(1500)
    }
  }
  return null
}

// ─── Типы результатов ─────────────────────────────────────────────────────────

interface CandidateResult {
  candidateId:   string
  name:          string
  storedLegacyScore?: number       // сохранённый в БД resume_score
  freshLegacyScore?:  number | null // legacy-оценка, пересчитанная сейчас (--rerun-legacy)
  legacyScore:   number        // используемая в сравнении legacy-оценка (fresh при --rerun-legacy)
  specScore:     number | null // теневой (null = не удалось)
  delta:         number | null // specScore - legacyScore
  legacyUpper:   number
  legacyLower:   number
  specUpper:     number
  specLower:     number
  legacyZone:    "green" | "yellow" | "red"
  specZone:      "green" | "yellow" | "red" | null
  zoneChanged:   boolean
  dealBreakersTriggered: string[]
  specVerdict:   string | null
  specSummary:   string | null
  error?:        string
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv)

  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  if (!opts.vacancyId && !opts.vacancyTitle) {
    console.error("Ошибка: укажите --vacancy-id <uuid> или --vacancy-title <подстрока>")
    console.error("Запустите с --help для справки")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error("Ошибка: DATABASE_URL не задан в окружении")
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ПРЕДУПРЕЖДЕНИЕ: ANTHROPIC_API_KEY не задан — скоринг вернёт null")
  }

  // ── Найти вакансию ─────────────────────────────────────────────────────────
  console.log(`\n[${new Date().toISOString()}] spec-shadow-score стартует`)
  console.log(`  Поиск вакансии: ${opts.vacancyId ? `id=${opts.vacancyId}` : `title~="${opts.vacancyTitle}"`}`)

  let vacancy: {
    id: string
    title: string
    city: string | null
    descriptionJson: unknown
    aiProcessSettings: unknown
    requirementsJson: unknown
    stopFactorsJson: unknown
  } | null = null

  if (opts.vacancyId) {
    const [row] = await db
      .select({
        id:               vacancies.id,
        title:            vacancies.title,
        city:             vacancies.city,
        descriptionJson:  vacancies.descriptionJson,
        aiProcessSettings:vacancies.aiProcessSettings,
        requirementsJson: vacancies.requirementsJson,
        stopFactorsJson:  vacancies.stopFactorsJson,
      })
      .from(vacancies)
      .where(eq(vacancies.id, opts.vacancyId))
      .limit(1)
    vacancy = row ?? null
  } else {
    const [row] = await db
      .select({
        id:               vacancies.id,
        title:            vacancies.title,
        city:             vacancies.city,
        descriptionJson:  vacancies.descriptionJson,
        aiProcessSettings:vacancies.aiProcessSettings,
        requirementsJson: vacancies.requirementsJson,
        stopFactorsJson:  vacancies.stopFactorsJson,
      })
      .from(vacancies)
      .where(ilike(vacancies.title, `%${opts.vacancyTitle}%`))
      .limit(1)
    vacancy = row ?? null
  }

  if (!vacancy) {
    console.error(`Вакансия не найдена`)
    await pgClient.end({ timeout: 5 })
    process.exit(1)
  }

  console.log(`  Вакансия: "${vacancy.title}" (${vacancy.id})`)

  // ── Получить или собрать Spec ──────────────────────────────────────────────
  // Проверяем, есть ли Spec в vacancy_specs. Если нет — таблица может отсутствовать.
  let spec: CandidateSpec | null = null
  let specSource: "db" | "legacy" | "transferred" = "legacy"

  try {
    const [specRow] = await db
      .select({ spec: vacancySpecs.spec })
      .from(vacancySpecs)
      .where(eq(vacancySpecs.vacancyId, vacancy.id))
      .limit(1)

    if (specRow?.spec && typeof specRow.spec === "object") {
      spec = specRow.spec as CandidateSpec
      specSource = "db"
      console.log(`  Spec: загружен из vacancy_specs`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("does not exist") || msg.includes("relation")) {
      console.warn(`  ПРЕДУПРЕЖДЕНИЕ: таблица vacancy_specs не существует (миграция 0197 не применена).`)
      console.warn(`  Spec будет собран только из legacy-полей и НЕ будет сохранён.`)
    } else {
      console.warn(`  ПРЕДУПРЕЖДЕНИЕ: ошибка чтения vacancy_specs: ${msg}`)
    }
  }

  // Если Spec ещё не в БД — строим из legacy
  if (!spec) {
    const legacySpec = buildSpecFromLegacy({
      requirementsJson:  vacancy.requirementsJson as Parameters<typeof buildSpecFromLegacy>[0]["requirementsJson"],
      aiProcessSettings: vacancy.aiProcessSettings as Parameters<typeof buildSpecFromLegacy>[0]["aiProcessSettings"],
      stopFactorsJson:   vacancy.stopFactorsJson as Parameters<typeof buildSpecFromLegacy>[0]["stopFactorsJson"],
      descriptionJson:   vacancy.descriptionJson as Parameters<typeof buildSpecFromLegacy>[0]["descriptionJson"],
    })
    spec = legacySpec
    specSource = "legacy"
    console.log(`  Spec: собран из legacy-полей (в vacancy_specs записи нет)`)
  }

  // ── --transfer-from-portrait ───────────────────────────────────────────────
  if (opts.transferFromPortrait) {
    const result = applyTransferFromPortrait(spec)
    if (!result.applied) {
      console.log(`  --transfer-from-portrait: пропущено (mustHave уже заполнен или портрет пуст)`)
    } else {
      spec = result.spec
      specSource = "transferred"
      console.log(`  --transfer-from-portrait: перенесено из Портрета`)
      console.log(`    mustHave:     ${spec.mustHave.join(", ") || "(пусто)"}`)
      console.log(`    niceToHave:   ${spec.niceToHave.join(", ") || "(пусто)"}`)
      console.log(`    dealBreakers: ${spec.dealBreakers.join(", ") || "(пусто)"}`)

      // Сохраняем в vacancy_specs (спящий контур, на боевое не влияет)
      try {
        const { saveSpec } = await import("@/lib/core/spec/store")
        await saveSpec(vacancy.id, spec)
        console.log(`  Spec сохранён в vacancy_specs`)
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : String(saveErr)
        console.warn(`  ПРЕДУПРЕЖДЕНИЕ: не удалось сохранить Spec: ${msg}`)
        console.warn(`  (возможно, таблица vacancy_specs не создана — миграция 0197)`)
      }
    }
  }

  // ── Итоговые настройки Spec ────────────────────────────────────────────────
  const specUpper = spec.resumeThresholds.upperThreshold
  const specLower = spec.resumeThresholds.lowerThreshold

  // Legacy-пороги из aiProcessSettings (для сравнения зон)
  const legacyAi = (vacancy.aiProcessSettings ?? {}) as Record<string, unknown>
  const legacyUpper = typeof legacyAi.minScoreUpper === "number" ? legacyAi.minScoreUpper : 0
  const legacyLower = typeof legacyAi.minScoreLower === "number"
    ? legacyAi.minScoreLower
    : (typeof legacyAi.minScore === "number" ? legacyAi.minScore : 0)

  console.log(`\n  Spec-источник:  ${specSource}`)
  console.log(`  Spec-пороги:    upper=${specUpper}, lower=${specLower}`)
  console.log(`  Legacy-пороги:  upper=${legacyUpper}, lower=${legacyLower}`)
  console.log(`  must-have:      ${spec.mustHave.join("; ") || "(нет)"}`)
  console.log(`  deal-breakers:  ${spec.dealBreakers.join("; ") || "(нет)"}`)
  console.log(`  idealProfile:   ${spec.idealProfile ? spec.idealProfile.slice(0, 80) + (spec.idealProfile.length > 80 ? "…" : "") : "(нет)"}`)

  // ── Загрузить кандидатов ───────────────────────────────────────────────────
  console.log(`\n  Загрузка кандидатов (limit=${opts.limit}, требуется resume_score IS NOT NULL)…`)

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
      eq(candidates.vacancyId, vacancy.id),
      isNotNull(candidates.resumeScore),
    ))
    .orderBy(desc(candidates.createdAt))
    .limit(opts.limit)

  console.log(`  Найдено: ${rows.length} кандидатов`)

  if (rows.length === 0) {
    console.log("\n  Нет кандидатов с resume_score — выход.")
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  // ── Дедупликация по candidateId (один кандидат — одна строка) ─────────────
  const seen = new Set<string>()
  const uniqueRows: typeof rows = []
  for (const r of rows) {
    if (!seen.has(r.candidateId)) {
      seen.add(r.candidateId)
      uniqueRows.push(r)
    }
  }

  // ── Legacy-вход для --rerun-legacy: ровно как process-queue ───────────────
  // (lib/hh/process-queue.ts: критерии из vacancies.description_json.anketa)
  const descJson = (vacancy.descriptionJson ?? {}) as Record<string, unknown>
  const legacyAnketa = (descJson.anketa as Record<string, unknown> | undefined) ?? {}
  const legacyVacancyInput: ResumeScreenInput["vacancy"] = {
    title:                vacancy.title,
    city:                 vacancy.city,
    aiIdealProfile:       (legacyAnketa.aiIdealProfile as string | undefined) ?? null,
    aiRequiredHardSkills: (legacyAnketa.aiRequiredHardSkills as string[] | undefined) ?? null,
    aiStopFactors:        (legacyAnketa.aiStopFactors as string[] | undefined) ?? null,
    screeningQuestions:   (legacyAnketa.screeningQuestions as string[] | undefined) ?? null,
    aiWeights:            (legacyAnketa.aiWeights as Record<string, string> | undefined) ?? null,
  }
  if (opts.rerunLegacy) {
    console.log(`\n  --rerun-legacy: legacy-оценка пересчитывается сейчас (сравнение fresh-vs-fresh)`)
  }

  // ── Теневой скоринг: конкурентность 2 ────────────────────────────────────
  console.log(`\n  Запуск теневого скоринга (конкурентность 2, retry 1)…`)

  const results: CandidateResult[] = []
  const CONCURRENCY = 2

  for (let i = 0; i < uniqueRows.length; i += CONCURRENCY) {
    const batch = uniqueRows.slice(i, i + CONCURRENCY)

    const batchResults = await Promise.all(batch.map(async (r) => {
      // Собираем резюме-объект: сначала из колонок candidates, потом backfill из raw hh
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
      }

      const specInput = buildSpecResumeInput(resumeObj, { title: vacancy!.title, city: vacancy!.city }, spec!)

      let specScore: number | null = null
      let specVerdict: string | null = null
      let specSummary: string | null = null
      let errorMsg: string | undefined

      try {
        const result = await screenResumeWithRetry(specInput)
        if (result) {
          specScore   = result.score
          specVerdict = result.verdict
          specSummary = result.summary
        } else {
          errorMsg = "screenResume вернул null (ANTHROPIC_API_KEY не задан или API недоступен)"
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err)
        console.warn(`  ✗ ${r.candidateName} (${r.candidateId.slice(0, 8)}): ${errorMsg}`)
      }

      // --rerun-legacy: пересчитать legacy-оценку на тех же данных сейчас.
      // Изолирует эффект критериев от дрейфа данных/настроек со времени боевой оценки.
      let freshLegacyScore: number | null = null
      if (opts.rerunLegacy) {
        try {
          const lr = await screenResumeWithRetry({ resume: resumeObj, vacancy: legacyVacancyInput })
          if (lr) freshLegacyScore = lr.score
        } catch (err) {
          console.warn(`  ✗ legacy-rerun ${r.candidateName}: ${err instanceof Error ? err.message : err}`)
        }
      }

      const storedLegacyScore = r.resumeScore!
      const legacyScore = opts.rerunLegacy && freshLegacyScore !== null ? freshLegacyScore : storedLegacyScore
      const delta        = specScore !== null ? specScore - legacyScore : null
      const legacyZone   = getZone(legacyScore, legacyUpper || specUpper, legacyLower || specLower)
      const specZone     = specScore !== null ? getZone(specScore, specUpper, specLower) : null
      const zoneChanged  = specZone !== null && specZone !== legacyZone

      // deal-breakers из Spec: проверяем упоминание в spec-summary (AI сам пишет о нокаутах)
      const dealBreakersTriggered: string[] = []
      if (specSummary && spec!.dealBreakers.length > 0) {
        for (const db of spec!.dealBreakers) {
          // Проверяем по ключевым словам из deal-breaker в summary AI
          const keyword = db.toLowerCase().split(/\s+/).slice(0, 2).join(" ")
          if (keyword && specSummary.toLowerCase().includes(keyword)) {
            dealBreakersTriggered.push(db)
          }
        }
      }
      if (specVerdict === "stop") {
        // Если verdict=stop — deal-breaker сработал по AI
        if (dealBreakersTriggered.length === 0 && spec!.dealBreakers.length > 0) {
          dealBreakersTriggered.push("(AI вынес стоп-вердикт)")
        }
      }

      const cr: CandidateResult = {
        candidateId: r.candidateId,
        name:        r.candidateName,
        storedLegacyScore,
        freshLegacyScore,
        legacyScore,
        specScore,
        delta,
        legacyUpper: legacyUpper || specUpper,
        legacyLower: legacyLower || specLower,
        specUpper,
        specLower,
        legacyZone,
        specZone,
        zoneChanged,
        dealBreakersTriggered,
        specVerdict,
        specSummary,
        error: errorMsg,
      }

      const dStr = delta !== null ? (delta >= 0 ? `+${delta}` : `${delta}`) : "N/A"
      const zStr = specZone ? `${zoneEmoji(legacyZone)}→${zoneEmoji(specZone)}` : `${zoneEmoji(legacyZone)}→?`
      console.log(`  [${String(results.length + batch.indexOf(r) + 1).padStart(3)}/${uniqueRows.length}] ` +
        `${trunc(r.candidateName, 22)} | legacy=${String(legacyScore).padStart(3)}${opts.rerunLegacy ? `(БД:${storedLegacyScore})` : ""} spec=${specScore !== null ? String(specScore).padStart(3) : " N/A"} ` +
        `Δ=${dStr.padStart(4)} ${zStr}${zoneChanged ? " ⚡" : ""}`)

      return cr
    }))

    results.push(...batchResults)

    // Пауза между батчами (рейт-лимит)
    if (i + CONCURRENCY < uniqueRows.length) {
      await sleep(600)
    }
  }

  // ── Сводная таблица ────────────────────────────────────────────────────────
  const scored    = results.filter(r => r.specScore !== null)
  const errors    = results.filter(r => r.error)
  const changed   = scored.filter(r => r.zoneChanged)

  const deltas    = scored.map(r => Math.abs(r.delta!))
  const avgDelta  = deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0
  const medianDelta = deltas.length > 0 ? (() => {
    const sorted = [...deltas].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  })() : 0
  const zoneMismatch = scored.filter(r => r.zoneChanged).length
  const zoneMatchPct = scored.length > 0
    ? Math.round(((scored.length - zoneMismatch) / scored.length) * 100)
    : 0

  console.log("\n" + "═".repeat(90))
  console.log(" СВОДКА")
  console.log("═".repeat(90))
  console.log(`  Вакансия:          "${vacancy.title}" (${vacancy.id})`)
  console.log(`  Spec-источник:     ${specSource}`)
  console.log(`  Оценено:           ${scored.length} из ${results.length}`)
  console.log(`  Ошибок AI:         ${errors.length}`)
  console.log(`  Средняя |Δ|:       ${avgDelta} баллов`)
  console.log(`  Медиана |Δ|:       ${medianDelta} баллов`)
  console.log(`  Совпадение зон:    ${zoneMatchPct}% (${scored.length - zoneMismatch} из ${scored.length})`)
  console.log(`  Переход зоны (⚡):  ${changed.length} кандидатов`)

  if (changed.length > 0) {
    console.log("\n  Кандидаты с изменением зоны:")
    for (const r of changed) {
      const arrow = `${zoneEmoji(r.legacyZone)}→${zoneEmoji(r.specZone!)}`
      const dStr  = r.delta! >= 0 ? `+${r.delta}` : `${r.delta}`
      console.log(`    • ${trunc(r.name, 28)} | legacy=${r.legacyScore} spec=${r.specScore} Δ=${dStr} ${arrow}`)
    }
  }

  // Пояснения к модели оценки
  console.log("\n  ПРИМЕЧАНИЯ:")
  console.log("  1. Теневой скоринг использует ТОТ ЖЕ screenResume (claude-haiku-4-5),")
  console.log("     но критерии/идеальный профиль/веса подставляются из Spec, а не legacy-портрета.")
  console.log("  2. Сравнивается только resume_score (до демо). ai_score (после демо) не затронут.")
  console.log("  3. Структурные стоп-факторы (город/возраст/формат) переданы AI как текст —")
  console.log("     точность их проверки зависит от полноты резюме в БД.")
  console.log("  4. НИКАКИЕ боевые поля (resume_score, ai_score, stage) НЕ изменены.")
  if (specSource === "legacy") {
    console.log("  5. Spec собран из legacy-полей (таблица vacancy_specs пуста или не создана).")
    console.log("     Для сохранения Spec используйте --transfer-from-portrait.")
  }

  // ── Запись JSON-файла ─────────────────────────────────────────────────────
  const outPath = `/tmp/spec-shadow-${vacancy.id}.json`
  const jsonOut = {
    generatedAt:  new Date().toISOString(),
    vacancyId:    vacancy.id,
    vacancyTitle: vacancy.title,
    specSource,
    specSummary: {
      mustHave:           spec.mustHave,
      niceToHave:         spec.niceToHave,
      dealBreakers:       spec.dealBreakers,
      idealProfile:       spec.idealProfile,
      resumeThresholds:   spec.resumeThresholds,
      portraitRequiredSkills: spec.portraitRequiredSkills,
      portraitKnockouts:  spec.portraitKnockouts,
    },
    legacyThresholds: { upper: legacyUpper, lower: legacyLower },
    stats: {
      total:        results.length,
      scored:       scored.length,
      errors:       errors.length,
      avgAbsDelta:  avgDelta,
      medianAbsDelta: medianDelta,
      zoneMatchPct,
      zoneChangedCount: changed.length,
    },
    candidates: results.map(r => ({
      candidateId:         r.candidateId,
      name:                r.name,
      legacyScore:         r.legacyScore,
      specScore:           r.specScore,
      delta:               r.delta,
      legacyZone:          r.legacyZone,
      specZone:            r.specZone,
      zoneChanged:         r.zoneChanged,
      dealBreakersTriggered: r.dealBreakersTriggered,
      specVerdict:         r.specVerdict,
      specSummary:         r.specSummary,
      error:               r.error ?? null,
    })),
  }

  try {
    writeFileSync(outPath, JSON.stringify(jsonOut, null, 2), "utf8")
    console.log(`\n  JSON сохранён: ${outPath}`)
  } catch (writeErr) {
    console.warn(`  ПРЕДУПРЕЖДЕНИЕ: не удалось записать ${outPath}: ${writeErr instanceof Error ? writeErr.message : writeErr}`)
  }

  console.log(`\n[${new Date().toISOString()}] Готово.\n`)

  await pgClient.end({ timeout: 5 })
  process.exit(0)
}

main().catch((err) => {
  console.error("Фатальная ошибка:", err instanceof Error ? err.message : err)
  pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ }).finally(() => process.exit(1))
})
