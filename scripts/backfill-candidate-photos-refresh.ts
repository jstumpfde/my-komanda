/**
 * backfill-candidate-photos-refresh.ts
 *
 * «Свежий» backfill: для кандидатов, у которых photo_url всё ещё внешний
 * https://img.hhcdn.ru/... (подпись ?t&h могла протухнуть и saveCandidatePhoto
 * получает 403), запрашиваем РЕЗЮМЕ заново через hh API:
 *   GET https://api.hh.ru/resumes/{hh_resume_id}
 * Из ответа берём новый подписанный photoUrl и качаем его локально.
 *
 * Токен берём по company_id вакансии через getValidToken().
 *
 * Идемпотентен: повторный запуск выберет только тех, у кого URL всё ещё
 * https://img.hhcdn.ru%. После успешного UPDATE кандидат сам отсеется.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/backfill-candidate-photos-refresh.ts
 *
 * Параметры через ENV:
 *   DELAY_MS=3000     — пауза между hh API запросами (default 3000, hh rate-limit)
 *   PROGRESS_EVERY=10 — печатать прогресс каждые N кандидатов
 *   LIMIT=0           — обработать только первые N (0 = все); полезно для теста
 */

import { eq, like } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates, vacancies, hhCandidates } from "@/lib/db/schema"
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
  console.log(`[${new Date().toISOString()}] backfill-refresh: поиск кандидатов...`)

  const rows = await db
    .select({
      candidateId: candidates.id,
      photoUrl:    candidates.photoUrl,
      vacancyId:   candidates.vacancyId,
      companyId:   vacancies.companyId,
      hhResumeId:  hhCandidates.hhResumeId,
    })
    .from(candidates)
    .innerJoin(hhCandidates, eq(hhCandidates.candidateId, candidates.id))
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(like(candidates.photoUrl, "https://img.hhcdn.ru%"))

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
  let apiFail = 0
  let noPhoto = 0
  let saveFail = 0
  let processed = 0

  try {
    for (const row of work) {
      processed++
      try {
        const token = await tokenFor(row.companyId)
        if (!token) { noToken++; continue }

        const res = await fetch(`https://api.hh.ru/resumes/${row.hhResumeId}`, {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": HH_UA },
        })
        if (!res.ok) {
          console.warn(`[api] ${res.status} resume=${row.hhResumeId} cand=${row.candidateId}`)
          apiFail++
          await sleep(DELAY_MS)
          continue
        }

        const resume = await res.json() as Record<string, unknown>
        const fresh = extractHhResumeFields(resume)
        if (!fresh.photoUrl) { noPhoto++; await sleep(DELAY_MS); continue }

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
        console.log(`  [${processed}/${work.length} = ${pct}%]  ok=${ok} noToken=${noToken} apiFail=${apiFail} noPhoto=${noPhoto} saveFail=${saveFail}`)
      }

      await sleep(DELAY_MS)
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000)
    console.log(`[${new Date().toISOString()}] готово.`)
    console.log(`  ✓ ok:        ${ok}`)
    console.log(`  ⨯ noToken:   ${noToken}`)
    console.log(`  ⨯ apiFail:   ${apiFail}`)
    console.log(`  ⨯ noPhoto:   ${noPhoto}`)
    console.log(`  ⨯ saveFail:  ${saveFail}`)
    console.log(`  ~ всего:     ${processed}`)
    console.log(`  время:       ${elapsedSec}с`)

    if (ok > 0) {
      console.log("")
      console.log("⚠ НАПОМИНАНИЕ: если запускали через cron — НЕ ЗАБУДЬТЕ убрать запись:")
      console.log("   crontab -e")
      console.log("   (удалить строку с backfill-candidate-photos-refresh.ts)")
    }

    await pgClient.end({ timeout: 5 })
    process.exit(0)
  } catch (err) {
    console.error("Фатальная ошибка:", err)
    try { await pgClient.end({ timeout: 5 }) } catch { /* ignore */ }
    process.exit(1)
  }
}

main()
