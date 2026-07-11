// POST /api/cron/knowledge-drive-sync
// Синк подключённых источников знаний (фаза 1 — только Яндекс.Диск):
// по всем активным knowledge_sources с непустыми rootFolders — краул
// выбранных папок → дифф по (path, contentHash) → парсинг/чанкинг/эмбеддинг
// изменённых → soft-delete исчезнувших (lib/knowledge-sources/sync-source.ts
// — общий движок с ручным «Синхронизировать сейчас»).
//
// MAX_FILES_PER_RUN — общий бюджет файлов на весь тик (across все компании),
// чтобы не выжирать месячный AI-лимит компаний за один прогон и не держать
// advisory lock часами на большом первом краwlе. Паттерн cron'а — образец
// app/api/cron/hh-import/route.ts (advisory lock + cron_runs).

import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { knowledgeSources, companies, users } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { syncOneSource } from "@/lib/knowledge-sources/sync-source"
import { isEnabledForCron } from "@/lib/knowledge-sources/feature-flag"

// Ключи 7470001-7470003 заняты (hh-import, pending-rejections, price-monitor-tick).
const LOCK_KEY = 7470004
const MAX_FILES_PER_RUN = 200

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const lockRows = await db.execute(
    sql`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS acquired`,
  ) as unknown as Array<{ acquired: boolean }>
  if (lockRows?.[0]?.acquired !== true) {
    return NextResponse.json(
      { ok: false, busy: true, error: "knowledge-drive-sync already running" },
      { status: 409 },
    )
  }

  let filesTouched = 0
  let indexed = 0
  let skipped = 0
  let errors = 0
  const errorMessages: string[] = []

  try {
    const run = await startCronRun("knowledge-drive-sync")

    try {
      // MINOR-a (ревью 11.07): давно не синканные — первыми (NULLS FIRST =
      // только что подключённые), чтобы большой первичный краул одного
      // источника не морил голодом остальные при общем бюджете файлов.
      const rows = await db
        .select({
          source: knowledgeSources,
          hiringDefaultsJson: companies.hiringDefaultsJson,
          connectedByEmail: users.email,
        })
        .from(knowledgeSources)
        .innerJoin(companies, eq(knowledgeSources.tenantId, companies.id))
        .leftJoin(users, eq(knowledgeSources.connectedBy, users.id))
        .where(eq(knowledgeSources.status, "active"))
        .orderBy(sql`${knowledgeSources.lastSyncAt} ASC NULLS FIRST`)

      for (const row of rows) {
        // MAJOR-1 (ревью 11.07): выключили фиче-флаг компании → источник
        // перестаёт синкаться со следующего тика (company-флаг ИЛИ
        // подключал владелец-полигон — см. isEnabledForCron).
        if (!isEnabledForCron(row.hiringDefaultsJson, row.connectedByEmail)) continue

        const budget = MAX_FILES_PER_RUN - filesTouched
        if (budget <= 0) break

        const result = await syncOneSource(row.source, budget)
        filesTouched += result.filesTouched
        indexed += result.indexed
        skipped += result.skipped
        errors += result.errors
        errorMessages.push(...result.errorMessages)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[knowledge-drive-sync] top-level:", msg)
      await finishCronRun(run.id, "error", { filesTouched, indexed, skipped, errors }, msg).catch(() => {})
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }

    await finishCronRun(run.id, "ok", {
      filesTouched, indexed, skipped, errors,
      errorMessages: errorMessages.slice(0, 20),
    })

    return NextResponse.json({ ok: true, filesTouched, indexed, skipped, errors, errorMessages })
  } finally {
    // Гарантированное освобождение lock'а на любом пути выхода — иначе cron
    // вечно возвращал бы 409 (паттерн hh-import, инцидент 07.06.2026).
    await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY})`).catch(() => {})
  }
}
