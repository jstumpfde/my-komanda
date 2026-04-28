import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { hhResponses, candidates, vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { changeNegotiationState } from "@/lib/hh-api"
import { generateCandidateShortId } from "@/lib/short-id"

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

    // Минимально нужные данные из rawData (city для нового кандидата) и descriptionJson вакансии
    // (для шаблона firstMessageText). AI-входы убраны — скоринг временно отключён.
    const raw = resp.rawData as {
      resume?: { id?: string; area?: { name?: string } }
    } | null
    const candidateCity = raw?.resume?.area?.name ?? undefined
    const dj = (localVac?.descriptionJson as Record<string, unknown> | null) ?? {}

    // AI-скоринг временно отключён — всем откликам отправляем приглашение на демо.
    console.log("[PQ] candidate (no-AI)", { name: resp.candidateName })

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
        // Кандидат уже существует — обновляем стадию (AI-поля больше не трогаем)
        await db.update(candidates).set({
          stage: targetStage,
          updatedAt: new Date(),
        }).where(eq(candidates.id, candidateId))
      }

      // Формируем итоговое сообщение из шаблона вакансии — приглашение для всех
      let finalMessage: string | null = baseMessage
      if (localVac) {
        const automation = (dj as { automation?: { firstMessageText?: string } }).automation
        const template = automation?.firstMessageText
        if (template && (candidateToken || candidateId)) {
          const nameParts = (resp.candidateName || "").trim().split(/\s+/)
          const candidateName = nameParts[1] || nameParts[0] || "Здравствуйте"
          // Для нового кандидата уже знаем shortId, для существующего — подтягиваем из БД
          let existingShortId: string | null = newCandShortId
          if (!existingShortId && candidateId && !candidateToken) {
            const [row] = await db
              .select({ shortId: candidates.shortId })
              .from(candidates)
              .where(eq(candidates.id, candidateId))
              .limit(1)
            existingShortId = row?.shortId ?? null
          }
          const tokenForUrl = (newCandShortId ?? existingShortId ?? candidateToken ?? candidateId)
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
