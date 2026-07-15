// GET /api/modules/hr/vacancies/[id]/hh-status
//
// Лёгкий индикатор состояния hh-привязки вакансии для бейджа в шапке.
// НЕ дёргает hh API — читает ТОЛЬКО БД (быстро):
//   • vacancies.hhVacancyId + vacancies.hhArchived
//   • follow_up_messages за последние 24ч со status='failed'
//     (канал 'hh'), отдельно считаем error_message LIKE '%invalid_vacancy%'
//     (hh блокирует переписку с работодателем → красный).
//
// Тенант-изоляция: requireCompany() + проверка vacancies.companyId; чужая
// вакансия → 404 (не 403 — не палим существование).
//
// Ответ: { linked, archived, sendFailedRecent, invalidVacancyRecent,
//          level: 'ok'|'warn'|'error'|'none', message }
//   level:
//     none  — hh не привязан (нет hhVacancyId) → бейдж не показываем
//     error — invalid_vacancy за 24ч (hh активно блокирует переписку = аномалия)
//     warn  — hhArchived (штатный конец жизни, ~30 дн) ИЛИ обычные failed за 24ч
//     ok    — привязан, не архив, отправки идут
import { NextRequest } from "next/server"
import { and, eq, gte, count, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, followUpMessages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

type Level = "ok" | "warn" | "error" | "none"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    const [vac] = await db
      .select({
        companyId: vacancies.companyId,
        hhVacancyId: vacancies.hhVacancyId,
        hhArchived: vacancies.hhArchived,
      })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    // Чужая/несуществующая вакансия → 404 (тенант-изоляция).
    if (!vac || vac.companyId !== user.companyId) {
      return apiError("Вакансия не найдена", 404)
    }

    const linked = Boolean(vac.hhVacancyId)
    const archived = vac.hhArchived === true

    // hh не привязан — бейдж не рисуем, БД по failed не трогаем.
    if (!linked) {
      return apiSuccess({
        linked: false,
        archived: false,
        sendFailedRecent: 0,
        invalidVacancyRecent: 0,
        level: "none" as Level,
        message: "hh не подключён к вакансии",
      })
    }

    // Последние 24ч: failed-отправки этой вакансии по каналу hh.
    // follow_up_messages нет vacancy_id → join через candidates.vacancy_id.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [failedRow] = await db
      .select({
        total: count(),
        invalid: sql<number>`count(*) FILTER (WHERE ${followUpMessages.errorMessage} ILIKE ${"%invalid_vacancy%"})`.mapWith(Number),
      })
      .from(followUpMessages)
      .innerJoin(candidates, eq(followUpMessages.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.vacancyId, vacancyId),
          eq(followUpMessages.channel, "hh"),
          eq(followUpMessages.status, "failed"),
          gte(followUpMessages.createdAt, since),
        ),
      )

    const sendFailedRecent = Number(failedRow?.total ?? 0)
    const invalidVacancyRecent = Number(failedRow?.invalid ?? 0)

    let level: Level
    let message: string
    // Порядок важен: сначала АНОМАЛИЯ (hh активно блокирует переписку), потом
    // штатный конец жизни (архив). Архив НЕ красный (Юрий 15.07): любая
    // hh-вакансия уходит в архив через ~30 дней — это нормальный жизненный цикл,
    // а не поломка. Красный на каждой вакансии старше месяца превращается в
    // обои, которые перестают читать, и настоящая ошибка (invalid_vacancy)
    // теряется в шуме. Последствие архива (сообщения не уходят) остаётся —
    // но янтарным, текст тултипа не меняем.
    if (invalidVacancyRecent > 0) {
      level = "error"
      message = "hh блокирует переписку по вакансии — сообщения не доходят"
    } else if (archived) {
      level = "warn"
      message = "Вакансия в архиве hh — сообщения кандидатам не отправляются"
    } else if (sendFailedRecent > 0) {
      level = "warn"
      message = "hh: часть сообщений не доходит"
    } else {
      level = "ok"
      message = "hh: активна, всё ок"
    }

    return apiSuccess({
      linked,
      archived,
      sendFailedRecent,
      invalidVacancyRecent,
      level,
      message,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET hh-status]", err)
    return apiError("Internal server error", 500)
  }
}
