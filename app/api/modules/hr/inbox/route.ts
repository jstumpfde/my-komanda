// GET /api/modules/hr/inbox
// Кросс-вакансионный список тредов переписки для глобального виджета «Чаты»
// (плавающая кнопка внизу справа, эталон — чаты hh.ru).
//
// Отдаёт по одному треду на каждого кандидата КОМПАНИИ, у которого есть строка
// hh_responses (localCandidateId = candidate.id). Превью последнего сообщения и
// счётчик «непрочитано» вычисляются из hh_responses.messagesCache (тот же
// нормализованный кэш, что у пер-вакансионного инбокса #62,
// app/api/modules/hr/vacancies/[id]/inbox) — hh API отсюда НЕ дёргаем.
//
// Параметры:
//   ?vacancyId=<uuid> — ограничить одной вакансией (таб «Инбокс» на вакансии
//   рендерит тот же компонент с этим параметром).
//
// Тенант-изоляция: requireCompany + JOIN vacancies по companyId (кандидаты
// только своих вакансий) + скоуп hh_responses по companyId — вторая линия.
import { NextRequest } from "next/server"
import { and, eq, isNull, isNotNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getStageLabel } from "@/lib/stages"

export const dynamic = "force-dynamic"

// Форма нормализованного сообщения в messagesCache (см.
// app/api/integrations/hh/messages/[hhResponseId] — NormalizedMessage).
interface CachedMessage {
  id?: string
  text?: string | null
  authorType?: string | null
  createdAt?: string | null
  viewedByMe?: boolean
  viewedByOpponent?: boolean
}

export interface GlobalInboxThread {
  candidateId: string
  hhResponseId: string
  name: string
  photoUrl: string | null
  resumeUrl: string | null
  vacancyId: string
  vacancyTitle: string
  vacancyCity: string | null
  stage: string | null
  stageLabel: string
  lastMessage: {
    text: string
    from: "applicant" | "employer"
    at: string | null
  } | null
  // Число «хвостовых» входящих от кандидата, на которые HR ещё не ответил
  // (0 = прочитано/отвечено). Та же логика, что бейдж «новое» в инбоксе #62,
  // но со счётчиком для синего бейджа в стиле hh.
  unreadCount: number
}

function tsOf(m: CachedMessage): number {
  return m?.createdAt ? Date.parse(m.createdAt) || 0 : 0
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancyId")

    // Кросс-вакансионный режим (без vacancyId) открыт всем HR (Юрий 03.07 —
    // «открыть всё что есть»). Защита от тяжёлых тенантов: берём только
    // отклики с реальной перепиской (messagesCache непустой) и с лимитом —
    // треды без сообщений в инбоксе не нужны.

    const conditions = [
      eq(vacancies.companyId, user.companyId),
      // Вакансии из корзины в чатах не показываем.
      isNull(vacancies.deletedAt),
    ]
    if (vacancyId) conditions.push(eq(candidates.vacancyId, vacancyId))
    // Кросс-режим: только отклики с сохранённой перепиской (иначе тянули бы
    // всех hh-кандидатов компании в память).
    else conditions.push(isNotNull(hhResponses.messagesCache))

    const rows = await db
      .select({
        candidateId: candidates.id,
        name: candidates.name,
        stage: candidates.stage,
        photoUrl: candidates.photoUrl,
        vacancyId: vacancies.id,
        vacancyTitle: vacancies.title,
        vacancyCity: vacancies.city,
        hhResponseId: hhResponses.hhResponseId,
        resumeUrl: hhResponses.resumeUrl,
        messagesCache: hhResponses.messagesCache,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .innerJoin(
        hhResponses,
        and(
          eq(hhResponses.localCandidateId, candidates.id),
          eq(hhResponses.companyId, user.companyId),
        ),
      )
      .where(and(...conditions))
      // Свежие сверху; потолок 800 тредов — защита от подвисания у крупных.
      .orderBy(desc(hhResponses.syncedAt))
      .limit(vacancyId ? 2000 : 800)

    const threads: GlobalInboxThread[] = rows.map((r) => {
      const cache = Array.isArray(r.messagesCache) ? (r.messagesCache as CachedMessage[]) : []
      // Хронологический порядок в кэше уже старые→новые, но не полагаемся на это.
      const sorted = [...cache].sort((a, b) => tsOf(a) - tsOf(b))
      const last = sorted.length > 0 ? sorted[sorted.length - 1] : null

      // «Непрочитано» = хвост сообщений от кандидата (applicant) после
      // последнего исходящего (employer). HR ещё не ответил на входящее.
      let unreadCount = 0
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].authorType === "applicant") unreadCount++
        else break
      }

      let lastMessage: GlobalInboxThread["lastMessage"] = null
      if (last) {
        const rawText = typeof last.text === "string" ? last.text : ""
        const trimmed = rawText.length > 120 ? rawText.slice(0, 120).trimEnd() + "…" : rawText
        lastMessage = {
          text: trimmed,
          from: last.authorType === "employer" ? "employer" : "applicant",
          at: last.createdAt ?? null,
        }
      }

      return {
        candidateId: r.candidateId,
        hhResponseId: r.hhResponseId,
        name: r.name,
        photoUrl: r.photoUrl ?? null,
        resumeUrl: r.resumeUrl ?? null,
        vacancyId: r.vacancyId,
        vacancyTitle: r.vacancyTitle,
        vacancyCity: r.vacancyCity ?? null,
        stage: r.stage ?? null,
        stageLabel: getStageLabel(r.stage),
        lastMessage,
        unreadCount,
      }
    })

    // Сортировка: треды с сообщениями по времени последнего DESC, пустые — в конец.
    threads.sort((a, b) => {
      const ta = a.lastMessage?.at ? Date.parse(a.lastMessage.at) || 0 : 0
      const tb = b.lastMessage?.at ? Date.parse(b.lastMessage.at) || 0 : 0
      if (ta === 0 && tb === 0) return a.name.localeCompare(b.name, "ru")
      return tb - ta
    })

    // Для красного бейджа плавающей кнопки: сколько ТРЕДОВ ждут ответа.
    const totalUnread = threads.reduce((n, t) => n + (t.unreadCount > 0 ? 1 : 0), 0)

    return apiSuccess({ threads, totalUnread })
  } catch (err) {
    // requireCompany бросает готовый NextResponse при 401/403.
    if (err instanceof Response) return err
    console.error("[hr/global-inbox] failed", err instanceof Error ? err.message : err)
    return apiError("Не удалось загрузить чаты", 500)
  }
}
