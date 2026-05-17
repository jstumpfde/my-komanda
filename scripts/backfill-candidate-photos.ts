/**
 * backfill-candidate-photos.ts
 *
 * Одноразовый backfill для candidates.photo_url: качает все внешние hh-фото
 * (https://img.hhcdn.ru/...) на диск через saveCandidatePhoto и подменяет
 * ссылку в БД на /uploads/candidates/{id}/photo.jpg. Нужен потому, что
 * img.hhcdn.ru возвращает 403 на браузерные запросы (CDN режет Origin/Referer),
 * а сервер my-komanda получает 200.
 *
 * Идемпотентен: повторный запуск выберет только тех, у кого URL всё ещё
 * https://img.hhcdn.ru%. После успешного UPDATE кандидат сам отсеется.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/backfill-candidate-photos.ts
 *
 * Параметры через ENV:
 *   DELAY_MS=200      — пауза между HTTP-запросами к hh (default 200)
 *   PROGRESS_EVERY=50 — печатать прогресс каждые N кандидатов (default 50)
 */

import { eq, like } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "200", 10)
const PROGRESS_EVERY = parseInt(process.env.PROGRESS_EVERY ?? "50", 10)

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] поиск кандидатов с внешними hh-фото...`)

  const rows = await db
    .select({ id: candidates.id, photoUrl: candidates.photoUrl })
    .from(candidates)
    .where(like(candidates.photoUrl, "https://img.hhcdn.ru%"))

  console.log(`найдено: ${rows.length}`)
  if (rows.length === 0) {
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  }

  let ok = 0
  let failed = 0
  let processed = 0

  try {
    for (const row of rows) {
      processed++
      if (!row.photoUrl) { failed++; continue }

      const local = await saveCandidatePhoto(row.id, row.photoUrl)
      if (local && local !== row.photoUrl) {
        await db.update(candidates).set({ photoUrl: local }).where(eq(candidates.id, row.id))
        ok++
      } else {
        failed++
      }

      if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
        const pct = Math.round((processed / rows.length) * 100)
        console.log(`  [${processed}/${rows.length} = ${pct}%]  ok=${ok}  failed=${failed}`)
      }

      await sleep(DELAY_MS)
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000)
    console.log(`[${new Date().toISOString()}] готово.`)
    console.log(`  ✓ ok:        ${ok}`)
    console.log(`  ✗ failed:    ${failed}`)
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
