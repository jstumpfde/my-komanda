// GET/POST /api/cron/talent-pool-cleanup
// Защищён X-Cron-Secret. Раз в сутки. Жизненный цикл записей Резерва:
//  • Архив → Корзина: archivedAt старше per-company reserveRetentionMonths (дефолт 5 мес) → trashedAt=now.
//  • Корзина → удаление НАВСЕГДА: trashedAt старше ~1 месяца (фикс grace).
// reserveRetentionMonths=0 → «никогда не удалять» (компания осознанно отключила; 152-ФЗ на ней).
// Затрагивает только talent_pool_entries (ручные/CSV/форма/реферал). Кандидаты из отбора — нет.
//
// Crontab на сервере (00:30 UTC = 03:30 МСК, после trash-cleanup):
//   30 0 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     https://company24.pro/api/cron/talent-pool-cleanup >> /var/log/talent-pool-cleanup.log 2>&1

import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull, isNotNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { talentPoolEntries, companies } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "talent-pool-cleanup"
const DEFAULT_RETENTION_MONTHS = 5
const TRASH_GRACE_MONTHS = 1
// Предохранитель: не сносим больше N записей за прогон.
const MAX_DELETE_PER_RUN = 1000

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    // Компании, у которых есть архивные/корзинные записи (минимизируем работу).
    const companyRows = await db
      .selectDistinct({ companyId: talentPoolEntries.companyId })
      .from(talentPoolEntries)
      .where(sql`${talentPoolEntries.archivedAt} IS NOT NULL OR ${talentPoolEntries.trashedAt} IS NOT NULL`)

    let movedToTrash = 0
    let deleted = 0

    for (const { companyId } of companyRows) {
      if (!companyId) continue
      const [co] = await db.select({ defaults: companies.hiringDefaultsJson })
        .from(companies).where(eq(companies.id, companyId))
      const months = co?.defaults?.reserveRetentionMonths
      const retention = months === undefined || months === null ? DEFAULT_RETENTION_MONTHS : months

      // 1) Архив → Корзина (если компания не отключила удаление: retention>0).
      if (retention > 0) {
        const moved = await db.update(talentPoolEntries)
          .set({ trashedAt: new Date() })
          .where(and(
            eq(talentPoolEntries.companyId, companyId),
            isNotNull(talentPoolEntries.archivedAt),
            isNull(talentPoolEntries.trashedAt),
            lt(talentPoolEntries.archivedAt, sql`now() - (${retention} * interval '1 month')`),
          ))
          .returning({ id: talentPoolEntries.id })
        movedToTrash += moved.length
      }

      // 2) Корзина → удалить навсегда (фикс grace 1 мес, всегда).
      const removed = await db.delete(talentPoolEntries)
        .where(and(
          eq(talentPoolEntries.companyId, companyId),
          isNotNull(talentPoolEntries.trashedAt),
          lt(talentPoolEntries.trashedAt, sql`now() - (${TRASH_GRACE_MONTHS} * interval '1 month')`),
        ))
        .returning({ id: talentPoolEntries.id })
      deleted += removed.length
      if (deleted >= MAX_DELETE_PER_RUN) break
    }

    if (run) await finishCronRun(run.id, "ok", { movedToTrash, deleted }).catch(() => {})
    return NextResponse.json({ ok: true, movedToTrash, deleted })
  } catch (e) {
    if (run) await finishCronRun(run.id, "error", null, String(e)).catch(() => {})
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
