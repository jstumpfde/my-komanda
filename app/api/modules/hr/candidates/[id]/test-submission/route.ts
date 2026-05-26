import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, testSubmissions, type PostDemoSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scheduleTestAfterMessage } from "@/lib/messaging/test-after-message"

// Ответ кандидата на тестовое задание — для карточки кандидата у HR.
// Tenant-scoped: кандидат должен принадлежать компании пользователя.
//
// GET  — submission + текущий режим проверки (checkMode) + стадия кандидата.
//        UI по ним решает, показывать ли кнопки «Принять»/«Отклонить»
//        (assisted + stage='test_task_done').
// POST — вердикт HR (Этап 2, assisted): { verdict: 'pass' | 'fail' }.
//        Меняет стадию на test_passed/test_failed; при 'pass' планирует
//        «сообщение после теста» (postDemoSettings.testAfterMessage).

async function loadOwnedCandidate(candidateId: string, companyId: string) {
  const [owned] = await db
    .select({ id: candidates.id, vacancyId: candidates.vacancyId, stage: candidates.stage })
    .from(candidates)
    .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
    .where(and(eq(candidates.id, candidateId), eq(vacancies.companyId, companyId)))
    .limit(1)
  return owned ?? null
}

async function loadTestSettings(vacancyId: string): Promise<PostDemoSettings> {
  const [demo] = await db
    .select({ postDemoSettings: demos.postDemoSettings })
    .from(demos)
    .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "test")))
    .orderBy(desc(demos.updatedAt))
    .limit(1)
  return (demo?.postDemoSettings as PostDemoSettings | null) ?? {}
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const owned = await loadOwnedCandidate(id, user.companyId)
    if (!owned) return apiError("Кандидат не найден", 404)

    const [submission] = await db
      .select()
      .from(testSubmissions)
      .where(eq(testSubmissions.candidateId, id))
      .orderBy(desc(testSubmissions.submittedAt))
      .limit(1)

    const settings = await loadTestSettings(owned.vacancyId)
    // Обратная совместимость: undefined → 'assisted'.
    const checkMode = settings.testCheckMode === "auto" || settings.testCheckMode === "manual"
      ? settings.testCheckMode
      : "assisted"

    return apiSuccess({
      submission: submission ?? null,
      checkMode,
      stage: owned.stage,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hr/candidates/[id]/test-submission GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { verdict?: unknown }

    const verdict = body.verdict
    if (verdict !== "pass" && verdict !== "fail") {
      return apiError("verdict должен быть 'pass' или 'fail'", 400)
    }

    const owned = await loadOwnedCandidate(id, user.companyId)
    if (!owned) return apiError("Кандидат не найден", 404)

    const newStage = verdict === "pass" ? "test_passed" : "test_failed"
    await db.update(candidates)
      .set({ stage: newStage, updatedAt: new Date() })
      .where(eq(candidates.id, id))

    // При прохождении — планируем «сообщение после теста», если задано.
    // (hhAction у test_passed/test_failed = null, поэтому hh-sync не нужен.)
    let afterMessageScheduled = false
    if (verdict === "pass") {
      const settings = await loadTestSettings(owned.vacancyId)
      if (settings.testAfterMessage && settings.testAfterMessage.trim().length > 0) {
        const res = await scheduleTestAfterMessage({
          candidateId: id,
          vacancyId:   owned.vacancyId,
          messageText: settings.testAfterMessage,
        })
        afterMessageScheduled = res.scheduled
      }
    }

    return apiSuccess({ ok: true, stage: newStage, afterMessageScheduled })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hr/candidates/[id]/test-submission POST]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
