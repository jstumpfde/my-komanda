// GET /api/modules/hr/vacancies/[id]/inbox
// Список тредов переписки для «Единого чат-инбокса» вакансии.
//
// Отдаёт по одному треду на каждого кандидата ЭТОЙ вакансии, у которого есть
// строка hh_responses (localCandidateId = candidate.id). Превью последнего
// сообщения и флаг «непрочитано» ВЫЧИСЛЯЮТСЯ из hh_responses.messagesCache
// (нормализованный кэш переписки, обновляет крон/фетч drawer) — hh API отсюда
// НЕ дёргаем, список должен открываться быстро.
//
// Тенант-изоляция: скоуп по session.companyId + проверка владения вакансией
// (404, если вакансия чужая) — паттерн requireCompany, как в соседних
// modules/hr роутах.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
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

interface InboxThread {
  candidateId: string
  hhResponseId: string
  name: string
  stage: string | null
  stageLabel: string
  lastMessage: {
    text: string
    from: "applicant" | "employer"
    at: string | null
  } | null
  unread: boolean
}

function tsOf(m: CachedMessage): number {
  return m?.createdAt ? Date.parse(m.createdAt) || 0 : 0
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    // Проверка владения вакансией — чужая вакансия отдаёт 404.
    const [vac] = await db
      .select({ id: vacancies.id, companyId: vacancies.companyId })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (!vac || vac.companyId !== user.companyId) return apiError("Вакансия не найдена", 404)

    // Кандидаты этой вакансии, у которых есть hh-тред. JOIN по
    // hh_responses.localCandidateId. Скоуп hh_responses по companyId — вторая
    // линия тенант-изоляции (кроме vacancyId кандидата).
    const rows = await db
      .select({
        candidateId: candidates.id,
        name: candidates.name,
        stage: candidates.stage,
        hhResponseId: hhResponses.hhResponseId,
        messagesCache: hhResponses.messagesCache,
      })
      .from(candidates)
      .innerJoin(
        hhResponses,
        and(
          eq(hhResponses.localCandidateId, candidates.id),
          eq(hhResponses.companyId, user.companyId),
        ),
      )
      .where(eq(candidates.vacancyId, vacancyId))

    const threads: InboxThread[] = rows.map((r) => {
      const cache = Array.isArray(r.messagesCache) ? (r.messagesCache as CachedMessage[]) : []
      // Хронологический порядок в кэше уже старые→новые, но не полагаемся на это.
      const sorted = [...cache].sort((a, b) => tsOf(a) - tsOf(b))
      const last = sorted.length > 0 ? sorted[sorted.length - 1] : null

      // «Непрочитано» = последнее сообщение от кандидата (applicant) и после него
      // не было исходящего (employer). Т.е. HR ещё не ответил на входящее.
      let unread = false
      if (last && last.authorType === "applicant") {
        unread = true
      }

      let lastMessage: InboxThread["lastMessage"] = null
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
        stage: r.stage ?? null,
        stageLabel: getStageLabel(r.stage),
        lastMessage,
        unread,
      }
    })

    // Сортировка: сначала треды с сообщениями по времени последнего DESC,
    // затем без превью (пустой кэш) — в конце списка.
    threads.sort((a, b) => {
      const ta = a.lastMessage?.at ? Date.parse(a.lastMessage.at) || 0 : 0
      const tb = b.lastMessage?.at ? Date.parse(b.lastMessage.at) || 0 : 0
      if (ta === 0 && tb === 0) return a.name.localeCompare(b.name, "ru")
      return tb - ta
    })

    return apiSuccess({ threads })
  } catch (err) {
    // requireCompany бросает готовый NextResponse при 401/403.
    if (err instanceof Response) return err
    console.error("[hr/inbox] failed", err instanceof Error ? err.message : err)
    return apiError("Не удалось загрузить инбокс", 500)
  }
}
