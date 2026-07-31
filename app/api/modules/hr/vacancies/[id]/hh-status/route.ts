// GET /api/modules/hr/vacancies/[id]/hh-status
//
// Лёгкий индикатор состояния hh-привязки вакансии для бейджа в шапке.
// НЕ дёргает hh API — читает ТОЛЬКО БД (быстро):
//   • vacancies.hhVacancyId + vacancies.hhArchived
//   • follow_up_messages за последние 24ч (канал 'hh'): одним проходом считаем
//     failed, из них invalid_vacancy, и успешные sent — успехи нужны, чтобы
//     отличить «переписка встала» от «пара отказов на фоне нормальной отправки».
//     ВАЖНО: кандидаты с АРХИВНОЙ hh-публикации в статистику НЕ попадают вовсе
//     (см. notOnArchivedBranch ниже) — бейдж про здоровье ЖИВОЙ публикации.
//
// Тенант-изоляция: requireCompany() + проверка vacancies.companyId; чужая
// вакансия → 404 (не 403 — не палим существование).
//
// Ответ: { linked, archived, sendFailedRecent, invalidVacancyRecent, sentRecent,
//          level: 'ok'|'warn'|'error'|'none', message }
//   level (считается ТОЛЬКО по живой публикации):
//     none  — hh не привязан (нет hhVacancyId) → бейдж не показываем
//     error — были попытки, но НЕ ушло НИ ОДНОГО сообщения (hh нас не пускает)
//     warn  — hhArchived (текущая публикация в архиве) ИЛИ доля отказов значима
//             (>= 3 штук И >= 20% попыток)
//     ok    — отправки идут; единичные персональные отказы (resume_not_found,
//             кандидат снёс резюме) — шум, не тревога
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

    // СТАРЫЕ ВЕТКИ НЕ УЧИТЫВАЕМ (Юрий 15.07). Вакансию публикуют на hh не один
    // раз: предыдущая публикация уходит в архив, но её кандидаты продолжают
    // жить в той же локальной вакансии. hh физически НЕ принимает сообщения в
    // переписки архивной публикации — отвечает 403 invalid_vacancy. Это не
    // поломка и кодом не чинится, а работа по той ветке уже закрыта («кому
    // можно было — уже пригласили»). Поэтому кандидатов, чей hh-отклик
    // принадлежит АРХИВНОЙ публикации, из статистики бейджа исключаем целиком:
    // бейдж должен показывать здоровье ЖИВОЙ публикации, а не мёртвой истории.
    // Живой пример (15.07): по архивной ветке 59 отказов за неделю, по живой —
    // 3 на 257 доставленных.
    const notOnArchivedBranch = sql`NOT EXISTS (
      SELECT 1 FROM hh_responses hr
      JOIN hh_vacancies hv
        ON hv.hh_vacancy_id = hr.hh_vacancy_id AND hv.company_id = hr.company_id
      WHERE hr.local_candidate_id = ${candidates.id} AND hv.status = 'archived'
    )`

    // Считаем И неудачи, И успехи за окно одним проходом: сам факт отказа
    // ничего не значит, если параллельно сообщения доходят.
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
          notOnArchivedBranch,
        ),
      )

    const sendFailedRecent = Number(row?.failed ?? 0)
    const invalidVacancyRecent = Number(row?.invalid ?? 0)
    const sentRecent = Number(row?.sent ?? 0)

    let level: Level
    let message: string
    // Бейдж отвечает на ОДИН вопрос: «работает ли hh по этой вакансии сейчас».
    // Он НЕ трекер судьбы отдельных кандидатов. Прежние пороги врали (Юрий,
    // 15.07, три захода подряд):
    //  • hhArchived → красный: в архив уходит ЛЮБАЯ вакансия через ~30 дней —
    //    штатный конец жизни, не поломка.
    //  • invalid_vacancy >= 1 → красный: 12 отказов при 75 доставленных красили
    //    вакансию красным с текстом «сообщения не доходят», хотя они доходят.
    //  • failed >= 1 → жёлтый: ОДИН персональный отказ (resume_not_found —
    //    кандидат снёс резюме) при 69 доставленных красил вакансию жёлтым.
    // Красный на каждой второй вакансии = обои, в которых теряется настоящая
    // авария. Поэтому: единичные персональные отказы — шум, тревога только на
    // значимой доле или когда не уходит вообще ничего.
    const attempts = sendFailedRecent + sentRecent
    const NOISE_MIN_FAILURES = 3   // меньше — статистически неотличимо от шума
    const NOISE_MIN_SHARE = 0.2    // и при этом заметная доля попыток
    if (attempts > 0 && sentRecent === 0) {
      level = "error"
      message = "hh не принимает сообщения по этой вакансии — не доходит ни одно"
    } else if (archived) {
      level = "warn"
      message = "Вакансия в архиве hh — сообщения кандидатам не отправляются"
    } else if (
      sendFailedRecent >= NOISE_MIN_FAILURES &&
      sendFailedRecent / attempts >= NOISE_MIN_SHARE
    ) {
      level = "warn"
      message = `hh: не доходит ${sendFailedRecent} из ${attempts} сообщений за сутки`
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
