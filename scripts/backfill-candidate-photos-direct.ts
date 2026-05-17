/**
 * backfill-candidate-photos-direct.ts
 *
 * «Direct» backfill: для кандидатов, у которых photo_url всё ещё внешний
 * https://img.hhcdn.ru/..., пытаемся СКАЧАТЬ его НАПРЯМУЮ серверным fetch
 * (без авторизации, без hh API). CDN img.hhcdn.ru на серверные запросы
 * возвращает 200, на браузерные — 403 из-за Origin/Referer-проверок.
 *
 * Применять там, где hh_resume_id отсутствует — refresh через hh API
 * невозможен. Если подпись ?t&h ещё не протухла — direct fetch вытянет
 * фото; если протухла — пометим как failed, такое фото не починить
 * без hh_resume_id.
 *
 * Идемпотентен: повторный запуск выберет только тех, у кого URL всё ещё
 * https://img.hhcdn.ru%. После успешного UPDATE кандидат сам отсеется.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/backfill-candidate-photos-direct.ts
 *
 * Параметры через ENV:
 *   DELAY_MS=200      — пауза между HTTP-запросами к hh (default 200)
 *   PROGRESS_EVERY=50 — печатать прогресс каждые N кандидатов (default 50)
 *   LIMIT=0           — обработать только первые N (0 = все); полезно для теста
 */

import { eq, like } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "200", 10)
const PROGRESS_EVERY = parseInt(process.env.PROGRESS_EVERY ?? "50", 10)
const LIMIT = parseInt(process.env.LIMIT ?? "0", 10)

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] direct-backfill: поиск кандидатов с внешними hh-фото...`)

  const rows = await db
    .select({ id: candidates.id, photoUrl: candidates.photoUrl })
    .from(candidates)
    .where(like(candidates.photoUrl, "https://img.hhcdn.ru%"))

  const work = LIMIT > 0 ? rows.slice(0, LIMIT) : rows
  console.log(`всего по фильтру: ${rows.length}, к обработке: ${work.length}, delay=${DELAY_MS}ms`)
  if (work.length === 0) {
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  let ok = 0
  let failed = 0
  let processed = 0

  try {
    for (const row of work) {
      processed++
      if (!row.photoUrl) { failed++; continue }

      // saveCandidatePhoto делает прямой server-side fetch без авторизации;
      // возвращает локальный путь при 200, null при 403/404/любой ошибке.
      const local = await saveCandidatePhoto(row.id, row.photoUrl)
      if (local && local !== row.photoUrl) {
        await db.update(candidates).set({ photoUrl: local }).where(eq(candidates.id, row.id))
        ok++
      } else {
        failed++
      }

      if (processed % PROGRESS_EVERY === 0 || processed === work.length) {
        const pct = Math.round((processed / work.length) * 100)
        console.log(`  [${processed}/${work.length} = ${pct}%]  ok=${ok}  failed=${failed}`)
      }

      await sleep(DELAY_MS)
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000)
    console.log(`[${new Date().toISOString()}] готово.`)
    console.log(`  ✓ ok:        ${ok}`)
    console.log(`  ✗ failed:    ${failed}`)
    console.log(`  ~ всего:     ${processed}`)
    console.log(`  время:       ${elapsedSec}с`)
    if (failed > 0) {
      console.log("")
      console.log(`⚠ ${failed} не удалось скачать direct — у них протухла подпись ?t&h.`)
      console.log(`   Если у этих кандидатов есть hh_resume_id, попробуйте refresh-вариант:`)
      console.log(`   npx tsx --env-file=.env.local scripts/backfill-candidate-photos-refresh.ts`)
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
