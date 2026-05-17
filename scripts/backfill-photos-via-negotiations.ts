/**
 * backfill-photos-via-negotiations.ts
 *
 * Batch backfill для кандидатов, у которых нет hh_resume_id в hh_candidates,
 * но есть запись в hh_responses (импорт через hh-отклики). Для них refresh
 * по hh_resume_id невозможен (его просто нет), но можно достать resume.id
 * через GET /negotiations/{hh_response_id}.
 *
 * Алгоритм на каждого:
 *   1. getValidToken(companyId) — токен OAuth компании из hh_integrations
 *   2. GET https://api.hh.ru/negotiations/{hhResponseId} → resume.id
 *   3. GET https://api.hh.ru/resumes/{resume.id} → photo.medium URL
 *   4. saveCandidatePhoto(candidateId, photoUrl) → локальный путь
 *   5. UPDATE candidates.photo_url
 *
 * Идемпотентен: повторный запуск выберет только тех, у кого URL всё ещё
 * https://img.hhcdn.ru%. После UPDATE кандидат сам отсеется.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/backfill-photos-via-negotiations.ts
 *
 * ENV:
 *   DELAY_MS=3000     — пауза между hh API запросами (default 3000)
 *   PROGRESS_EVERY=10 — печатать прогресс каждые N (default 10)
 *   LIMIT=0           — обработать только первые N (0 = все); для теста
 */

import { eq, like, and } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, hhResponses, vacancies } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "3000", 10)
const PROGRESS_EVERY = parseInt(process.env.PROGRESS_EVERY ?? "10", 10)
const LIMIT = parseInt(process.env.LIMIT ?? "0", 10)
const HH_UA = "Company24.pro/1.0"

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] backfill-via-negotiations: поиск кандидатов...`)

  const rows = await db
    .select({
      candidateId:  candidates.id,
      photoUrl:     candidates.photoUrl,
      vacancyId:    candidates.vacancyId,
      companyId:    vacancies.companyId,
      hhResponseId: hhResponses.hhResponseId,
    })
    .from(candidates)
    .innerJoin(hhResponses, eq(hhResponses.localCandidateId, candidates.id))
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(and(
      like(candidates.photoUrl, "https://img.hhcdn.ru%"),
    ))

  const work = LIMIT > 0 ? rows.slice(0, LIMIT) : rows
  console.log(`всего по фильтру: ${rows.length}, к обработке: ${work.length}, delay=${DELAY_MS}ms`)
  if (work.length === 0) {
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  // Кэш токенов по company_id — один валидный токен на компанию хватит на весь прогон
  const tokenCache = new Map<string, string | null>()
  async function tokenFor(companyId: string): Promise<string | null> {
    if (tokenCache.has(companyId)) return tokenCache.get(companyId) ?? null
    const t = await getValidToken(companyId)
    const access = t?.accessToken ?? null
    tokenCache.set(companyId, access)
    if (!access) console.warn(`[token] нет валидного токена для company=${companyId}`)
    return access
  }

  let ok = 0
  let noToken = 0
  let noResume = 0
  let apiFail = 0
  let noPhoto = 0
  let saveFail = 0
  let processed = 0

  try {
    for (const row of work) {
      processed++
      try {
        const token = await tokenFor(row.companyId)
        if (!token) { noToken++; await sleep(DELAY_MS); continue }

        // 1) negotiation → resume.id
        const negoRes = await fetch(
          `https://api.hh.ru/negotiations/${row.hhResponseId}`,
          { headers: { Authorization: `Bearer ${token}`, "User-Agent": HH_UA } },
        )
        if (!negoRes.ok) {
          console.warn(`[nego] ${negoRes.status} resp=${row.hhResponseId} cand=${row.candidateId}`)
          apiFail++
          await sleep(DELAY_MS)
          continue
        }
        const nego = await negoRes.json() as { resume?: { id?: string } }
        const resumeId = typeof nego?.resume?.id === "string" ? nego.resume.id : null
        if (!resumeId) { noResume++; await sleep(DELAY_MS); continue }

        // 2) resume → photo
        const resRes = await fetch(
          `https://api.hh.ru/resumes/${resumeId}`,
          { headers: { Authorization: `Bearer ${token}`, "User-Agent": HH_UA } },
        )
        if (!resRes.ok) {
          console.warn(`[resume] ${resRes.status} resume=${resumeId} cand=${row.candidateId}`)
          apiFail++
          await sleep(DELAY_MS)
          continue
        }
        const resume = await resRes.json() as Record<string, unknown>
        const fresh = extractHhResumeFields(resume)
        if (!fresh.photoUrl) { noPhoto++; await sleep(DELAY_MS); continue }

        // 3) скачиваем
        const local = await saveCandidatePhoto(row.candidateId, fresh.photoUrl)
        if (local && local !== row.photoUrl) {
          await db.update(candidates).set({ photoUrl: local }).where(eq(candidates.id, row.candidateId))
          ok++
        } else {
          saveFail++
        }
      } catch (err) {
        console.warn(`[loop] cand=${row.candidateId} err=${err instanceof Error ? err.message : err}`)
        apiFail++
      }

      if (processed % PROGRESS_EVERY === 0 || processed === work.length) {
        const pct = Math.round((processed / work.length) * 100)
        console.log(`  [${processed}/${work.length} = ${pct}%]  ok=${ok} noToken=${noToken} noResume=${noResume} apiFail=${apiFail} noPhoto=${noPhoto} saveFail=${saveFail}`)
      }

      await sleep(DELAY_MS)
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000)
    console.log(`[${new Date().toISOString()}] готово.`)
    console.log(`  ✓ ok:        ${ok}`)
    console.log(`  ⨯ noToken:   ${noToken}`)
    console.log(`  ⨯ noResume:  ${noResume}`)
    console.log(`  ⨯ apiFail:   ${apiFail}`)
    console.log(`  ⨯ noPhoto:   ${noPhoto}`)
    console.log(`  ⨯ saveFail:  ${saveFail}`)
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
