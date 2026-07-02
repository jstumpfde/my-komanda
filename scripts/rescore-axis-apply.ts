/**
 * scripts/rescore-axis-apply.ts
 *
 * ПРИМЕНЕНИЕ осевого скоринга резюме (Портрет, редизайн 02.07) к кандидатам
 * вакансии. Зеркало rescore-axis-preview.ts, но пишет в БД:
 *   candidates.resume_score        = result.score
 *   candidates.ai_score_breakdown  = result (AxisScoreResult целиком, для «почему»)
 * (колонок verdict/summary у candidates НЕТ — они живут внутри ai_score_breakdown.)
 *
 * БЕЗОПАСНОСТЬ: по умолчанию DRY (только печать). Реальная запись — ТОЛЬКО при --apply.
 *
 * Флаги:
 *   --vacancy-id <uuid>   вакансия (по умолчанию — тестовая ниже)
 *   --limit <N>           сколько кандидатов (по умолчанию 30)
 *   --only <a,b>          фильтр по подстроке имени
 *   --apply               ВЫКЛючить dry-run и записать в БД
 *
 * Запуск (из корня проекта):
 *   set -a; . ./.env.local; set +a
 *   pnpm exec tsx scripts/rescore-axis-apply.ts --vacancy-id <id> --limit 30          # dry
 *   pnpm exec tsx scripts/rescore-axis-apply.ts --vacancy-id <id> --limit 30 --apply  # запись
 */
import { eq, and, isNotNull, desc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { type ResumeScreenInput } from "@/lib/ai-screen-resume"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { getSpec } from "@/lib/core/spec/store"
import { scoreResumeByAxes, buildAxes, buildPenalties, type AxisScoreResult } from "@/lib/core/spec/axis-scorer"

const DEFAULT_VACANCY_ID = "6916db01-a765-4c4e-a652-81475566f95b"
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n) }

function parseArgs(argv: string[]) {
  let vacancyId = DEFAULT_VACANCY_ID, limit = 30, apply = false
  const only: string[] = []
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--vacancy-id") vacancyId = argv[++i] ?? vacancyId
    else if (argv[i] === "--limit") limit = Number(argv[++i]) || limit
    else if (argv[i] === "--only") only.push(...(argv[++i] ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
    else if (argv[i] === "--apply") apply = true
    else if (argv[i] === "--dry") apply = false
  }
  return { vacancyId, limit, only, apply }
}

interface Row {
  candidateId: string; name: string; oldScore: number | null; res: AxisScoreResult | null; error?: string; written?: boolean
}

async function main() {
  const opts = parseArgs(process.argv)
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL не задан"); process.exit(1) }
  if (!process.env.ANTHROPIC_API_KEY) console.warn("ПРЕДУПРЕЖДЕНИЕ: ANTHROPIC_API_KEY не задан")

  const [vac] = await db.select({
    id: vacancies.id, title: vacancies.title, city: vacancies.city,
  }).from(vacancies).where(eq(vacancies.id, opts.vacancyId)).limit(1)
  if (!vac) { console.error("Вакансия не найдена"); await pgClient.end({ timeout: 5 }); process.exit(1) }

  const spec = await getSpec(vac.id)
  if (!spec) { console.error("Spec не найден для вакансии"); await pgClient.end({ timeout: 5 }); process.exit(1) }

  const axes = buildAxes(spec)
  const penalties = buildPenalties(spec)
  console.log(`\nОСЕВОЙ скоринг (${opts.apply ? "ЗАПИСЬ В БД" : "DRY — без записи"}) — "${vac.title}"`)
  if (spec.scoringMode !== "axes") console.warn(`ВНИМАНИЕ: spec.scoringMode="${spec.scoringMode}" (не "axes") — считаем всё равно, но живой пайплайн осями оценивать НЕ будет.`)
  console.log(`Оси (${axes.length}, поровну по ${axes[0]?.weight ?? 0} б.):`)
  for (const a of axes) console.log(`  • ${a.label} — ${a.weight} б.${a.synonyms.length ? ` (син: ${a.synonyms.slice(0, 4).join(", ")}…)` : ""}`)
  console.log(`Штрафы «Не подходит»:`)
  for (const p of penalties) console.log(`  • −${p.magnitude}${p.magnitude >= 100 ? " (стоп)" : ""} ${p.text}`)

  const rows = await db.select({
    candidateId: candidates.id, candidateName: candidates.name, candidateCity: candidates.city,
    salaryMin: candidates.salaryMin, experienceYears: candidates.experienceYears,
    keySkills: candidates.keySkills, skills: candidates.skills, educationLevel: candidates.educationLevel,
    workFormat: candidates.workFormat, languages: candidates.languages, relocationReady: candidates.relocationReady,
    professionalRoles: candidates.professionalRoles, citizenshipNames: candidates.citizenshipNames,
    resumeScore: candidates.resumeScore, hhRawData: hhResponses.rawData,
  }).from(candidates)
    .leftJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
    .where(and(eq(candidates.vacancyId, vac.id), isNotNull(candidates.resumeScore)))
    .orderBy(desc(candidates.createdAt)).limit(opts.limit)

  const seen = new Set<string>()
  let uniqueRows = rows.filter(r => (seen.has(r.candidateId) ? false : (seen.add(r.candidateId), true)))
  if (opts.only.length) uniqueRows = uniqueRows.filter(r => opts.only.some(o => (r.candidateName ?? "").toLowerCase().includes(o)))
  console.log(`\nКандидатов: ${uniqueRows.length}\n`)

  const results: Row[] = []
  const CONCURRENCY = 2
  for (let i = 0; i < uniqueRows.length; i += CONCURRENCY) {
    const batch = uniqueRows.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(async (r): Promise<Row> => {
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
      let res: AxisScoreResult | null = null, error: string | undefined, written = false
      try {
        res = await scoreResumeByAxes(resumeObj, { title: vac.title, city: vac.city }, spec, null)
        if (!res) error = "scoreResumeByAxes вернул null"
        else if (opts.apply) {
          await db.update(candidates)
            .set({ resumeScore: res.score, aiScoreBreakdown: res })
            .where(eq(candidates.id, r.candidateId))
          written = true
        }
      } catch (err) { error = err instanceof Error ? err.message : String(err) }
      return { candidateId: r.candidateId, name: r.candidateName ?? "—", oldScore: r.resumeScore ?? null, res, error, written }
    }))
    results.push(...batchResults)
    if (i + CONCURRENCY < uniqueRows.length) await sleep(600)
  }

  const sorted = [...results].sort((a, b) => (b.res?.score ?? -1) - (a.res?.score ?? -1))
  console.log("═".repeat(90))
  console.log(` ${"Имя".padEnd(24)} | было | стало |   Δ   | вердикт${opts.apply ? " | запись" : ""}`)
  console.log("─".repeat(90))
  for (const r of sorted) {
    const oldS = r.oldScore != null ? String(r.oldScore).padStart(4) : "  — "
    if (!r.res) { console.log(` ${trunc(r.name, 24)} | ${oldS} |  N/A  |   —   | ${r.error ?? "ошибка"}`); continue }
    const newS = String(r.res.score).padStart(5)
    const delta = r.oldScore != null ? r.res.score - r.oldScore : null
    const dStr = delta === null ? "  —  " : (delta >= 0 ? `+${delta}` : `${delta}`).padStart(5)
    const weak = r.res.score < 45 ? " 🔴" : ""
    const wr = opts.apply ? (r.written ? " | ✔" : " | —") : ""
    console.log(` ${trunc(r.name, 24)} | ${oldS} | ${newS} | ${dStr} | ${r.res.verdict}${weak}${wr}`)
    const axLine = r.res.axes.map(a => `${a.label.slice(0, 14)}:${a.score}→${a.points}`).join("  ")
    console.log(`     оси: ${axLine}`)
    const pen = r.res.penalties.filter(p => p.triggered)
    if (pen.length) console.log(`     штрафы: ${pen.map(p => `−${p.applied} ${p.text.slice(0, 22)}`).join("; ")}`)
    if (r.res.summary) console.log(`     └─ ${r.res.summary}`)
  }
  console.log("─".repeat(90))
  const scored = results.filter(r => r.res)
  const weakN = scored.filter(r => (r.res?.score ?? 0) < 45).length
  const writtenN = results.filter(r => r.written).length
  console.log(`  Оценено: ${scored.length} | слабых (<45): ${weakN} | среднее: ${scored.length ? Math.round(scored.reduce((s, r) => s + (r.res?.score ?? 0), 0) / scored.length) : 0}`)
  console.log(opts.apply ? `  ЗАПИСАНО в БД: ${writtenN}` : `  DRY — в БД НЕ писали (добавьте --apply для записи).`)

  await pgClient.end({ timeout: 5 })
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
