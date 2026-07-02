import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { scoreCandidateV2 } from "@/lib/ai-score-candidate-v2"
import { scoreDemoAnswers } from "@/lib/demo/score-answers"
import { maybeScheduleSecondDemoInvite } from "@/lib/messaging/second-demo-invite"
import { isPortraitConfigured } from "@/lib/core/spec/resume-input"
import { getSpec } from "@/lib/core/spec/store"

// Fire-and-forget AI-Портрет (v2) при завершении демо.
// Для Portrait-вакансий (критерии в Spec, а не в must_have) тоже запускаем v2.
// Не переоцениваем кандидатов с aiScoredAt != null (skipIfScored на уровне v2).
// Legacy AI-оценка v1 (scoreCandidateById) удалена.
async function runDemoScoring(candidateId: string, vacancyId: string): Promise<void> {
  try {
    const [vac] = await db
      .select({
        aiProcessSettings: vacancies.aiProcessSettings,
        portraitScoring:   vacancies.portraitScoring,
      })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    // Funnel-флаг ai_anketa_score: только явный false выключает авто-скрининг
    // анкеты (undefined/отсутствует = включено — обратная совместимость).
    // Ручная кнопка скоринга у HR (/api/vacancies/[id]/score-candidate) НЕ
    // затрагивается — она работает всегда.
    const funnelFlag = (vac?.aiProcessSettings as { aiAnketaScoreEnabled?: boolean } | null)?.aiAnketaScoreEnabled
    if (funnelFlag === false) return

    // Для Portrait-вакансий загружаем Spec чтобы корректно определить гейт
    // (criteria живут в Spec, а не в requirementsJson.must_have).
    let specForGate: import("@/lib/core/spec/types").CandidateSpec | null = null
    if (vac?.portraitScoring === true) {
      specForGate = await getSpec(vacancyId)
    }

    const portraitConfigured = vac ? isPortraitConfigured(vac, specForGate) : false

    // Без критериев Портрета оценивать нечем (legacy v1 удалён).
    if (!portraitConfigured) return

    // Post-demo: skipIfScored=false для v2 — переоцениваем с ответами демо.
    const v2Result = await scoreCandidateV2({ candidateId, vacancyId, skipIfScored: false })
      .catch((err: unknown) => { console.error("[demo answer] v2 failed:", err); return null })

    if (!v2Result) return

    await db.update(candidates).set({
      aiScore:          v2Result.score,
      aiScoreV2:        v2Result.score,
      aiScoreV2Details: v2Result,
      aiScoredAt:       new Date(),
    }).where(eq(candidates.id, candidateId))
  } catch (err) {
    console.error("[demo answer] Portrait scoring failed:", err instanceof Error ? err.message : err)
  }
}

interface DemoBlock {
  blockId: string
  status: "completed" | "skipped"
  timeSpent: number
  answeredAt: string
}

interface StageHistoryEntry {
  from: string | null
  to: string
  at: string
  reason: string
}

interface IncomingBlock {
  blockId: string
  answer: any
  status?: "completed" | "skipped"
  timeSpent?: number
}

const FINAL_STAGES = new Set(["hired", "rejected"])
const PRE_OPENED = new Set(["new", "primary_contact", "demo"])
const PRE_COMPLETED = new Set(["new", "primary_contact", "demo", "demo_opened"])

// Виртуальные маркеры — это служебные blockId, которые НЕ попадают в anketa_answers
// (т.к. это не пользовательские ответы, а отметки достижения этапов прогресса).
// __complete__ — последний урок завершён.
// __anketa__   — анкета финального этапа отправлена.
// __thanks__   — кандидат увидел экран «Спасибо».
const VIRTUAL_MARKERS = new Set(["__complete__", "__anketa__", "__thanks__"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id: не даём писать ответы за чужого
    // кандидата массовым перебором (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "demo-answer")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params
    const body = await req.json()

    // Поддерживаем два формата:
    // 1) Batch: { lessonId, blocks: [{blockId, answer, status, timeSpent}], currentLesson, totalBlocks }
    //    — для всех блоков урока в одной транзакции.
    // 2) Single: { blockId, answer, timeSpent, currentBlock, totalBlocks, currentLesson, status }
    //    — для одиночных вызовов (в основном "__complete__" в конце последнего урока).
    const isBatch = Array.isArray(body?.blocks) && body.blocks.length > 0

    let incoming: IncomingBlock[]
    if (isBatch) {
      incoming = (body.blocks as any[])
        .filter((b) => b && typeof b.blockId === "string")
        .map((b) => ({
          blockId: b.blockId,
          answer: b.answer,
          status: b.status === "skipped" ? "skipped" : "completed",
          timeSpent: typeof b.timeSpent === "number" ? b.timeSpent : 0,
        }))
      if (incoming.length === 0) return apiError("blocks пустой", 400)
    } else {
      if (!body?.blockId || body.answer === undefined) {
        return apiError("blockId и answer обязательны", 400)
      }
      incoming = [{
        blockId: body.blockId,
        answer: body.answer,
        status: body.status === "skipped" ? "skipped" : "completed",
        timeSpent: typeof body.timeSpent === "number" ? body.timeSpent : 0,
      }]
    }

    const currentLesson: number | undefined =
      typeof body.currentLesson === "number" ? body.currentLesson : undefined
    const totalBlocksFromClient: number | undefined =
      typeof body.totalBlocks === "number" ? body.totalBlocks : undefined

    // Сначала находим id, чтобы внутри транзакции точно делать SELECT FOR UPDATE
    // по PRIMARY KEY (минимальный лок).
    const idRows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (idRows.length === 0) return apiError("Кандидат не найден", 404)
    const candidateId = idRows[0].id

    const now = new Date().toISOString()

    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select({
          id: candidates.id,
          vacancyId: candidates.vacancyId,
          stage: candidates.stage,
          stageHistory: candidates.stageHistory,
          anketaAnswers: candidates.anketaAnswers,
          demoProgressJson: candidates.demoProgressJson,
          aiScore: candidates.aiScore,
        })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .for("update")
        .limit(1)
      if (lockedRows.length === 0) throw new Error("candidate disappeared inside tx")
      const candidate = lockedRows[0]

      // ── anketa_answers (legacy шаблон) ──
      const rawAnswers = candidate.anketaAnswers as unknown
      let existingAnswers: any[]
      if (Array.isArray(rawAnswers)) existingAnswers = [...rawAnswers]
      else if (rawAnswers && typeof rawAnswers === "object")
        existingAnswers = Object.values(rawAnswers as Record<string, any>)
      else existingAnswers = []

      // Применяем все incoming-блоки. Виртуальные маркеры (__complete__, __anketa__,
      // __thanks__) в anketaAnswers не пишем — это отметки прогресса, не ответы
      // кандидата. В demoProgressJson.blocks пишем все, включая виртуальные.
      for (const inc of incoming) {
        if (!VIRTUAL_MARKERS.has(inc.blockId)) {
          const idx = existingAnswers.findIndex((a: any) => a?.blockId === inc.blockId)
          const newAnswer = {
            blockId: inc.blockId,
            answer: inc.answer,
            timeSpent: inc.timeSpent ?? 0,
            answeredAt: now,
          }
          if (idx >= 0) existingAnswers[idx] = newAnswer
          else existingAnswers.push(newAnswer)
        }
      }

      // ── demo_progress_json.blocks ──
      const prevProgress = (candidate.demoProgressJson as Record<string, unknown> | null) || {}
      const prevBlocks = Array.isArray(prevProgress.blocks)
        ? (prevProgress.blocks as DemoBlock[])
        : []

      // Накапливаем blocks без дублей по blockId. Все incoming перекрывают prev.
      const incomingIds = new Set(incoming.map((b) => b.blockId))
      const filteredBlocks = prevBlocks.filter((b) => !incomingIds.has(b.blockId))
      const newBlocks: DemoBlock[] = incoming.map((inc) => ({
        blockId: inc.blockId,
        status: inc.status ?? "completed",
        timeSpent: inc.timeSpent ?? 0,
        answeredAt: now,
      }))
      const updatedBlocks = [...filteredBlocks, ...newBlocks]

      // hasVideoVizitka — пересчёт по обновлённым anketaAnswers.
      const hasVideoVizitka = existingAnswers.some((a: any) =>
        a?.answer && typeof a.answer === "object" &&
        (a.answer as any).mediaType === "video" &&
        typeof (a.answer as any).url === "string" &&
        (a.answer as any).url.length > 0
      )
      // hasAudioAnswer — аналогично, но для media-ответов типа audio (значок 🎙️
      // в ячейке «Демо»). Считаем сервером, чтобы HR-таблица читала готовый флаг.
      const hasAudioAnswer = existingAnswers.some((a: any) =>
        a?.answer && typeof a.answer === "object" &&
        (a.answer as any).mediaType === "audio" &&
        typeof (a.answer as any).url === "string" &&
        (a.answer as any).url.length > 0
      )

      // Сервер сам считает completedCount по итоговым blocks (исключая __complete__).
      const completedCount = updatedBlocks.filter(
        (b) => b.status === "completed" && b.blockId !== "__complete__"
      ).length

      const isComplete = incoming.some((b) => b.blockId === "__complete__")

      const progress = {
        ...prevProgress,
        schemaVersion: 2,
        blocks: updatedBlocks,
        currentBlock: completedCount,
        totalBlocks: totalBlocksFromClient ?? prevProgress.totalBlocks ?? 0,
        currentLesson: currentLesson ?? prevProgress.currentLesson ?? 0,
        hasVideoVizitka,
        hasAudioAnswer,
        completedAt: isComplete ? now : (prevProgress.completedAt ?? null),
        lastUpdated: now,
      }

      // ── Stage transitions ──
      const currentStage = candidate.stage ?? "new"
      let newStage: string | null = null
      let stageReason: string | null = null

      if (!FINAL_STAGES.has(currentStage)) {
        // F2.A: первый ответ из ранних стадий → demo_opened.
        // prevBlocks был пустой (до текущего batch) и в batch есть НЕ-виртуальный блок.
        const hasRealBlock = incoming.some((b) => !VIRTUAL_MARKERS.has(b.blockId))
        if (PRE_OPENED.has(currentStage) && prevBlocks.length === 0 && hasRealBlock && !isComplete) {
          newStage = "demo_opened"
          stageReason = "demo_started"
        }
        // F2.B: финальный шаг → decision (Вариант A — опциональное видео не блокирует).
        if (isComplete && PRE_COMPLETED.has(currentStage)) {
          newStage = "decision"
          stageReason = "demo_completed"
        }
        // «Путь менеджера»/2-я часть (тест): кандидат на «Тест отправлен»
        // завершил 2-й демо-блок → авто на «Задание выполнено» (test_task_done).
        // ТОЛЬКО наша стадия на платформе — hh НЕ трогаем (решение Юрия 30.06).
        // («Тест пройден»/test_passed по баллу — отдельно, когда задан критерий прохождения.)
        if (isComplete && currentStage === "test_task_sent") {
          newStage = "test_task_done"
          stageReason = "second_demo_completed"
        }
      }

      const stageHistory = (candidate.stageHistory as StageHistoryEntry[] | null) || []
      const updates: Record<string, unknown> = {
        anketaAnswers: existingAnswers,
        demoProgressJson: progress,
        updatedAt: new Date(),
        // Активность кандидата — для фильтра «активны сейчас».
        lastActivityAt: new Date(),
      }
      if (newStage && newStage !== currentStage) {
        updates.stage = newStage
        updates.stageHistory = [
          ...stageHistory,
          { from: currentStage, to: newStage, at: now, reason: stageReason },
        ]
      }

      await tx.update(candidates).set(updates).where(eq(candidates.id, candidate.id))

      // Есть ли в этом батче реальный ответ на вопрос (не виртуальный маркер и
      // не пустой объект) — сигнал пересчитать балл по ответам, даже если демо
      // ещё не пройдено целиком.
      const hasRealAnswer = incoming.some(
        (b) =>
          !VIRTUAL_MARKERS.has(b.blockId) &&
          b.answer != null &&
          !(typeof b.answer === "object" && !Array.isArray(b.answer) && Object.keys(b.answer as object).length === 0),
      )

      return {
        stage: newStage ?? currentStage,
        isComplete,
        hasRealAnswer,
        aiScoreNull: candidate.aiScore == null,
        vacancyId: candidate.vacancyId,
        candidateId: candidate.id,
      }
    })

    // Авто AI-Портрет (v2) при завершении демо (вне транзакции, fire-and-forget).
    if (txResult.isComplete && txResult.aiScoreNull) {
      void runDemoScoring(txResult.candidateId, txResult.vacancyId)
    }

    // Балл по ответам демо — fire-and-forget. Пересчитываем при завершении демо
    // ИЛИ когда в этом батче кандидат ответил на реальные вопросы: многие
    // отвечают на анкету, не долистав демо до конца (__complete__), и без этого
    // у них «AI-ан» оставался пустым. Знаменатель — все оцениваемые вопросы
    // версии демо (неотвеченные = 0), поэтому пересчёт по мере ответов корректен.
    // Работает независимо от A/B скоринга: оценивает task-вопросы с aiCriteria.
    // Пишет в СВОЮ колонку candidates.demo_answers_score (не ai_score — иначе была
    // бы гонка с runDemoScoring). Только если у вакансии есть такие вопросы.
    // Сигнал фронту: кандидат ТОЛЬКО ЧТО прошёл гейт и его надо инлайн перевести
    // на блок 2 («Путь менеджера») прямо на странице (без «Спасибо» + письма).
    // null — не прошёл / фича выкл / inlineContinue=false → прежний экран.
    let advanceToBlockId: string | null = null

    if (txResult.isComplete || txResult.hasRealAnswer) {
      void scoreDemoAnswers({
        candidateId: txResult.candidateId,
        vacancyId:   txResult.vacancyId,
        skipIfScored: false,
      }).catch((err: unknown) => {
        console.error("[demo answer] score-answers failed:", err instanceof Error ? err.message : err)
      })

      // «2-я часть демо» (Путь менеджера): если в Портрете включён
      // anketaPassInvite и кандидат прошёл детерминированный гейт по выбору —
      // выставляем override-блок и ставим приглашение в очередь. OFF by default,
      // дедуп внутри. Письмо остаётся страховкой (кандидат ушёл со страницы).
      //
      // Awaited (не fire-and-forget), потому что от результата зависит, вернём
      // ли мы фронту advanceToBlockId для ИНЛАЙН-склейки. maybeSchedule сам
      // атомарно выставляет candidates.overrideContentBlockId при прохождении;
      // дедуп внутри (already_invited) → повторный сабмит не задвоит письмо, но
      // блок 2 всё равно резолвим ниже для инлайн-показа.
      try {
        const inviteResult = await maybeScheduleSecondDemoInvite({
          candidateId: txResult.candidateId,
          vacancyId:   txResult.vacancyId,
        })
        // Прошёл гейт, если инвайт запланирован СЕЙЧАС (scheduled=true) ИЛИ
        // override уже стоял (already_invited/already_scheduled — прошёл ранее,
        // повторный сабмит). Читаем актуальный override кандидата как источник
        // истины и уважаем под-флаг inlineContinue из Портрета.
        const passedNow = inviteResult.scheduled ||
          inviteResult.reason === "already_invited" ||
          inviteResult.reason === "already_scheduled"
        if (passedNow) {
          const spec = await getSpec(txResult.vacancyId)
          const ap = spec?.anketaPassInvite
          if (ap?.enabled === true && ap.inlineContinue !== false) {
            const [cand] = await db
              .select({ overrideContentBlockId: candidates.overrideContentBlockId })
              .from(candidates)
              .where(eq(candidates.id, txResult.candidateId))
              .limit(1)
            advanceToBlockId = cand?.overrideContentBlockId ?? null
          }
        }
      } catch (err) {
        console.error("[demo answer] second-demo-invite failed:", err instanceof Error ? err.message : err)
      }
    }

    return apiSuccess({ ok: true, stage: txResult.stage, advanceToBlockId })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/demo/[token]/answer", err)
    return apiError("Internal server error", 500)
  }
}
