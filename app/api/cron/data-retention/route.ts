// GET/POST /api/cron/data-retention
// ФЗ-152: обезличивает персональные данные ОТКАЗАННЫХ кандидатов по истечении
// срока хранения компании (companies.hiring_defaults_json->>'dataRetention').
// Защищён X-Cron-Secret. Идемпотентен: обработанные строки помечаются
// candidates.personal_data_erased_at и повторно не берутся.
//
// Порог возраста считается от candidates.updated_at (для давно отказанного
// кандидата ≈ момент отказа; правки HR продлевают срок — консервативно).
// Компании без явной настройки или с 'never' НЕ обрабатываются.
//
// dryRun: ?dryRun=1 (или body {dryRun:true}) — только считает, ничего не пишет.
//
// Crontab на сервере (раз в сутки, 04:00 МСК):
//   0 1 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/data-retention >> /var/log/data-retention.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, companies, vacancies } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import {
  retentionDays,
  buildErasureSet,
  collectLocalUploadFiles,
  deleteLocalFiles,
} from "@/lib/candidates/data-retention"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const CRON_NAME = "data-retention"
const MAX_PER_RUN = 500
// Отказные стадии (наш цикл + легаси). hired/прочие не трогаем.
const REJECTED_STAGES = ["rejected", "preliminary_reject"]

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  let dryRun = url.searchParams.get("dryRun") === "1"
  if (!dryRun) {
    const body = await req.json().catch(() => ({})) as { dryRun?: boolean }
    if (body?.dryRun === true) dryRun = true
  }

  const run = dryRun ? null : await startCronRun(CRON_NAME)
  const now = new Date()
  const perCompany: Array<{ company: string; retention: string; erased: number; files: number }> = []
  let totalErased = 0
  let totalFiles = 0

  try {
    // Компании с явной настройкой хранения (не null, не never).
    const comps = await db
      .select({
        id: companies.id,
        retention: sql<string>`${companies.hiringDefaultsJson}->>'dataRetention'`,
      })
      .from(companies)

    for (const c of comps) {
      const days = retentionDays(c.retention)
      if (days === null) continue // never / не задано — пропускаем

      const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

      // Отказанные, ещё не обезличенные, старше порога, у этой компании.
      const due = await db
        .select({
          id: candidates.id,
          photoUrl: candidates.photoUrl,
          demoProgressJson: candidates.demoProgressJson,
          surveyResponses: candidates.surveyResponses,
        })
        .from(candidates)
        .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
        .where(and(
          eq(vacancies.companyId, c.id),
          inArray(candidates.stage, REJECTED_STAGES),
          isNull(candidates.personalDataErasedAt),
          lt(candidates.updatedAt, threshold),
        ))
        .limit(MAX_PER_RUN - totalErased)

      if (due.length === 0) continue

      let companyFiles = 0
      if (!dryRun) {
        for (const row of due) {
          const files = collectLocalUploadFiles(row)
          companyFiles += await deleteLocalFiles(files)
          await db.update(candidates).set(buildErasureSet(now)).where(eq(candidates.id, row.id))
        }
      } else {
        // В dry-run только считаем потенциальные файлы, ничего не удаляем.
        for (const row of due) companyFiles += collectLocalUploadFiles(row).length
      }

      perCompany.push({ company: c.id, retention: c.retention, erased: due.length, files: companyFiles })
      totalErased += due.length
      totalFiles += companyFiles
      if (totalErased >= MAX_PER_RUN) break
    }

    const metadata = { dryRun, totalErased, totalFiles, perCompany }
    if (run) await finishCronRun(run.id, "ok", metadata)
    return NextResponse.json({ ok: true, ...metadata })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", { totalErased, totalFiles }, msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
