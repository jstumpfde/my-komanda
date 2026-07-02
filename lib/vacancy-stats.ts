// #13/#14: единая функция статистики вакансии. Цель — один источник
// истины для шапки страницы вакансии, таба «Аналитика» и дашборда
// найма. Раньше каждый из них считал по-своему, и цифры расходились
// (особенно аналитика — она использовала пагинированный клиентский
// columns, в шапке был отдельный SQL, в дашборде — третий вариант).

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import {
  ALL_STAGE_SLUGS,
  IN_PROGRESS_STAGE_SLUGS,
  ANKETA_FILLED_STAGE_SLUGS,
  DEMO_OPENED_STAGE_SLUGS,
  type StageSlug,
} from "@/lib/stages"

export interface VacancyStats {
  // hh.ru блок — синхронизированы с hh-кабинетом.
  hhTotal:        number
  hhNew:          number
  hhLastSyncAt:   string | null
  // Наши данные после разбора.
  total:          number
  inProgress:     number
  rejected:       number
  hired:          number
  demoOpened:     number
  anketaFilled:   number
  // Кандидаты, ответившие на вопросы демо (demo_answers_score посчитан).
  demoAnswered:   number
  // Кандидаты, кликнувшие по кнопке-ссылке в демо (demo_progress_json.ctaClicks
  // непустой). 0 — если в демо нет кнопки-ссылки или никто не переходил.
  ctaClicked:     number
  // «2-я часть демо» (Путь менеджера): приглашены (second_demo_invited_at)
  // и прошли — есть балл ВТОРОГО блока в demo_block_scores (≥2 ключей).
  secondDemoInvited: number
  secondDemoPassed:  number
  // Детализация по стадиям (slug → count) — для аналитики/воронки.
  byStage:        Record<string, number>
  // Конверсии. Все в процентах [0..100], округлены до 1 знака.
  conversions: {
    demoOpenRate:     number  // demoOpened / total
    anketaFillRate:   number  // anketaFilled / demoOpened
    hiredRate:        number  // hired / total
  }
  // Счётчики AI-токенов (суммарно по вакансии). 0 если колонки ещё не созданы.
  aiTokensIn:  number
  aiTokensOut: number
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

// Серверная функция. Не имеет авторизации — auth/owner check делает caller.
export async function getVacancyStats(vacancyId: string): Promise<VacancyStats> {
  const [vac] = await db
    .select({
      companyId:   vacancies.companyId,
      hhVacancyId: vacancies.hhVacancyId,
      aiTokensIn:  vacancies.aiTokensIn,
      aiTokensOut: vacancies.aiTokensOut,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) {
    return emptyStats()
  }

  // Один запрос — count GROUP BY stage. Даёт byStage + базовые counts.
  const byStageRows = await db
    .select({
      stage: candidates.stage,
      cnt:   sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(eq(candidates.vacancyId, vacancyId))
    .groupBy(candidates.stage)

  const byStage: Record<string, number> = {}
  let total = 0
  for (const row of byStageRows) {
    const key = row.stage ?? "new"
    byStage[key] = row.cnt
    total += row.cnt
  }
  // Заполняем нулями недостающие slug'и — UI ожидает full set.
  for (const s of ALL_STAGE_SLUGS) {
    if (!(s in byStage)) byStage[s] = 0
  }

  const sumByGroup = (group: StageSlug[]) =>
    group.reduce((a, s) => a + (byStage[s] ?? 0), 0)

  const inProgress   = sumByGroup(IN_PROGRESS_STAGE_SLUGS)
  const rejected     = byStage["rejected"] ?? 0
  const hired        = byStage["hired"] ?? 0
  const demoOpened   = sumByGroup(DEMO_OPENED_STAGE_SLUGS)
  const anketaFilled = sumByGroup(ANKETA_FILLED_STAGE_SLUGS)

  // Ответившие на вопросы демо — у кого посчитан demo_answers_score.
  const [demoAnsweredRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      isNotNull(candidates.demoAnswersScore),
    ))
  const demoAnswered = demoAnsweredRow?.c ?? 0

  // Перешли по кнопке-ссылке — у кого demo_progress_json.ctaClicks непустой.
  const [ctaClickedRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(candidates)
    .where(and(
      eq(candidates.vacancyId, vacancyId),
      sql`jsonb_array_length(COALESCE(${candidates.demoProgressJson} -> 'ctaClicks', '[]'::jsonb)) > 0`,
    ))
  const ctaClicked = ctaClickedRow?.c ?? 0

  // «2-я часть демо» (Путь менеджера): приглашённые и прошедшие (балл 2-го блока).
  const [secondDemoRow] = await db
    .select({
      invited: sql<number>`count(*) FILTER (WHERE ${candidates.secondDemoInvitedAt} IS NOT NULL)::int`,
      passed:  sql<number>`count(*) FILTER (WHERE (SELECT count(*) FROM jsonb_object_keys(COALESCE(${candidates.demoBlockScores}, '{}'::jsonb))) >= 2)::int`,
    })
    .from(candidates)
    .where(eq(candidates.vacancyId, vacancyId))
  const secondDemoInvited = secondDemoRow?.invited ?? 0
  const secondDemoPassed  = secondDemoRow?.passed ?? 0

  // hh.ru данные — из hh_responses (кеш, обновляется через /api/cron/hh-import).
  let hhTotal = 0
  let hhNew   = 0
  let hhLastSyncAt: string | null = null
  if (vac.hhVacancyId) {
    const [hhRows, lastSync] = await Promise.all([
      db.select({
          status: hhResponses.status,
          cnt:    sql<number>`count(*)::int`,
        })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, vac.companyId),
          eq(hhResponses.hhVacancyId, vac.hhVacancyId),
        ))
        .groupBy(hhResponses.status),
      db.select({ at: sql<Date>`MAX(${hhResponses.syncedAt})` })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, vac.companyId),
          eq(hhResponses.hhVacancyId, vac.hhVacancyId),
        ))
        .limit(1),
    ])
    for (const row of hhRows) {
      hhTotal += row.cnt
      // #45: 'claimed' — промежуточный статус («забран в обработку, ещё
      // не отправлен»). Считаем его как «новый», чтобы счётчик в шапке
      // уменьшался в темпе реальной отправки, а не моментально после
      // клейма всего батча.
      if (row.status === "response" || row.status === "claimed") hhNew += row.cnt
    }
    const at = lastSync?.[0]?.at
    hhLastSyncAt = at ? new Date(at).toISOString() : null
  }

  return {
    hhTotal, hhNew, hhLastSyncAt,
    total, inProgress, rejected, hired, demoOpened, anketaFilled, demoAnswered,
    ctaClicked,
    secondDemoInvited, secondDemoPassed,
    byStage,
    conversions: {
      demoOpenRate:   pct(demoOpened, total),
      anketaFillRate: pct(anketaFilled, demoOpened),
      hiredRate:      pct(hired, total),
    },
    // bigint → number (safe for our scale)
    aiTokensIn:  Number(vac.aiTokensIn  ?? 0),
    aiTokensOut: Number(vac.aiTokensOut ?? 0),
  }
}

// Bulk-версия для дашборда — один запрос на все vacancyId сразу.
// Использует группировку по (vacancyId, stage). Для hh-метрик отдельный
// проход, потому что они привязаны к hh_vacancy_id (string), а не к
// vacancies.id (uuid).
export async function getVacancyStatsBulk(
  vacancyIds: string[],
): Promise<Map<string, VacancyStats>> {
  if (vacancyIds.length === 0) return new Map()

  const rows = await db
    .select({
      vacancyId: candidates.vacancyId,
      stage:     candidates.stage,
      cnt:       sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(inArray(candidates.vacancyId, vacancyIds))
    .groupBy(candidates.vacancyId, candidates.stage)

  // Ответившие на вопросы демо — отдельный count по вакансиям.
  const demoAnsweredRows = await db
    .select({
      vacancyId: candidates.vacancyId,
      cnt:       sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(and(
      inArray(candidates.vacancyId, vacancyIds),
      isNotNull(candidates.demoAnswersScore),
    ))
    .groupBy(candidates.vacancyId)
  const demoAnsweredByVacancy = new Map<string, number>()
  for (const r of demoAnsweredRows) demoAnsweredByVacancy.set(r.vacancyId, r.cnt)

  // Перешли по кнопке-ссылке — отдельный count по вакансиям.
  const ctaClickedRows = await db
    .select({
      vacancyId: candidates.vacancyId,
      cnt:       sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(and(
      inArray(candidates.vacancyId, vacancyIds),
      sql`jsonb_array_length(COALESCE(${candidates.demoProgressJson} -> 'ctaClicks', '[]'::jsonb)) > 0`,
    ))
    .groupBy(candidates.vacancyId)
  const ctaClickedByVacancy = new Map<string, number>()
  for (const r of ctaClickedRows) ctaClickedByVacancy.set(r.vacancyId, r.cnt)

  // «2-я часть демо» — приглашены/прошли, по вакансиям.
  const secondDemoRows = await db
    .select({
      vacancyId: candidates.vacancyId,
      invited:   sql<number>`count(*) FILTER (WHERE ${candidates.secondDemoInvitedAt} IS NOT NULL)::int`,
      passed:    sql<number>`count(*) FILTER (WHERE (SELECT count(*) FROM jsonb_object_keys(COALESCE(${candidates.demoBlockScores}, '{}'::jsonb))) >= 2)::int`,
    })
    .from(candidates)
    .where(inArray(candidates.vacancyId, vacancyIds))
    .groupBy(candidates.vacancyId)
  const secondDemoByVacancy = new Map<string, { invited: number; passed: number }>()
  for (const r of secondDemoRows) secondDemoByVacancy.set(r.vacancyId, { invited: r.invited, passed: r.passed })

  // hh-stats fetched per-vacancy on demand. Bulk-версия hh не делает,
  // чтобы не таскать все hh_responses в одном запросе. Возвращаем
  // hh-блок нулями (если caller хочет — отдельно дёрнет getVacancyStats
  // на нужные vacancyId).
  const out = new Map<string, VacancyStats>()
  for (const id of vacancyIds) out.set(id, emptyStats())

  for (const r of rows) {
    const s = out.get(r.vacancyId)
    if (!s) continue
    const stage = r.stage ?? "new"
    s.byStage[stage] = (s.byStage[stage] ?? 0) + r.cnt
    s.total += r.cnt
  }

  // Recompute grouped metrics for each vacancy.
  for (const [id, stats] of out.entries()) {
    const sumByGroup = (group: StageSlug[]) =>
      group.reduce((a, s) => a + (stats.byStage[s] ?? 0), 0)
    stats.inProgress   = sumByGroup(IN_PROGRESS_STAGE_SLUGS)
    stats.rejected     = stats.byStage["rejected"] ?? 0
    stats.hired        = stats.byStage["hired"] ?? 0
    stats.demoOpened   = sumByGroup(DEMO_OPENED_STAGE_SLUGS)
    stats.anketaFilled = sumByGroup(ANKETA_FILLED_STAGE_SLUGS)
    stats.demoAnswered = demoAnsweredByVacancy.get(id) ?? 0
    stats.ctaClicked   = ctaClickedByVacancy.get(id) ?? 0
    stats.secondDemoInvited = secondDemoByVacancy.get(id)?.invited ?? 0
    stats.secondDemoPassed  = secondDemoByVacancy.get(id)?.passed ?? 0
    stats.conversions = {
      demoOpenRate:   pct(stats.demoOpened, stats.total),
      anketaFillRate: pct(stats.anketaFilled, stats.demoOpened),
      hiredRate:      pct(stats.hired, stats.total),
    }
  }

  return out
}

function emptyStats(): VacancyStats {
  const byStage: Record<string, number> = {}
  for (const s of ALL_STAGE_SLUGS) byStage[s] = 0
  return {
    hhTotal: 0, hhNew: 0, hhLastSyncAt: null,
    total: 0, inProgress: 0, rejected: 0, hired: 0,
    demoOpened: 0, anketaFilled: 0, demoAnswered: 0, ctaClicked: 0,
    secondDemoInvited: 0, secondDemoPassed: 0,
    byStage,
    conversions: { demoOpenRate: 0, anketaFillRate: 0, hiredRate: 0 },
    aiTokensIn: 0, aiTokensOut: 0,
  }
}
