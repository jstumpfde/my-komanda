import { NextRequest } from "next/server"
import { eq, and, inArray, desc, isNull, isNotNull, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { DEFAULT_SCHEDULE_INVITE_TEXT } from "@/lib/messaging/schedule-invite"
import { candidates, vacancies, demos, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getVacancyLifecycle } from "@/lib/vacancies/lifecycle"
import { deriveCandidateName } from "@/lib/candidate-name"
import { pickGivenName } from "@/lib/messaging/candidate-name"
import { getLearnedNamesSet } from "@/lib/messaging/learned-given-names"
import { DEFAULT_TEST_INVITE_TEXT } from "@/lib/messaging/test-invite"
import { nanoid } from "nanoid"

// POST /api/modules/hr/vacancies/[id]/hh-broadcast-data
// body: { candidateIds: string[] }
//
// Возвращает данные для полу-ручной рассылки через hh-чат:
// по каждому кандидату — chatId (из raw_data.chat_id), готовый chatUrl,
// resumeUrl (fallback) и персональное сообщение с подставленными плейсхолдерами.
//
// Кандидаты без chatId И без resumeUrl помечаются hasNoChat=true.
// Платформа НЕ шлёт через hh API — только готовит данные.

interface HhRawDataWithChat {
  chat_id?: string | number
  [key: string]: unknown
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Проверка принадлежности вакансии компании (tenant-изоляция)
    const [vac] = await db
      .select({ id: vacancies.id, title: vacancies.title, hhVacancyId: vacancies.hhVacancyId, scheduleInviteText: vacancies.scheduleInviteText })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

    // «др. вакансия»: активные вакансии этой же компании С hh-ссылкой, кроме
    // текущей (Юрий 03.07) — для варианта «переслать на другую вакансию».
    // Изоляция та же, что у остальных запросов роута — companyId из requireCompany().
    const otherVacRows = await db
      .select({ id: vacancies.id, title: vacancies.title, hhVacancyId: vacancies.hhVacancyId, status: vacancies.status })
      .from(vacancies)
      .where(and(
        eq(vacancies.companyId, user.companyId),
        isNull(vacancies.deletedAt),
        isNotNull(vacancies.hhVacancyId),
        ne(vacancies.id, id),
      ))
      .orderBy(desc(vacancies.createdAt))
    const otherVacancies = otherVacRows
      .filter((v) => !!v.hhVacancyId && getVacancyLifecycle(v.status) !== "closed")
      .map((v) => ({ id: v.id, title: v.title, hhVacancyId: v.hhVacancyId as string }))

    const body = (await req.json().catch(() => ({}))) as { candidateIds?: unknown }
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((x): x is string => typeof x === "string")
      : []
    if (candidateIds.length === 0) return apiError("Не выбраны кандидаты", 400)

    // Шаблон приглашения — из боевого теста вакансии или дефолт
    const [testDemoRow] = await db
      .select({ postDemoSettings: demos.postDemoSettings })
      .from(demos)
      .where(and(eq(demos.vacancyId, id), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)
    const inviteTpl =
      (testDemoRow?.postDemoSettings as { testInviteMessage?: string } | null)
        ?.testInviteMessage?.trim() || DEFAULT_TEST_INVITE_TEXT

    // Кандидаты (только из этой вакансии и компании — tenant-изоляция)
    const rows = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.vacancyId, id),
          inArray(candidates.id, candidateIds),
        ),
      )

    // Дозаполнение token=NULL — как в export-candidates
    for (const r of rows) {
      if (!r.token) {
        const newToken = nanoid(32)
        await db
          .update(candidates)
          .set({ token: newToken })
          .where(eq(candidates.id, r.id))
        r.token = newToken
      }
    }

    // hh данные: chatId, resumeUrl, name из hh_responses
    // orderBy desc(createdAt): у кандидата после перепубликации вакансии на hh
    // (новый id) может быть ДВА отклика — берём НОВЕЙШИЙ (первый в Map),
    // чтобы мастер открывал АКТУАЛЬНЫЙ чат, а не архивной вакансии, где hh
    // запрещает писать (Юрий 03.07).
    const hhRows = await db
      .select({
        candidateId: hhResponses.localCandidateId,
        resumeUrl: hhResponses.resumeUrl,
        candidateName: hhResponses.candidateName,
        rawData: hhResponses.rawData,
      })
      .from(hhResponses)
      .where(
        and(
          eq(hhResponses.companyId, user.companyId),
          inArray(hhResponses.localCandidateId, candidateIds),
        ),
      )
      .orderBy(desc(hhResponses.createdAt))

    const hhByCandidate = new Map<
      string,
      { resumeUrl: string | null; name: string | null; chatId: string | null; hhFirst: string | null; hhLast: string | null }
    >()
    for (const h of hhRows) {
      if (!h.candidateId || hhByCandidate.has(h.candidateId)) continue
      const raw = h.rawData as (HhRawDataWithChat & { resume?: { first_name?: string; last_name?: string }; first_name?: string }) | null
      const chatId = raw?.chat_id != null ? String(raw.chat_id) : null
      // hh отдаёт имя/фамилию РАЗДЕЛЬНО, НО кандидат мог вписать их наоборот
      // (first_name=«Макаренко»). Имя определит pickGivenName по словарю — здесь
      // только сохраняем оба поля.
      const hhFirst = (raw?.resume?.first_name ?? raw?.first_name ?? "").trim() || null
      const hhLast  = (raw?.resume?.last_name ?? "").trim() || null
      hhByCandidate.set(h.candidateId, {
        resumeUrl: h.resumeUrl ?? null,
        name: h.candidateName ?? null,
        chatId,
        hhFirst,
        hhLast,
      })
    }

    const learned = await getLearnedNamesSet()
    const result = rows.map((c) => {
      const hh = hhByCandidate.get(c.id)
      const fullName = deriveCandidateName(c.name, c.anketaAnswers, hh?.name ?? null)
      // Имя через единый резолвер: словарь имён, устойчив к перепутанным полям hh.
      const firstName = pickGivenName({ hhFirst: hh?.hhFirst, hhLast: hh?.hhLast, fullName, learned })

      const testSlug = c.shortId ?? c.token
      const testLink = testSlug ? `https://company24.pro/test/${testSlug}` : ""

      const personalMessage = inviteTpl
        .replaceAll("{{name}}", firstName)
        .replaceAll("{{vacancy}}", vac.title || "")
        .replaceAll("{{test_link}}", testLink)
        .replaceAll("{{company}}", "")

      const chatId = hh?.chatId ?? null
      const resumeUrl = hh?.resumeUrl ?? null
      // resume_url (с ?t={negotiationId}) — НАДЁЖНО открывается и ведёт в контекст
      // отклика, где чат на один клик. Прямой chat.hh.ru/chat/{id} не открывался,
      // поэтому основной URL = resumeUrl (Юрий подтвердил, что он работает).
      const chatUrl = resumeUrl
      const hasNoChat = !chatUrl

      return {
        id: c.id,
        name: fullName,
        firstName,
        chatId,
        chatUrl,
        resumeUrl,
        hasNoChat,
        personalMessage,
        // Ссылка на тест, которую получит кандидат — показываем отдельной строкой
        // (чтобы HR видел, что прикреплено) и используем для обратной подстановки
        // {{test_link}} при сохранении шаблона.
        testLink,
        // «Демо 2»: кандидату уже открыта 2-я часть демо (override_content_block_id
        // проставлен) — иначе ссылка ведёт на ту же 1-ю часть, что и «Демо 1»,
        // и чип нужно дизейблить (Юрий 03.07).
        hasSecondDemo: !!c.overrideContentBlockId,
      }
    })

    // Возвращаем в том же порядке, что запросили
    const ordered = candidateIds
      .map((cid) => result.find((r) => r.id === cid))
      .filter((r): r is NonNullable<typeof r> => !!r)

    // vacancyHhUrl — ссылка на саму вакансию hh (для варианта «Вакансия» в
    // рассылке: у вакансии своя ссылка, персональная не нужна).
    const vacancyHhUrl = vac.hhVacancyId ? `https://hh.ru/vacancy/${vac.hhVacancyId}` : null
    // Текст приглашения на интервью для варианта «Интервью» в мастере:
    // настройка вакансии, пусто → платформенный дефолт.
    const scheduleInviteText = (vac.scheduleInviteText ?? "").trim() || DEFAULT_SCHEDULE_INVITE_TEXT
    return apiSuccess({ items: ordered, vacancyTitle: vac.title, vacancyHhUrl, scheduleInviteText, otherVacancies })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-broadcast-data]", err)
    return apiError("Internal server error", 500)
  }
}
