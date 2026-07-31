// GET /api/modules/hr/vacancies/[id]/analytics
//
// Серверная агрегация аналитики по ВСЕЙ вакансии (а не по выгруженной на
// клиент странице кандидатов). Раньше таб «Аналитика» считал всё из массива
// columns, который на вакансиях с серверной пагинацией неполный → метрики
// занижались и расходились с шапкой. Здесь агрегация делается в БД (GROUP BY /
// COUNT / AVG), логика total/стадий совпадает с lib/vacancy-stats.ts (та же,
// что в шапке через /stats), а средний скор берётся по РЕАЛЬНОМУ ai_score.
//
// Query: ?period=all|7d|30d|90d — единый фильтр по candidates.created_at для
// ВСЕХ блоков. period=all — без фильтра по дате.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { and, eq, sql, type SQL } from "drizzle-orm"
import {
  IN_PROGRESS_STAGE_SLUGS, DEMO_OPENED_STAGE_SLUGS,
  ALL_STAGE_SLUGS, PLATFORM_STAGES,
} from "@/lib/stages"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id: vacancyId } = await ctx.params

  // Доступ как в /stats: вакансия должна принадлежать компании пользователя,
  // platform-роли видят всё.
  const [vac] = await db
    .select({ companyId: vacancies.companyId, createdAt: vacancies.createdAt })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) return NextResponse.json({ error: "vacancy not found" }, { status: 404 })

  const userRole = (session.user as { role?: string }).role
  const userCompanyId = (session.user as { companyId?: string }).companyId
  const isPlatform = userRole === "platform_admin" || userRole === "platform_manager"
  if (!isPlatform && (!userCompanyId || userCompanyId !== vac.companyId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // ── Период (единый фильтр для всех блоков) ──
  const periodParam = (new URL(_req.url).searchParams.get("period") || "all").toLowerCase()
  const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 }
  const days = periodDays[periodParam]

  const conds: SQL[] = [eq(candidates.vacancyId, vacancyId)]
  if (days) {
    conds.push(sql`${candidates.createdAt} >= now() - (${days} * interval '1 day')`)
  }
  const whereCands = and(...conds)

  // ── Разбивка по stage (одним проходом) → total + воронка ──
  const stageRows = await db
    .select({ stage: candidates.stage, count: sql<number>`count(*)::int` })
    .from(candidates)
    .where(whereCands)
    .groupBy(candidates.stage)

  const stageCounts: Record<string, number> = {}
  let total = 0
  for (const r of stageRows) {
    const st = r.stage || "new"
    stageCounts[st] = (stageCounts[st] || 0) + r.count
    total += r.count
  }

  const sc = (k: string) => stageCounts[k] || 0
  const hired = sc("hired")
  const rejected = sc("rejected")
  // inProgress/demoOpened — теми же группами стадий, что и lib/vacancy-stats.ts
  // (которое питает шапку через /stats), чтобы цифры точно совпадали.
  const inProgress = IN_PROGRESS_STAGE_SLUGS.reduce((a, s) => a + sc(s), 0)
  const demoOpened = DEMO_OPENED_STAGE_SLUGS.reduce((a, s) => a + sc(s), 0)

  // ── Воронка (пересобрана 15.07: диагностика координатора) ──
  // ДО этого фикса воронка строилась на словаре канбан-колонок
  // (lib/column-config: new/demo/decision/interview/final_decision/hired), а
  // считала при этом сырые candidates.stage — а там лежат КАНОНИЧЕСКИЕ слаги
  // lib/stages.ts (PLATFORM_STAGES). Словари почти не пересекаются →
  // «Нанято» всегда 0 (слага "hired" в канбан-словаре не было в подсчёте
  // sc("hired") напрямую... на деле было хуже — final_decision, на который
  // опиралась половина строк, в каноне не существует вовсе, строка «Финальное
  // решение» была мертва по построению), «Демо» тащило за собой все отказы,
  // «Интервью» не видело test_task_sent/offer_sent/started_work. Живые цифры
  // одной вакансии на проде (954 кандидата): demo_opened 570, rejected 146,
  // primary_contact 134, interview 37, test_task_sent 33, new 12, offer_sent
  // 10, decision 9, started_work 5 — стадий hired/final_decision в данных
  // НЕТ ВООБЩЕ.
  //
  // Теперь воронка кумулятивная («дошёл до стадии X или дальше») на
  // КАНОНИЧЕСКИХ sortOrder из PLATFORM_STAGES — один источник правды с
  // канбаном/фильтром вакансии, вместо своего параллельного словаря.
  //
  // Пороги — по sortOrder стадии, с которой начинается соответствующий блок
  // воронки (см. lib/stages.ts). Не хардкодим числа россыпью — если кто-то
  // сдвинет sortOrder в PLATFORM_STAGES, воронка сама пересчитается.
  const FUNNEL_THRESHOLDS = {
    contact: PLATFORM_STAGES.primary_contact.sortOrder,  // 2
    demo: PLATFORM_STAGES.demo_opened.sortOrder,          // 3
    anketa: PLATFORM_STAGES.anketa_filled.sortOrder,      // 4
    interview: PLATFORM_STAGES.scheduled.sortOrder,       // 8 («Интервью наз.» — начало интервью-блока)
    decision: PLATFORM_STAGES.decision.sortOrder,         // 11
    offer: PLATFORM_STAGES.offer_sent.sortOrder,          // 12
    hiredOrStarted: PLATFORM_STAGES.hired.sortOrder,      // 13 (hired + started_work=14)
  } as const

  // Кумулятивный счёт «дошли до порога или дальше». rejected(99) и
  // preliminary_reject(98) исключены явно — иначе наивное sortOrder>=N
  // зачло бы ВСЕ отказы в КАЖДУЮ строку воронки, вплоть до «Нанят/Вышел»
  // (rejected.sortOrder=99 «всегда последний» — старший из всех).
  //
  // Легаси-слаги (demo/interviewed/final_decision/offer/preboarding/
  // wants_contact/talent_pool/pending — см. LEGACY_STAGE_LABELS в
  // lib/stages.ts) не входят в PLATFORM_STAGES, поэтому не участвуют в
  // сумме ни по одному порогу — они учтены только в total («Новый», устье
  // воронки), но не размазываются по прогрессивным строкам 2-8. Это
  // осознанный выбор: гадать sortOrder для легаси-алиасов (особенно
  // final_decision, у которого уже есть задокументированный B9-разнобой
  // прямо в lib/stages.ts) добавило бы ещё один источник рассинхрона, а не
  // убрало бы его.
  function cumulativeCount(threshold: number): number {
    let sum = 0
    for (const slug of ALL_STAGE_SLUGS) {
      if (slug === "rejected" || slug === "preliminary_reject") continue
      if (PLATFORM_STAGES[slug].sortOrder >= threshold) sum += sc(slug)
    }
    return sum
  }

  const funnelStages = [
    { stage: "Новый", count: total, color: "#94a3b8" },
    { stage: "Пер. контакт", count: cumulativeCount(FUNNEL_THRESHOLDS.contact), color: "#60a5fa" },
    { stage: "Демо", count: cumulativeCount(FUNNEL_THRESHOLDS.demo), color: "#3b82f6" },
    { stage: "Анкета/Скрининг", count: cumulativeCount(FUNNEL_THRESHOLDS.anketa), color: "#6366f1" },
    { stage: "Интервью", count: cumulativeCount(FUNNEL_THRESHOLDS.interview), color: "#8b5cf6" },
    { stage: "Решение", count: cumulativeCount(FUNNEL_THRESHOLDS.decision), color: "#f59e0b" },
    { stage: "Оффер", count: cumulativeCount(FUNNEL_THRESHOLDS.offer), color: "#10b981" },
    { stage: "Нанят/Вышел", count: cumulativeCount(FUNNEL_THRESHOLDS.hiredOrStarted), color: "#22c55e" },
  ]

  // ── Источники: count + avg по РЕАЛЬНОМУ ai_score (NULL не в среднем) ──
  const sourceRows = await db
    .select({
      source: candidates.source,
      count: sql<number>`count(*)::int`,
      avgScore: sql<number | null>`round(avg(${candidates.aiScore}) filter (where ${candidates.aiScore} is not null))::int`,
    })
    .from(candidates)
    .where(whereCands)
    .groupBy(candidates.source)

  const sourceData = sourceRows
    .map((r) => ({
      source: r.source || "manual",
      count: r.count,
      avgScore: r.avgScore ?? 0,
      pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ── Распределение AI-скора (по реальному ai_score) ──
  // Бакеты совместимы с прежним UI: 0-40 / 41-70 / 71-100, плюс средний скор.
  const [bucketRow] = await db
    .select({
      low: sql<number>`count(*) filter (where ${candidates.aiScore} >= 0 and ${candidates.aiScore} <= 40)::int`,
      mid: sql<number>`count(*) filter (where ${candidates.aiScore} > 40 and ${candidates.aiScore} <= 70)::int`,
      high: sql<number>`count(*) filter (where ${candidates.aiScore} > 70)::int`,
      avgScore: sql<number | null>`round(avg(${candidates.aiScore}) filter (where ${candidates.aiScore} is not null))::int`,
    })
    .from(candidates)
    .where(whereCands)

  const scoreRanges = [
    { range: "0-40 (низкий)", count: bucketRow?.low ?? 0, color: "#ef4444" },
    { range: "41-70 (средний)", count: bucketRow?.mid ?? 0, color: "#f59e0b" },
    { range: "71-100 (высокий)", count: bucketRow?.high ?? 0, color: "#22c55e" },
  ]
  const avgScore = bucketRow?.avgScore ?? 0

  return NextResponse.json({
    period: periodParam,
    total,
    inProgress,
    rejected,
    hired,
    avgScore,
    demoOpened,
    vacancyCreatedAt: vac.createdAt,
    stageCounts,
    funnelStages,
    sourceData,
    scoreRanges,
  })
}
