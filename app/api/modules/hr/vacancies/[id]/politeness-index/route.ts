// GET /api/modules/hr/vacancies/[id]/politeness-index
//
// «Индекс вежливости» — свой расчёт, т.к. официальный hh.ru API (dev.hh.ru,
// github.com/hhru/api) НЕ отдаёт этот показатель работодателю: это приватная
// аналитика в личном кабинете hh (см. feedback.hh.ru/knowledge-base/article/0448),
// строится по данным, которых у нас нет (открытые/отвеченные отклики в кабинете
// hh, включая карточки, которые мы даже не импортировали). Разведка зафиксирована
// в коммите этой ветки.
//
// СВОЙ индекс — честная замена на наших данных:
//   • «ответили» = кандидат ушёл со стадии 'new' (любое действие HR/автоматики:
//     сообщение, приглашение, отказ, перевод дальше) — candidates.stage_history
//     содержит хотя бы одну запись (первая запись = момент первого ответа).
//   • «время ответа» = at первой записи stage_history МИНУС candidates.created_at.
//   • По вакансии: доля отвеченных откликов среди НЕ удалённых кандидатов
//     (deleted_at IS NULL) + медианное время первого ответа (часы).
//   • По компании: агрегат по тем же полям среди кандидатов АКТИВНЫХ/НА ПАУЗЕ
//     вакансий компании (закрытые/в корзине вакансии не тянут метрику вниз
//     старыми хвостами).
//   • Индекс (0-100) = округлённая доля отвеченных × 100 (время ответа —
//     отдельно, в тултипе, не входит в само число — так честнее и проще).
//
// Кэш: in-memory Map на 1 час (ключ — vacancyId и companyId отдельно), чтобы не
// гонять агрегирующий SQL на каждый рендер шапки. Не нужен отдельный cron —
// считаем по требованию (шапка вакансии открывается не настолько часто).
import { NextRequest } from "next/server"
import { and, eq, isNull, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getVacancyLifecycle } from "@/lib/vacancies/lifecycle"

export const dynamic = "force-dynamic"

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 час

interface PolitenessStats {
  totalCandidates: number
  respondedCandidates: number
  responseRate: number       // 0..100, округлено
  medianResponseHours: number | null
}

interface PolitenessIndexResponse {
  vacancy: PolitenessStats
  company: PolitenessStats
}

const cache = new Map<string, { data: PolitenessIndexResponse; expiresAt: number }>()

// «Ответили» = первая запись stage_history (JSONB-массив, [0].at — ISO timestamp).
// Медиана времени ответа в часах считается через percentile_cont по массиву
// разниц (candidates.created_at → первая stage_history.at), только для тех, у
// кого стадия сдвинулась. sql.raw безопасен — vacancyIds/companyId параметризуются
// через drizzle sql-темплейт ниже (не строковая конкатенация).
async function computeStats(whereClause: ReturnType<typeof and>): Promise<PolitenessStats> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      responded: sql<number>`count(*) FILTER (WHERE jsonb_array_length(coalesce(${candidates.stageHistory}, '[]'::jsonb)) > 0)`.mapWith(Number),
      medianHours: sql<number | null>`
        percentile_cont(0.5) WITHIN GROUP (ORDER BY
          EXTRACT(EPOCH FROM (
            (${candidates.stageHistory}->0->>'at')::timestamptz - ${candidates.createdAt}
          )) / 3600.0
        ) FILTER (
          WHERE jsonb_array_length(coalesce(${candidates.stageHistory}, '[]'::jsonb)) > 0
        )
      `.mapWith((v) => (v == null ? null : Number(v))),
    })
    .from(candidates)
    .where(whereClause)

  const total = Number(row?.total ?? 0)
  const responded = Number(row?.responded ?? 0)
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0
  const medianResponseHours = row?.medianHours != null ? Math.round(row.medianHours * 10) / 10 : null

  return { totalCandidates: total, respondedCandidates: responded, responseRate, medianResponseHours }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    const [vac] = await db
      .select({ companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    if (!vac || vac.companyId !== user.companyId) {
      return apiError("Вакансия не найдена", 404)
    }

    const cacheKey = `${vac.companyId}:${vacancyId}`
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return apiSuccess(cached.data)
    }

    // По вакансии — все не удалённые кандидаты этой вакансии.
    const vacancyStats = await computeStats(
      and(eq(candidates.vacancyId, vacancyId), isNull(candidates.deletedAt)),
    )

    // По компании — кандидаты АКТИВНЫХ/НА ПАУЗЕ вакансий (без архива/корзины,
    // чтобы старые закрытые вакансии не тянули метрику вниз/вверх искусственно).
    const companyVacancies = await db
      .select({ id: vacancies.id, status: vacancies.status, deletedAt: vacancies.deletedAt })
      .from(vacancies)
      .where(eq(vacancies.companyId, vac.companyId))

    const workingVacancyIds = companyVacancies
      .filter(v => v.deletedAt == null && ["active", "paused"].includes(getVacancyLifecycle(v.status)))
      .map(v => v.id)

    const companyStats = workingVacancyIds.length > 0
      ? await computeStats(
          and(inArray(candidates.vacancyId, workingVacancyIds), isNull(candidates.deletedAt)),
        )
      : { totalCandidates: 0, respondedCandidates: 0, responseRate: 0, medianResponseHours: null }

    const data: PolitenessIndexResponse = { vacancy: vacancyStats, company: companyStats }
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })

    return apiSuccess(data)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET politeness-index]", err)
    return apiError("Internal server error", 500)
  }
}
