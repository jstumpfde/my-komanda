// GET/POST /api/cron/ghost-candidate-cleanup
// Защищён X-Cron-Secret. Физически удаляет "кандидатов-призраков" —
// пустые заглушки, которые /api/public/demo/[token]/visit создаёт на
// анонимный визит по чужой referral-ссылке без куки myk_candidate_uuid
// (боты/краулеры разворачивающие ссылку в превью, брошенные визиты).
// Инцидент 13.07: 35 таких строк вычищено вручную на проде. Staff-preview
// визиты (сотрудник компании-владельца вакансии) теперь вообще не создают
// кандидата (см. lib/public/staff-preview.ts) — этот крон подчищает
// остальное (боты и т.п.), критерий — lib/candidates/ghost-cleanup.ts.
//
// Критерий призрака (isGhostCandidate):
//   name='Новый кандидат' AND source LIKE '%referral%' AND stage='new'
//   AND resume_score IS NULL AND phone IS NULL AND email IS NULL
//   AND (demo_progress_json IS NULL OR demo_progress_json::text IN ('null','{}'))
//   AND created_at < now() - interval '24 hours'
//
// Удаление — через ту же логику, что bulk hard_delete (HR):
// lib/candidates/hard-delete-ids.ts (hh_responses → hh_candidates → candidates).
//
// Рекомендуемая строка crontab на сервере (раз в сутки, следом за
// trash-cleanup 03:00 МСК → 00:00 UTC):
//   30 0 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/ghost-candidate-cleanup \
//     >> /var/log/ghost-candidate-cleanup.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull, like, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { hardDeleteCandidatesByIds } from "@/lib/candidates/hard-delete-ids"
import {
  isGhostCandidate,
  GHOST_CANDIDATE_NAME,
  GHOST_STAGE,
  GHOST_MIN_AGE_HOURS,
} from "@/lib/candidates/ghost-cleanup"

const CRON_NAME = "ghost-candidate-cleanup"
// Предохранитель: не сносим больше N строк за один прогон.
const MAX_PER_RUN = 500

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    const rows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        source: candidates.source,
        stage: candidates.stage,
        resumeScore: candidates.resumeScore,
        phone: candidates.phone,
        email: candidates.email,
        demoProgressJson: candidates.demoProgressJson,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .where(and(
        eq(candidates.name, GHOST_CANDIDATE_NAME),
        like(candidates.source, "%referral%"),
        eq(candidates.stage, GHOST_STAGE),
        isNull(candidates.resumeScore),
        isNull(candidates.phone),
        isNull(candidates.email),
        or(
          isNull(candidates.demoProgressJson),
          sql`${candidates.demoProgressJson}::text IN ('null','{}')`,
        ),
        sql`${candidates.createdAt} < now() - make_interval(hours => ${GHOST_MIN_AGE_HOURS})`,
      ))
      .orderBy(candidates.createdAt)
      .limit(MAX_PER_RUN)

    // Защита в глубину: перепроверяем каждую найденную строку чистой
    // функцией (та же, что покрыта юнит-тестами) перед физическим удалением.
    const ghostIds = rows.filter((r) => isGhostCandidate(r)).map((r) => r.id)

    const deleted = await hardDeleteCandidatesByIds(ghostIds)

    const metadata = { found: rows.length, deleted }
    if (run) await finishCronRun(run.id, "ok", metadata)
    return NextResponse.json({ ok: true, ...metadata })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    console.error("[ghost-candidate-cleanup] fatal:", msg)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
