import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState } from "@/lib/hh-api"
import { screenCandidate } from "@/lib/ai-screen-candidate"

const stopFlags = new Map<string, boolean>()

const DEMO_INVITE_MESSAGE = "Здравствуйте! Спасибо за отклик. Мы подготовили короткую демонстрацию должности — 15 минут, и вы узнаете всё о задачах, команде и доходе. Перейдите по ссылке: https://company24.pro/demo/invite"

const SOFT_REJECT_MESSAGE = "Здравствуйте! Спасибо за интерес к нашей вакансии. К сожалению, на данный момент ваш опыт не совсем подходит под наши требования. Желаем удачи в поиске!"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId
  const body = await req.json().catch(() => ({}))
  console.log("[PQ] start", { companyId, body })
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 50)
  const dryRun = !!body.dryRun
  const localVacancyId: string | undefined = body.vacancyId
  const reqDelaySeconds = body.delaySeconds != null ? Number(body.delaySeconds) : undefined
  const reqMinScore = body.minScore != null ? Number(body.minScore) : undefined

  const tokenResult = await getValidToken(companyId)
  if (!tokenResult) return NextResponse.json({ error: "hh.ru не подключён" }, { status: 400 })

  // Если указана локальная вакансия — точный фильтр через vacancies.hh_vacancy_id + загрузка её AI-настроек
  let hhVacancyFilter: string | null = null
  let scopedAiSettings: VacancyAiProcessSettings = {}
  if (localVacancyId) {
    const [localVac] = await db
      .select({
        hhVacancyId: vacancies.hhVacancyId,
        aiProcessSettings: vacancies.aiProcessSettings,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, localVacancyId), eq(vacancies.companyId, companyId)))
      .limit(1)
    if (!localVac?.hhVacancyId) {
      return NextResponse.json({
        error: "Вакансия не привязана к hh.ru. Сначала установите связь в карточке вакансии."
      }, { status: 400 })
    }
    hhVacancyFilter = localVac.hhVacancyId
    scopedAiSettings = (localVac.aiProcessSettings as VacancyAiProcessSettings | null) ?? {}
  }

  // Эффективные настройки прогона
  const effMinScore = Math.max(0, Math.min(100,
    reqMinScore ?? scopedAiSettings.minScore ?? 70
  ))
  const effDelayMs = Math.max(0, (reqDelaySeconds ?? 30) * 1000)
  const effInviteMsg = scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE
  const effRejectMsg = scopedAiSettings.rejectMessage?.trim() || SOFT_REJECT_MESSAGE
  const effBelowAction: "reject" | "keep_new" =
    scopedAiSettings.belowThresholdAction === "keep_new" ? "keep_new" : "reject"

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

  const localVacancies = await db.select().from(vacancies).where(and(eq(vacancies.companyId, companyId), isNull(vacancies.deletedAt)))
  stopFlags.set(companyId, false)

  // Карта остановленных кандидатов: skip auto-processing для них
  const linkedCandidateIds = newResponses
    .map(r => r.localCandidateId)
    .filter((v): v is string => !!v)
  const stoppedCandidateIds = new Set<string>()
  if (linkedCandidateIds.length > 0) {
    const stoppedRows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.autoProcessingStopped, true))
    for (const row of stoppedRows) {
      if (linkedCandidateIds.includes(row.id)) stoppedCandidateIds.add(row.id)
    }
  }

  const results: Array<{
    id: string
    name: string | null
    action: string
    score?: number
    verdict?: string
    error?: string
  }> = []
  let invitedCount = 0
  let rejectedCount = 0
  let keptCount = 0

  for (let idx = 0; idx < newResponses.length; idx++) {
    const resp = newResponses[idx]
    if (stopFlags.get(companyId)) {
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "stopped" })
      break
    }

    if (resp.localCandidateId && stoppedCandidateIds.has(resp.localCandidateId)) {
      console.log(`Skipping candidate ${resp.localCandidateId}: auto-processing stopped`)
      results.push({ id: resp.hhResponseId, name: resp.candidateName, action: "auto_stopped" })
      continue
    }

    const localVac = localVacancies.find(v => v.hhVacancyId === resp.hhVacancyId) || null

    // Извлекаем данные кандидата из rawData
    const raw = resp.rawData as {
      vacancy?: { name?: string }
      resume?: {
        id?: string
        title?: string
        skill_set?: string[]
        experience?: Array<{ company?: string; position?: string; description?: string; start?: string; end?: string }>
        total_experience?: { months?: number }
        area?: { name?: string }
        salary?: { amount?: number; currency?: string }
      }
    } | null

    const resume = raw?.resume ?? null
    const totalMonths = resume?.total_experience?.months
    const expYears = totalMonths != null ? Math.round((totalMonths / 12) * 10) / 10 : null
    const experienceLines = (resume?.experience ?? []).slice(0, 5).map(e => {
      const period = [e.start, e.end || "по н.в."].filter(Boolean).join(" — ")
      return `${e.position || ""} в ${e.company || ""} (${period}): ${e.description || ""}`.trim()
    })
    const resumeText = [
      resp.resumeTitle ? `Должность в резюме: ${resp.resumeTitle}` : null,
      expYears != null ? `Общий опыт: ${expYears} лет` : null,
      experienceLines.length > 0 ? "Опыт работы:\n" + experienceLines.join("\n") : null,
    ].filter(Boolean).join("\n")

    const salaryStr = resume?.salary?.amount
      ? `${resume.salary.amount} ${resume.salary.currency || "RUR"}`
      : undefined

    const candidateData = {
      name: resp.candidateName ?? "",
      resume: resumeText || resp.resumeTitle || "",
      experience: expYears != null ? `${expYears} лет` : undefined,
      skills: Array.isArray(resume?.skill_set) ? resume.skill_set : [],
      city: resume?.area?.name ?? undefined,
      salary: salaryStr,
    }

    // Извлекаем анкету вакансии из descriptionJson
    const dj = (localVac?.descriptionJson as Record<string, unknown> | null) ?? {}
    const an = (dj.anketa as Record<string, unknown> | null) ?? {}
    const vacancyAnketa = {
      vacancyTitle: localVac?.title ?? raw?.vacancy?.name ?? "",
      requirements: typeof an.requirements === "string" ? an.requirements : undefined,
      responsibilities: typeof an.responsibilities === "string" ? an.responsibilities : undefined,
      requiredSkills: Array.isArray(an.requiredSkills) ? an.requiredSkills.map(String) : undefined,
      desiredSkills: Array.isArray(an.desiredSkills) ? an.desiredSkills.map(String) : undefined,
      experienceMin: typeof an.experienceMin === "string" ? an.experienceMin : undefined,
      positionCity: typeof an.positionCity === "string" ? an.positionCity : (localVac?.city ?? undefined),
      aiIdealProfile: typeof an.aiIdealProfile === "string" ? an.aiIdealProfile : undefined,
      aiStopFactors: Array.isArray(an.aiStopFactors) ? an.aiStopFactors.map(String) : undefined,
      aiRequiredHardSkills: Array.isArray(an.aiRequiredHardSkills) ? an.aiRequiredHardSkills.map(String) : undefined,
      aiWeights: (an.aiWeights && typeof an.aiWeights === "object")
        ? (an.aiWeights as Record<string, string>) : undefined,
      aiMinExperience: typeof an.aiMinExperience === "string" ? an.aiMinExperience : undefined,
    }

    let screenResult
    try {
      screenResult = await screenCandidate({ candidateData, vacancyAnketa })
    } catch (err) {
      console.error("[PQ] screenCandidate failed for", resp.candidateName, err instanceof Error ? err.message : err)
      results.push({
        id: resp.hhResponseId,
        name: resp.candidateName,
        action: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
      // Пауза даже при ошибке — щадим hh и AI API
      if (idx < newResponses.length - 1) await sleep(effDelayMs)
      continue
    }

    console.log("[PQ] candidate", {
      name: resp.candidateName,
      score: screenResult.score,
      verdict: screenResult.verdict,
    })

    // Уважаем autoAction='review' от AI — оставляем кандидата в "Новый" для ручной проверки
    const aiSaysReview = screenResult.autoAction === "review" || screenResult.confidenceLevel === "low"
    const passes = screenResult.score >= effMinScore

    type Decision = "invite" | "reject" | "keep_new"
    let decision: Decision
    if (aiSaysReview) {
      decision = "keep_new"
    } else if (passes) {
      decision = "invite"
    } else {
      decision = effBelowAction === "reject" ? "reject" : "keep_new"
    }

    if (dryRun) {
      const dryAction = decision === "invite" ? "dry:invite"
        : decision === "reject" ? "dry:reject" : "dry:keep_new"
      results.push({
        id: resp.hhResponseId,
        name: resp.candidateName,
        action: dryAction,
        score: screenResult.score,
        verdict: screenResult.verdict,
      })
      if (decision === "invite") invitedCount++
      else if (decision === "reject") rejectedCount++
      else keptCount++
      if (idx < newResponses.length - 1) await sleep(effDelayMs)
      continue
    }

    const targetStage = decision === "invite" ? "demo" : decision === "reject" ? "rejected" : "new"
    const baseMessage = decision === "invite" ? effInviteMsg : decision === "reject" ? effRejectMsg : null
    const hhAction = decision === "invite" ? "invitation" : decision === "reject" ? "discard" : null
    const newStatus = decision === "invite" ? "invited" : decision === "reject" ? "discarded" : "kept"

    const aiDetails = {
      strengths: screenResult.strengths,
      weaknesses: screenResult.weaknesses,
      verdict: screenResult.verdict,
      autoAction: screenResult.autoAction,
      confidenceLevel: screenResult.confidenceLevel,
      manipulationDetected: screenResult.manipulationDetected,
    }

    try {
      // Сохраняем / создаём кандидата
      let candidateToken: string | null = null
      let candidateId: string | null = resp.localCandidateId ?? null

      // Fallback: если localCandidateId пуст — ищем существующего по email/phone/name,
      // чтобы не создавать дубликат (первичная синхронизация могла создать кандидата
      // раньше, чем hh_response успел привязаться).
      if (!candidateId && localVac) {
        if (resp.candidateEmail) {
          const [byEmail] = await db
            .select({ id: candidates.id })
            .from(candidates)
            .where(and(
              eq(candidates.vacancyId, localVac.id),
              eq(candidates.email, resp.candidateEmail)
            ))
            .limit(1)
          if (byEmail) candidateId = byEmail.id
        }
        if (!candidateId && resp.candidatePhone) {
          const [byPhone] = await db
            .select({ id: candidates.id })
            .from(candidates)
            .where(and(
              eq(candidates.vacancyId, localVac.id),
              eq(candidates.phone, resp.candidatePhone)
            ))
            .limit(1)
          if (byPhone) candidateId = byPhone.id
        }
        if (!candidateId && resp.candidateName) {
          const [byName] = await db
            .select({ id: candidates.id })
            .from(candidates)
            .where(and(
              eq(candidates.vacancyId, localVac.id),
              eq(candidates.name, resp.candidateName)
            ))
            .limit(1)
          if (byName) candidateId = byName.id
        }
        if (candidateId) {
          await db.update(hhResponses)
            .set({ localCandidateId: candidateId })
            .where(eq(hhResponses.id, resp.id))
          console.log("[PQ] linked existing candidate", resp.candidateName, "->", candidateId)
        }
      }

      if (!candidateId && localVac) {
        candidateToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
        const [newCand] = await db.insert(candidates).values({
          vacancyId: localVac.id,
          name: resp.candidateName || "Кандидат с hh.ru",
          phone: resp.candidatePhone,
          email: resp.candidateEmail,
          city: candidateData.city,
          source: "hh",
          stage: targetStage,
          score: Math.round(screenResult.score),
          aiScore: Math.round(screenResult.score),
          aiSummary: screenResult.recommendation,
          aiDetails,
          token: candidateToken,
          autoProcessingStopped: decision === "reject",
          autoProcessingStoppedReason: decision === "reject" ? "AI auto-reject" : null,
          autoProcessingStoppedAt: decision === "reject" ? new Date() : null,
        }).returning()
        if (newCand) candidateId = newCand.id
      } else if (candidateId) {
        // Кандидат уже существует — обновляем AI-данные и стадию
        await db.update(candidates).set({
          stage: targetStage,
          aiScore: Math.round(screenResult.score),
          aiSummary: screenResult.recommendation,
          aiDetails,
          updatedAt: new Date(),
          ...(decision === "reject" ? {
            autoProcessingStopped: true,
            autoProcessingStoppedReason: "AI auto-reject",
            autoProcessingStoppedAt: new Date(),
          } : {}),
        }).where(eq(candidates.id, candidateId))
      }

      // Формируем итоговое сообщение из шаблона вакансии (только для invite)
      let finalMessage: string | null = baseMessage
      if (decision === "invite" && localVac) {
        const automation = (dj as { automation?: { firstMessageText?: string } }).automation
        const template = automation?.firstMessageText
        if (template && (candidateToken || candidateId)) {
          const nameParts = (resp.candidateName || "").trim().split(/\s+/)
          const candidateName = nameParts[1] || nameParts[0] || "Здравствуйте"
          // Если токен новый — используем его, иначе нужен fetch (для простоты используем candidateId)
          const tokenForUrl = candidateToken || candidateId
          const demoUrl = `https://company24.pro/demo/${tokenForUrl}`
          finalMessage = template
            .replaceAll("[Имя]", candidateName)
            .replaceAll("[имя]", candidateName)
            .replaceAll("[должность]", localVac.title || "")
            .replaceAll("[компания]", "Company24")
            .replaceAll("[ссылка]", demoUrl)
        }
      }

      // Шлём действие в hh, если нужно
      if (hhAction && finalMessage) {
        const rawResume = (resp.rawData as { resume?: { id?: string } } | null)?.resume?.id
        try {
          await changeNegotiationState(
            tokenResult.accessToken,
            resp.hhResponseId,
            hhAction,
            finalMessage,
            resp.hhVacancyId,
            rawResume,
          )
        } catch (hhErr) {
          const msg = hhErr instanceof Error ? hhErr.message : String(hhErr)
          if (msg.includes("already_applied")) {
            console.log("[PQ] already_applied — продолжаем", resp.candidateName)
          } else {
            console.error("[PQ] hh changeState failed:", msg)
            // не падаем — кандидат уже сохранён в БД
          }
        }
      }

      // Обновляем статус hh-отклика и связь с кандидатом
      const updatePayload: { status: string; localCandidateId?: string } = { status: newStatus }
      if (candidateId) updatePayload.localCandidateId = candidateId
      await db.update(hhResponses).set(updatePayload).where(eq(hhResponses.id, resp.id))

      if (decision === "invite") invitedCount++
      else if (decision === "reject") rejectedCount++
      else keptCount++

      results.push({
        id: resp.hhResponseId,
        name: resp.candidateName,
        action: decision === "invite" ? "invited" : decision === "reject" ? "rejected" : "kept",
        score: screenResult.score,
        verdict: screenResult.verdict,
      })
    } catch (err: unknown) {
      console.error("[PQ] FAIL", resp.candidateName, err instanceof Error ? err.message : err)
      results.push({
        id: resp.hhResponseId,
        name: resp.candidateName,
        action: "failed",
        error: err instanceof Error ? err.message : String(err),
        score: screenResult.score,
        verdict: screenResult.verdict,
      })
    }

    // Пауза перед следующим кандидатом — обязательна
    if (idx < newResponses.length - 1) await sleep(effDelayMs)
  }

  stopFlags.delete(companyId)
  return NextResponse.json({
    processed: results.length,
    invited: invitedCount,
    rejected: rejectedCount,
    kept: keptCount,
    minScore: effMinScore,
    delaySeconds: Math.round(effDelayMs / 1000),
    dryRun,
    results,
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  stopFlags.set(session.user.companyId, true)
  return NextResponse.json({ stopped: true })
}
