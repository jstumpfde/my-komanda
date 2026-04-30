import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState, getNegotiationMessages } from "@/lib/hh-api"
import { generateCandidateShortId } from "@/lib/short-id"
import { screenCandidate, type ScreeningResult } from "@/lib/ai-screen-candidate"
import { logAiAction } from "@/lib/ai-audit"

const stopFlags = new Map<string, boolean>()

const DEMO_INVITE_MESSAGE = "Здравствуйте! Спасибо за отклик. Мы подготовили короткую демонстрацию должности — 15 минут, и вы узнаете всё о задачах, команде и доходе. Перейдите по ссылке: https://company24.pro/demo/invite"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = session.user.companyId
  const body = await req.json().catch(() => ({}))
  console.log("[PQ] start", { companyId, body })
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 50)
  // dryRun / minScore / autoAction оставляем в типе body для совместимости со старыми вызовами,
  // но AI-скоринг временно отключён — параметры игнорируются.
  void body.dryRun
  void body.minScore
  void body.autoAction
  const localVacancyId: string | undefined = body.vacancyId
  const reqDelaySeconds = body.delaySeconds != null ? Number(body.delaySeconds) : undefined

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

  // Эффективные настройки прогона. AI временно отключён —
  // используем только текст приглашения; порог/действие при низком скоре игнорируются.
  const effDelayMs = Math.max(0, (reqDelaySeconds ?? 30) * 1000)
  const effInviteMsg = scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE

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
    error?: string
  }> = []
  let invitedCount = 0

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

    // Минимально нужные данные из rawData (city для нового кандидата).
    // Шаблоны сообщений теперь живут в vacancies.ai_process_settings (см. ниже).
    const raw = resp.rawData as {
      resume?: { id?: string; area?: { name?: string } }
    } | null
    const candidateCity = raw?.resume?.area?.name ?? undefined

    // AI-скоринг (выполняется ниже после создания/связывания candidateId,
    // если у вакансии включен тумблер aiScoringEnabled). Сейчас всем откликам
    // отправляем приглашение на демо — низкий скор не блокирует приглашение.
    console.log("[PQ] candidate", { name: resp.candidateName, aiEnabled: localVac?.aiScoringEnabled !== false })

    const targetStage = "demo"
    const baseMessage = effInviteMsg
    const hhAction = "invitation"
    const newStatus = "invited"

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

      let newCandShortId: string | null = null

      if (!candidateId && localVac) {
        candidateToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
        const newCand = await db.transaction(async (tx) => {
          const short = await generateCandidateShortId(tx, localVac.id)
          const [row] = await tx.insert(candidates).values({
            vacancyId: localVac.id,
            name: resp.candidateName || "Кандидат с hh.ru",
            phone: resp.candidatePhone,
            email: resp.candidateEmail,
            city: candidateCity,
            source: "hh",
            stage: targetStage,
            token: candidateToken,
            shortId: short?.shortId ?? null,
            sequenceNumber: short?.sequenceNumber ?? null,
          }).returning()
          return row
        })
        if (newCand) {
          candidateId = newCand.id
          newCandShortId = newCand.shortId ?? null
        }
      } else if (candidateId) {
        // Кандидат уже существует — обновляем стадию
        await db.update(candidates).set({
          stage: targetStage,
          updatedAt: new Date(),
        }).where(eq(candidates.id, candidateId))
      }

      // AI-скоринг (гейт по тумблеру vacancy.aiScoringEnabled).
      // Скоринг не блокирует приглашение — приглашение шлётся всем,
      // а скор сохраняется в кандидате для последующего ручного ревью.
      if (candidateId && localVac && localVac.aiScoringEnabled !== false) {
        try {
          const dj = (localVac.descriptionJson as Record<string, unknown> | null) ?? {}
          const an = (dj.anketa as Record<string, unknown> | null) ?? {}
          const aiResult: ScreeningResult = await screenCandidate({
            candidateData: {
              name: resp.candidateName ?? undefined,
              city: candidateCity,
              resume: [
                resp.resumeTitle ? `Заголовок резюме: ${resp.resumeTitle}` : null,
                resp.resumeUrl ? `Ссылка: ${resp.resumeUrl}` : null,
              ].filter(Boolean).join("\n") || undefined,
            },
            vacancyAnketa: {
              vacancyTitle: localVac.title ?? undefined,
              requirements: typeof an.requirements === "string" ? an.requirements : undefined,
              responsibilities: typeof an.responsibilities === "string" ? an.responsibilities : undefined,
              requiredSkills: Array.isArray(an.requiredSkills) ? an.requiredSkills.map(String) : undefined,
              desiredSkills: Array.isArray(an.desiredSkills) ? an.desiredSkills.map(String) : undefined,
              experienceMin: typeof an.experienceMin === "string" ? an.experienceMin : undefined,
              positionCity: localVac.city ?? undefined,
              aiIdealProfile: typeof an.aiIdealProfile === "string" ? an.aiIdealProfile : undefined,
              aiStopFactors: Array.isArray(an.aiStopFactors) ? an.aiStopFactors.map(String) : undefined,
              aiRequiredHardSkills: Array.isArray(an.aiRequiredHardSkills) ? an.aiRequiredHardSkills.map(String) : undefined,
              aiMinExperience: typeof an.aiMinExperience === "string" ? an.aiMinExperience : undefined,
            },
          })
          await db.update(candidates).set({
            aiScore: aiResult.score,
            aiSummary: aiResult.recommendation,
            aiDetails: [
              ...aiResult.strengths.map(s => ({ question: "Сильная сторона", score: 1, comment: s })),
              ...aiResult.weaknesses.map(w => ({ question: "Слабая сторона", score: 0, comment: w })),
            ],
            aiScoredAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(candidates.id, candidateId))
          await logAiAction({
            tenantId: companyId,
            action: "screen_candidate",
            vacancyId: localVac.id,
            candidateId,
            inputSummary: `${resp.candidateName ?? "?"} → ${localVac.title ?? "?"}`,
            outputSummary: `score=${aiResult.score} verdict=${aiResult.verdict} action=${aiResult.autoAction}`,
          })
        } catch (err) {
          console.error("[PQ] AI scoring failed:", err instanceof Error ? err.message : err)
        }
      }

      // Проверяем — отправляли ли работодателю уже что-то по этому отклику.
      // Если да — это "повторная отправка" (исправление битой ссылки),
      // используем reInviteMessage вместо стандартного inviteMessage.
      let previouslyInvited = false
      let employerMsgCount = 0
      try {
        const msgs = await getNegotiationMessages(tokenResult.accessToken, resp.hhResponseId)
        employerMsgCount = msgs.filter(m => m?.author?.participant_type === "employer").length
        previouslyInvited = employerMsgCount > 0
      } catch (msgErr) {
        console.warn("[PQ] getNegotiationMessages failed — fallback to inviteMessage:",
          msgErr instanceof Error ? msgErr.message : msgErr)
      }

      // Формируем итоговое сообщение — единая логика для обоих веток.
      let finalMessage: string | null = baseMessage
      if (localVac && (candidateToken || candidateId)) {
        const nameParts = (resp.candidateName || "").trim().split(/\s+/)
        const candidateName = nameParts[1] || nameParts[0] || "Здравствуйте"
        // Гарантируем что у кандидата есть shortId
        let shortIdForUrl: string | null = newCandShortId
        if (!shortIdForUrl && candidateId) {
          const [existing] = await db
            .select({ shortId: candidates.shortId })
            .from(candidates)
            .where(eq(candidates.id, candidateId))
            .limit(1)
          shortIdForUrl = existing?.shortId ?? null
          // Если shortId нет — генерим и сохраняем
          if (!shortIdForUrl) {
            const newShort = await db.transaction(async (tx) => {
              return await generateCandidateShortId(tx, localVac.id)
            })
            if (newShort?.shortId) {
              await db.update(candidates)
                .set({
                  shortId: newShort.shortId,
                  sequenceNumber: newShort.sequenceNumber,
                })
                .where(eq(candidates.id, candidateId))
              shortIdForUrl = newShort.shortId
            }
          }
        }
        // Финальный fallback на случай если совсем ничего не получилось
        const tokenForUrl = shortIdForUrl ?? candidateId
        const demoUrl = `https://company24.pro/demo/${tokenForUrl}`

        const messageText = previouslyInvited
          ? (scopedAiSettings.reInviteMessage?.trim() || scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE)
          : (scopedAiSettings.inviteMessage?.trim() || DEMO_INVITE_MESSAGE)

        const replaced = messageText
          .replaceAll("[Имя]", candidateName)
          .replaceAll("[имя]", candidateName)
          .replaceAll("{имя}", candidateName)
          .replaceAll("{Имя}", candidateName)
          .replaceAll("[должность]", localVac.title || "")
          .replaceAll("{должность}", localVac.title || "")
          .replaceAll("[компания]", "Company24")
          .replaceAll("{компания}", "Company24")
          .replaceAll("[ссылка]", demoUrl)
          .replaceAll("{ссылка}", demoUrl)

        finalMessage = replaced.includes(demoUrl) ? replaced : replaced + "\n\n" + demoUrl
      }

      // Шлём действие в hh, если нужно
      if (hhAction && finalMessage) {
        const rawResume = raw?.resume?.id
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

      invitedCount++

      results.push({
        id: resp.hhResponseId,
        name: resp.candidateName,
        action: "invited",
      })
    } catch (err: unknown) {
      console.error("[PQ] FAIL", resp.candidateName, err instanceof Error ? err.message : err)
      results.push({
        id: resp.hhResponseId,
        name: resp.candidateName,
        action: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Пауза перед следующим кандидатом — обязательна
    if (idx < newResponses.length - 1) await sleep(effDelayMs)
  }

  stopFlags.delete(companyId)
  return NextResponse.json({
    processed: results.length,
    invited: invitedCount,
    rejected: 0,
    kept: 0,
    delaySeconds: Math.round(effDelayMs / 1000),
    results,
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  stopFlags.set(session.user.companyId, true)
  return NextResponse.json({ stopped: true })
}
