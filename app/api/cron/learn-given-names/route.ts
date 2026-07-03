// POST/GET /api/cron/learn-given-names
// Защищён X-Cron-Secret (как другие cron'ы, см. app/api/cron/trash-cleanup).
//
// Самообучающийся ПЛАТФОРМЕННЫЙ (глобальный, без company_id) справочник имён
// кандидатов (фидбэк Юрия 03.07.2026): имена вроде «Елизаветта», которых нет в
// статическом словаре (lib/messaging/russian-given-names.ts), но которые
// повторяются у РАЗНЫХ кандидатов по всей платформе — автообучаются, и
// предупреждение «⚠ имя не из справочника» для них больше не показывается
// (см. lib/messaging/candidate-name.ts → resolveGivenNameMeta{ learned }).
//
// Алгоритм:
//   1. Агрегируем SQL-ом по hh_responses.raw_data ПО ВСЕЙ ПЛАТФОРМЕ: первый
//      токен hh first_name (resume.first_name с фолбэком на корневой
//      first_name), нормализованный (lower).
//   2. Фильтруем: только буквы/дефис, длина 2-20, НЕ looksLikeSurname, НЕ
//      isKnownGivenName (уже в статическом словаре — учить нечего).
//   3. Считаем distinct кандидатов (local_candidate_id) на каждый нормализованный
//      токен.
//   4. Строки с count ≥3 — upsert в learned_given_names (occurrences =
//      наибольшее из старого/нового, last_seen обновляется, display_name — самый
//      частый оригинальный регистр среди раунда).
//
// Cooldown 20 часов между запусками (как у ai-chatbot-watcher, но реже — это
// медленно меняющиеся данные). Запись в cron_runs через startCronRun/finishCronRun.

import { NextRequest, NextResponse } from "next/server"
import { sql, desc, and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronRuns, learnedGivenNames } from "@/lib/db/schema"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"
import { isKnownGivenName, looksLikeSurname, normalizeNameToken } from "@/lib/messaging/russian-given-names"
import { invalidateLearnedNamesCache } from "@/lib/messaging/learned-given-names"

const CRON_NAME = "learn-given-names"
const MIN_INTERVAL_MS = 20 * 60 * 60_000  // 20 часов
const MIN_OCCURRENCES = 3                  // порог обучения — ≥3 РАЗНЫХ кандидатов

async function lastSuccessfulRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: cronRuns.finishedAt })
    .from(cronRuns)
    .where(and(eq(cronRuns.cronName, CRON_NAME), eq(cronRuns.status, "ok")))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

interface RawCandidateRow {
  token: string          // как встретилось (оригинальный регистр, первый токен)
  candidateId: string
}

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  const force = new URL(req.url).searchParams.get("force") === "true"
  if (!force) {
    const lastOk = await lastSuccessfulRunAt()
    if (lastOk && Date.now() - lastOk.getTime() < MIN_INTERVAL_MS) {
      return NextResponse.json({
        ok:      true,
        skipped: true,
        reason:  "too_recent",
        lastOk:  lastOk.toISOString(),
      })
    }
  }

  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    // Агрегация по всей платформе (без company_id — глобальный справочник).
    // Первый токен hh first_name (resume.first_name с фолбэком на корневой
    // first_name), только буквы РУС + дефис, длина 2-20, distinct кандидат.
    const rows = (await db.execute(sql`
      SELECT DISTINCT ON (local_candidate_id, token)
        token,
        local_candidate_id AS "candidateId"
      FROM (
        SELECT
          local_candidate_id,
          split_part(
            trim(COALESCE(raw_data->'resume'->>'first_name', raw_data->>'first_name', '')),
            ' ', 1
          ) AS token
        FROM hh_responses
        WHERE local_candidate_id IS NOT NULL
          AND COALESCE(raw_data->'resume'->>'first_name', raw_data->>'first_name') IS NOT NULL
      ) t
      WHERE token ~ '^[А-Яа-яЁё\\-]{2,20}$'
    `)) as unknown as RawCandidateRow[]

    // Группируем в JS: нормализованный токен → { distinct candidateIds, display counts }.
    const groups = new Map<string, { candidateIds: Set<string>; displayCounts: Map<string, number> }>()
    for (const r of rows) {
      const norm = normalizeNameToken(r.token)
      if (!norm) continue
      if (isKnownGivenName(norm)) continue       // уже в статическом словаре — учить нечего
      if (looksLikeSurname(norm)) continue        // анти-фамилия — не обучаем автоматически
      let g = groups.get(norm)
      if (!g) { g = { candidateIds: new Set(), displayCounts: new Map() }; groups.set(norm, g) }
      g.candidateIds.add(r.candidateId)
      g.displayCounts.set(r.token, (g.displayCounts.get(r.token) ?? 0) + 1)
    }

    let upserted = 0
    let skippedBelowThreshold = 0
    const learnedNow: string[] = []

    for (const [norm, g] of groups) {
      const occurrences = g.candidateIds.size
      if (occurrences < MIN_OCCURRENCES) { skippedBelowThreshold++; continue }

      // display_name — вариант написания, встретившийся чаще всего.
      let displayName = norm
      let bestCount = -1
      for (const [variant, count] of g.displayCounts) {
        if (count > bestCount) { bestCount = count; displayName = variant }
      }

      await db
        .insert(learnedGivenNames)
        .values({
          nameNorm:    norm,
          displayName,
          occurrences,
          firstSeen:   new Date(),
          lastSeen:    new Date(),
        })
        .onConflictDoUpdate({
          target: learnedGivenNames.nameNorm,
          set: {
            displayName,
            occurrences: sql`GREATEST(${learnedGivenNames.occurrences}, ${occurrences})`,
            lastSeen:    new Date(),
          },
        })
      upserted++
      learnedNow.push(norm)
    }

    invalidateLearnedNamesCache()

    const metadata = {
      candidatesScanned:   rows.length,
      groupsConsidered:    groups.size,
      upserted,
      skippedBelowThreshold,
    }
    if (run) await finishCronRun(run.id, "ok", metadata)
    return NextResponse.json({ ok: true, ...metadata, learnedNow })
  } catch (err) {
    if (run) await finishCronRun(run.id, "error", null, err instanceof Error ? err.message : String(err))
    console.error("[cron/learn-given-names] fatal:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
