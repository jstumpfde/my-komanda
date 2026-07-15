// GET /api/modules/hr/vacancies/[id]/hh-status
//
// Лёгкий индикатор состояния hh-привязки вакансии для бейджа в шапке.
// НЕ дёргает hh API — читает ТОЛЬКО БД (быстро):
//   • vacancies.hhVacancyId + vacancies.hhArchived
//   • follow_up_messages за последние 24ч (канал 'hh'): считаем одним проходом
//     failed, из них error_message LIKE '%invalid_vacancy%', и успешные sent —
//     успехи нужны, чтобы отличить «переписка встала» от «пара отказов на фоне
//     нормальной отправки».
//
// Тенант-изоляция: requireCompany() + проверка vacancies.companyId; чужая
// вакансия → 404 (не 403 — не палим существование).
//
// Ответ: { linked, archived, sendFailedRecent, invalidVacancyRecent, sentRecent,
//          level: 'ok'|'warn'|'error'|'none', message }
//   level:
//     none  — hh не привязан (нет hhVacancyId) → бейдж не показываем
//     error — invalid_vacancy за 24ч И НИ ОДНОГО успешного sent за то же окно
//             (переписка встала целиком = настоящая авария)
//     warn  — hhArchived (штатный конец жизни, ~30 дн) ИЛИ invalid_vacancy на
//             фоне доходящих сообщений ИЛИ обычные failed за 24ч
//     ok    — привязан, не архив, отправки идут
import { NextRequest } from "next/server"
import { and, eq, gte, sql } from "drizzle-orm"
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
        sentRecent: 0,
        level: "none" as Level,
        message: "hh не подключён к вакансии",
      })
    }

    // Последние 24ч: failed-отправки этой вакансии по каналу hh.
    // follow_up_messages нет vacancy_id → join через candidates.vacancy_id.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Считаем И неудачи, И успехи за окно одним проходом: сам факт пары
    // invalid_vacancy ничего не значит, если параллельно сообщения доходят —
    // красный имеет смысл только когда переписка встала ЦЕЛИКОМ (см. ниже).
    const [row] = await db
      .select({
        failed: sql<number>`count(*) FILTER (WHERE ${followUpMessages.status} = 'failed')`.mapWith(Number),
        invalid: sql<number>`count(*) FILTER (WHERE ${followUpMessages.status} = 'failed' AND ${followUpMessages.errorMessage} ILIKE ${"%invalid_vacancy%"})`.mapWith(Number),
        sent: sql<number>`count(*) FILTER (WHERE ${followUpMessages.status} = 'sent')`.mapWith(Number),
      })
      .from(followUpMessages)
      .innerJoin(candidates, eq(followUpMessages.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.vacancyId, vacancyId),
          eq(followUpMessages.channel, "hh"),
          gte(followUpMessages.createdAt, since),
        ),
      )

    const sendFailedRecent = Number(row?.failed ?? 0)
    const invalidVacancyRecent = Number(row?.invalid ?? 0)
    const sentRecent = Number(row?.sent ?? 0)

    let level: Level
    let message: string
    // Красный = «всё встало, иди чини». Два прежних повода были ложными
    // тревогами (Юрий 15.07):
    //  • hhArchived: в архив hh уходит ЛЮБАЯ вакансия через ~30 дней — штатный
    //    конец жизни, не поломка.
    //  • invalid_vacancy >= 1: пара отказов на фоне сотни дошедших сообщений
    //    красила вакансию красным на сутки с текстом «сообщения не доходят»,
    //    хотя они доходят. Красный на каждой второй вакансии = обои, в которых
    //    теряется настоящая авария.
    // Теперь красный только когда переписка встала ЦЕЛИКОМ: есть отказы
    // invalid_vacancy И при этом за окно не ушло НИ ОДНОГО сообщения.
    if (invalidVacancyRecent > 0 && sentRecent === 0) {
      level = "error"
      message = "hh блокирует переписку по вакансии — сообщения не доходят"
    } else if (archived) {
      level = "warn"
      message = "Вакансия в архиве hh — сообщения кандидатам не отправляются"
    } else if (invalidVacancyRecent > 0) {
      level = "warn"
      message = `hh отклонил ${invalidVacancyRecent} сообщ. за сутки, остальные доходят (${sentRecent} успешных)`
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
      sentRecent,
      level,
      message,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET hh-status]", err)
    return apiError("Internal server error", 500)
  }
}
