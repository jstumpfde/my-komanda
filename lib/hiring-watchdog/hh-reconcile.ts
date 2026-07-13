// «Сторож найма» — сверка «наша стадия vs реальная hh-папка» (инцидент 13.07).
//
// changeNegotiationState() (lib/hh-api.ts) в ОДНОМ PUT и доставляет сообщение
// кандидату, и переводит hh-папку (employer_state). У части кандидатов
// из-за устаревшего значения inviteHhStage="consider" в старых vacancy_specs
// папка переводилась НЕ туда («Подумать» вместо «Первичный контакт») — и
// оставалась незамеченной: наша стадия (primary_contact) при этом полностью
// корректна, а входящий синк (lib/hh/sync-inbound-stages.ts) тоже не ловит
// расхождение — phone_interview И consider ОБА маппятся в primary_contact
// (см. lib/hh/stage-mapping.ts), поэтому «уже синхронно» для него.
//
// Эта проверка сравнивает РЕАЛЬНОЕ hh employer_state с ТОЧНЫМ ожиданием —
// spec.resumeThresholds.inviteHhStage конкретной вакансии (дефолт
// phone_interview), симметрично тому, что реально отправляет process-queue.ts
// (см. lib/hh-api.ts:364-369 — двойной action↔state маппинг там взаимно
// сокращается до тождества со значением inviteHhStage).
//
// Скоуп — ТОЛЬКО недавно (последние WINDOW_START_HOURS_AGO часов, с буфером
// WINDOW_END_MINUTES_AGO на распространение изменений на стороне hh)
// приглашённых кандидатов, максимум RECONCILE_BATCH_LIMIT за прогон, с паузой
// между hh-запросами (тот же anti-429 паттерн, что HH_BULK_DELAY_MS в
// app/api/modules/hr/candidates/bulk/route.ts) — не долбим hh rate-limit и не
// разбираем всю историю на каждый тик (крон бежит каждые 10 минут).

import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { getSpec } from "@/lib/core/spec/store"
import { resolveNegotiationId, fetchNegotiationState } from "@/lib/hh/sync-inbound-stages"
import { classifyHhStageMismatch, type WatchdogIssue } from "./classify"

const WINDOW_START_HOURS_AGO = 3
const WINDOW_END_MINUTES_AGO = 10 // буфер: даём hh время отразить смену papки
const RECONCILE_BATCH_LIMIT = 20
const HH_RECONCILE_DELAY_MS = 700 // anti-429, по образцу HH_BULK_DELAY_MS

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function checkHhStageMismatch(): Promise<WatchdogIssue[]> {
  const since = new Date(Date.now() - WINDOW_START_HOURS_AGO * 60 * 60 * 1000)
  const until = new Date(Date.now() - WINDOW_END_MINUTES_AGO * 60 * 1000)

  // «Реально прошедшие автоприглашение» — stage=primary_contact И resume_score
  // проставлен (иначе это либо ручной перевод HR, либо «слепой инвайт» —
  // отдельная проверка checkBlindInviteNoScore).
  const rows = await db
    .select({
      id:         candidates.id,
      vacancyId:  candidates.vacancyId,
      companyId:  vacancies.companyId,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(
      eq(candidates.stage, "primary_contact"),
      isNotNull(candidates.resumeScore),
      gte(candidates.updatedAt, since),
      lte(candidates.updatedAt, until),
    ))
    .orderBy(desc(candidates.updatedAt))
    .limit(RECONCILE_BATCH_LIMIT)

  if (rows.length === 0) return []

  const issues: WatchdogIssue[] = []
  // Кешируем токен на компанию в рамках одного прогона — несколько кандидатов
  // одной компании не должны рефрешить/запрашивать токен повторно.
  const tokenCache = new Map<string, string | null>()

  for (const row of rows) {
    let accessToken = tokenCache.get(row.companyId)
    if (accessToken === undefined) {
      const tokenResult = await getValidToken(row.companyId).catch(() => null)
      accessToken = tokenResult?.accessToken ?? null
      tokenCache.set(row.companyId, accessToken)
    }
    if (!accessToken) continue // hh отключён — отдельно ловит checkHhToken, не дублируем

    const negotiationId = await resolveNegotiationId(row.id, row.companyId).catch(() => null)
    if (!negotiationId) continue

    const actual = await fetchNegotiationState(accessToken, negotiationId)
    if (HH_RECONCILE_DELAY_MS > 0) await sleep(HH_RECONCILE_DELAY_MS)
    if (!actual) continue // сеть/hh недоступен — штатное «не получилось», следующий тик перепроверит

    const spec = await getSpec(row.vacancyId).catch(() => null)
    const expected = spec?.resumeThresholds?.inviteHhStage ?? "phone_interview"

    const issue = classifyHhStageMismatch(row.id, row.companyId, row.vacancyId, expected, actual)
    if (issue) issues.push(issue)
  }

  return issues
}

// Dedup-префикс для авто-resolve скоупа (см. WATCHDOG_DEDUP_PREFIXES в checks.ts).
export const HH_STAGE_MISMATCH_DEDUP_PREFIX = "hh_stage_mismatch:"
