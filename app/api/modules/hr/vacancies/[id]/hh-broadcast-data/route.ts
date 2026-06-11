import { NextRequest } from "next/server"
import { eq, and, inArray, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { deriveCandidateName } from "@/lib/candidate-name"
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
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

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

    const hhByCandidate = new Map<
      string,
      { resumeUrl: string | null; name: string | null; chatId: string | null }
    >()
    for (const h of hhRows) {
      if (!h.candidateId || hhByCandidate.has(h.candidateId)) continue
      const raw = h.rawData as HhRawDataWithChat | null
      const chatId = raw?.chat_id != null ? String(raw.chat_id) : null
      hhByCandidate.set(h.candidateId, {
        resumeUrl: h.resumeUrl ?? null,
        name: h.candidateName ?? null,
        chatId,
      })
    }

    const result = rows.map((c) => {
      const hh = hhByCandidate.get(c.id)
      const fullName = deriveCandidateName(c.name, c.anketaAnswers, hh?.name ?? null)
      const firstName = fullName.split(/\s+/)[0] || ""

      const testSlug = c.shortId ?? c.token
      const testLink = testSlug ? `https://company24.pro/test/${testSlug}` : ""

      const personalMessage = inviteTpl
        .replaceAll("{{name}}", firstName)
        .replaceAll("{{vacancy}}", vac.title || "")
        .replaceAll("{{test_link}}", testLink)
        .replaceAll("{{company}}", "")

      const chatId = hh?.chatId ?? null
      const resumeUrl = hh?.resumeUrl ?? null
      const chatUrl = chatId ? `https://chat.hh.ru/chat/${chatId}` : null
      const hasNoChat = !chatUrl && !resumeUrl

      return {
        id: c.id,
        name: fullName,
        chatId,
        chatUrl,
        resumeUrl,
        hasNoChat,
        personalMessage,
      }
    })

    // Возвращаем в том же порядке, что запросили
    const ordered = candidateIds
      .map((cid) => result.find((r) => r.id === cid))
      .filter((r): r is NonNullable<typeof r> => !!r)

    return apiSuccess({ items: ordered, vacancyTitle: vac.title })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-broadcast-data]", err)
    return apiError("Internal server error", 500)
  }
}
