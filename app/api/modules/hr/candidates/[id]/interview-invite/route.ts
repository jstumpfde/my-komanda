// GET /api/modules/hr/candidates/[id]/interview-invite
//
// Данные для диалога «Пригласить на интервью» в карточке кандидата (#30/#31):
//   - scheduleInviteText — настроенный per-вакансия шаблон приглашения
//     (vacancies.schedule_invite_text); пусто → дефолт.
//   - defaultText        — платформенный дефолт (DEFAULT_SCHEDULE_INVITE_TEXT).
//   - scheduleLink       — персональная ссылка кандидата на самозапись
//     (Режим А). Формат совпадает с cron follow-up (shortId ?? token ?? id).
//   - days               — доступные слоты интервью из окон вакансии
//     (Режим Б: HR выбирает 2-3 конкретных времени). Переиспользуем
//     fetchScheduleData (та же логика, что на публичной /schedule/[token]).
//   - vacancyTitle, candidateFirstName — для подстановки {{name}}/{{vacancy}}
//     в превью на клиенте.
//   - companyName, managerName, demoUrl, testUrl — значения {{company}}/
//     {{manager}}/{{demo_link}}/{{test_link}} с теми же формулами и фолбэками,
//     что в cron follow-up: реальная отправка подставляет их, поэтому превью
//     обязано знать те же значения, иначе HR видит литерал «{{company}}».

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies, users } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { DEFAULT_SCHEDULE_INVITE_TEXT } from "@/lib/messaging/schedule-invite"
import { fetchScheduleData } from "@/app/(public)/schedule/[token]/schedule-data"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Кандидат (с проверкой принадлежности компании) + вакансия.
    const [row] = await db
      .select({
        candidateId:   candidates.id,
        shortId:       candidates.shortId,
        token:         candidates.token,
        vacancyId:     candidates.vacancyId,
        vacancyTitle:      vacancies.title,
        scheduleInviteText: vacancies.scheduleInviteText,
        companyId:     vacancies.companyId,
        createdBy:     vacancies.createdBy,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) return apiError("Candidate not found", 404)

    const tokenForUrl = row.shortId ?? row.token ?? row.candidateId
    const scheduleLink = `${getAppBaseUrl()}/schedule/${tokenForUrl}`
    // Формулы 1:1 из cron follow-up (обычное касание, без спецкейса «2-й части
    // демо») — превью обязано совпадать с тем, что реально уйдёт кандидату.
    const demoUrl = `${getAppBaseUrl()}/demo/${tokenForUrl}`
    const testUrl = `${getAppBaseUrl()}/test/${tokenForUrl}`

    const [companyRow] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, row.companyId))
      .limit(1)
    const companyName = companyRow?.name?.trim() || "Company24"

    let managerName = ""
    if (row.createdBy) {
      const [mgr] = await db
        .select({ firstName: users.firstName, name: users.name })
        .from(users)
        .where(eq(users.id, row.createdBy))
        .limit(1)
      managerName = (mgr?.firstName?.trim() || mgr?.name?.trim() || "")
    }

    // Слоты интервью (Режим Б). Переиспользуем публичный резолвер — он берёт
    // окна из hiring_defaults.schedule и исключает занятые события календаря.
    // Ошибку слотов не роняем: диалог откроется без Режима Б (только А).
    let days: { date: string; label: string; slots: string[] }[] = []
    let timezoneLabel = ""
    try {
      const scheduleToken = row.shortId ?? row.token
      if (scheduleToken) {
        const { data } = await fetchScheduleData(scheduleToken)
        if (data) {
          days = data.days
          timezoneLabel = data.timezoneLabel ?? ""
        }
      }
    } catch (err) {
      console.warn("[interview-invite] slots fetch failed:", err instanceof Error ? err.message : err)
    }

    const { firstName } = await getCandidateFirstName(row.candidateId)

    return apiSuccess({
      scheduleInviteText: row.scheduleInviteText ?? "",
      defaultText:        DEFAULT_SCHEDULE_INVITE_TEXT,
      scheduleLink,
      vacancyTitle:       row.vacancyTitle ?? "",
      candidateFirstName: firstName,
      companyName,
      managerName,
      demoUrl,
      testUrl,
      timezoneLabel,
      days,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[interview-invite GET]", err)
    return apiError("Internal server error", 500)
  }
}
