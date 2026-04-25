import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState } from "@/lib/hh-api"

const stopFlags = new Map<string, boolean>()

const DEMO_INVITE_MESSAGE = "Здравствуйте! Спасибо за отклик. Мы подготовили короткую демонстрацию должности — 15 минут, и вы узнаете всё о задачах, команде и доходе. Перейдите по ссылке: https://company24.pro/demo/invite"

const SOFT_REJECT_MESSAGE = "Здравствуйте! Спасибо за интерес к нашей вакансии. К сожалению, на данный момент ваш опыт не совсем подходит под наши требования. Желаем удачи в поиске!"

const PROXY_URL = process.env.CLAUDE_PROXY_URL || "https://claude-proxy.jstumpf-de.workers.dev"

async function aiScoreCandidate(resumeTitle: string | null, vacancyTitle: string | null): Promise<{ score: number; reason: string }> {
  if (!resumeTitle || !vacancyTitle) return { score: 50, reason: "Недостаточно данных" }
  const prompt = `Оцени насколько резюме "${resumeTitle}" подходит под вакансию "${vacancyTitle}". Верни ТОЛЬКО JSON {"score": <0-100>, "reason": "<кратко>"}.`
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    const text = data?.content?.[0]?.text || ""
    const m = text.match(/\{[\s\S]*?\}/)
    if (!m) throw new Error("no JSON")
    const parsed = JSON.parse(m[0])
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 50)),
      reason: String(parsed.reason || "").slice(0, 200),
    }
  } catch {
    const title = resumeTitle.toLowerCase()
    const words = vacancyTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const matched = words.filter(w => title.includes(w)).length
    return {
      score: matched > 0 ? Math.min(85, 55 + matched * 10) : 45,
      reason: `Keyword-fallback: ${matched} совпадений`,
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId
  const body = await req.json().catch(() => ({}))
  console.log("[PQ] start", { companyId, body })
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 50)
  const dryRun = !!body.dryRun
  const localVacancyId: string | undefined = body.vacancyId

  const tokenResult = await getValidToken(companyId)
  if (!tokenResult) return NextResponse.json({ error: "hh.ru не подключён" }, { status: 400 })

  // Если указана локальная вакансия — точный фильтр через vacancies.hh_vacancy_id
  let hhVacancyFilter: string | null = null
  if (localVacancyId) {
    const [localVac] = await db
      .select({ hhVacancyId: vacancies.hhVacancyId })
      .from(vacancies)
      .where(and(eq(vacancies.id, localVacancyId), eq(vacancies.companyId, companyId)))
      .limit(1)
    if (!localVac?.hhVacancyId) {
      return NextResponse.json({
        error: "Вакансия не привязана к hh.ru. Сначала установите связь в карточке вакансии."
      }, { status: 400 })
    }
    hhVacancyFilter = localVac.hhVacancyId
  }

  const newResponses = await db
    .select()
    .from(hhResponses)
    .where(
      hhVacancyFilter
        ? and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response"), eq(hhResponses.hhVacancyId, hhVacancyFilter))
        : and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response"))
    )
    .limit(limit)

  console.log("[PQ] filter result", { localVacancyId, hhVacancyFilter, newResponses: newResponses.length })
  if (newResponses.length === 0) {
    return NextResponse.json({ processed: 0, message: "Нет новых откликов" })
  }

  const vacancyTitles = new Map<string, string>()
  for (const r of newResponses) {
    if (!vacancyTitles.has(r.hhVacancyId)) {
      const raw = r.rawData as { vacancy?: { name?: string } } | null
      if (raw?.vacancy?.name) vacancyTitles.set(r.hhVacancyId, raw.vacancy.name)
    }
  }

  const localVacancies = await db.select().from(vacancies).where(and(eq(vacancies.companyId, companyId), isNull(vacancies.deletedAt)))
  stopFlags.set(companyId, false)

  const results: Array<{ id: string; name: string | null; action: string; score?: number; reason?: string; error?: string }> = []

  for (const resp of newResponses) {
    if (stopFlags.get(companyId)) {
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "stopped" })
      break
    }
    const vacancyTitle = vacancyTitles.get(resp.hhVacancyId) || null
    const { score, reason } = await aiScoreCandidate(resp.resumeTitle, vacancyTitle)
    console.log("[PQ] candidate", { name: resp.candidateName, title: resp.resumeTitle, score, reason })
    const threshold = localVacancies.find(v=>v.hhVacancyId===resp.hhVacancyId)?.hhScoreThreshold ?? 20
    const action = score >= threshold ? "invitation" : "discard"
    const message = action === "invitation" ? DEMO_INVITE_MESSAGE : SOFT_REJECT_MESSAGE
    const newStatus = action === "invitation" ? "invited" : "discarded"

    if (dryRun) {
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: `dry:${action}`, score, reason })
      continue
    }

    try {
      // Находим локальную вакансию
      const localVac = localVacancies.find(v => v.hhVacancyId === resp.hhVacancyId) || null

      // Для приглашений: СНАЧАЛА создаём кандидата (чтобы получить token), потом формируем сообщение
      let candidateToken: string | null = null
      let candidateId: string | null = null
      if (action === "invitation" && localVac && !resp.localCandidateId) {
        candidateToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
        const [newCand] = await db.insert(candidates).values({
          vacancyId: localVac.id,
          name: resp.candidateName || "Кандидат с hh.ru",
          phone: resp.candidatePhone,
          email: resp.candidateEmail,
          source: "hh",
          stage: "new",
          score: Math.round(score),
          token: candidateToken,
        }).returning()
        if (newCand) candidateId = newCand.id
      }

      // Формируем сообщение из шаблона вакансии с подстановкой переменных
      let finalMessage = message
      if (action === "invitation" && localVac) {
        const descJson = localVac.descriptionJson as { automation?: { firstMessageText?: string } } | null
        const template = descJson?.automation?.firstMessageText
        if (template && candidateToken) {
          const nameParts = (resp.candidateName || "").trim().split(/\s+/)
          const candidateName = nameParts[1] || nameParts[0] || "Здравствуйте"
          const demoUrl = `https://company24.pro/demo/${candidateToken}`
          finalMessage = template
            .replaceAll("[Имя]", candidateName)
            .replaceAll("[имя]", candidateName)
            .replaceAll("[должность]", localVac.title || "")
            .replaceAll("[компания]", "Company24")
            .replaceAll("[ссылка]", demoUrl)
        }
      }

      const rawResume = (resp.rawData as { resume?: { id?: string } } | null)?.resume?.id
      try {
        await changeNegotiationState(tokenResult.accessToken, resp.hhResponseId, action, finalMessage, resp.hhVacancyId, rawResume)
      } catch (hhErr) {
        const msg = hhErr instanceof Error ? hhErr.message : String(hhErr)
        if (msg.includes("already_applied")) {
          console.log("[PQ] already_applied — продолжаем", resp.candidateName)
        } else { throw hhErr }
      }
      await db.update(hhResponses).set({ status: newStatus }).where(eq(hhResponses.id, resp.id))
      if (candidateId) {
        await db.update(hhResponses).set({ localCandidateId: candidateId }).where(eq(hhResponses.id, resp.id))
      }

      results.push({ id: resp.hhResponseId, name: resp.candidateName, action, score, reason })
    } catch (err: unknown) {
      console.error("[PQ] FAIL", resp.candidateName, err instanceof Error ? err.message : err)
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "failed", error: err instanceof Error ? err.message : String(err) })
    }
    await new Promise(r => setTimeout(r, 500))
  }

  stopFlags.delete(companyId)
  return NextResponse.json({ processed: results.length, results })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  stopFlags.set(session.user.companyId, true)
  return NextResponse.json({ stopped: true })
}
