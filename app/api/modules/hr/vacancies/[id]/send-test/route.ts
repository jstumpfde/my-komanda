// GET / POST /api/modules/hr/vacancies/[id]/send-test
//
// GET  — текущий текст приглашения к тесту (postDemoSettings.testInviteMessage
//        или дефолт). Используется окном «Отправить тест» для предзаполнения.
// POST — ставит в очередь приглашение выбранным кандидатам.
//        Body: { candidateIds: string[], message?: string }
//        Если message задан — сохраняем его как шаблон вакансии
//        (postDemoSettings.testInviteMessage) и используем для рассылки.
//
// Рассылка НЕ мгновенная: scheduleTestInvitesForCandidates кладёт записи в
// follow_up_messages (branch='test_invite'), а cron /api/cron/follow-up шлёт их
// по очереди с паузой между отправками. Стадия выбранных → test_task_sent.

import { NextRequest } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, demos, type PostDemoSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { scheduleTestInvitesForCandidates, DEFAULT_TEST_INVITE_TEXT } from "@/lib/messaging/test-invite"

async function ownsVacancy(id: string, companyId: string): Promise<boolean> {
  const [vac] = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return !!vac
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    if (!(await ownsVacancy(id, user.companyId))) return apiError("Вакансия не найдена", 404)

    const [testDemo] = await db
      .select({ postDemoSettings: demos.postDemoSettings })
      .from(demos)
      .where(and(eq(demos.vacancyId, id), eq(demos.kind, "test")))
      .orderBy(sql`${demos.updatedAt} DESC`)
      .limit(1)

    const settings = (testDemo?.postDemoSettings as PostDemoSettings | null) ?? {}
    const saved = (settings.testInviteMessage || "").trim()
    return apiSuccess({
      message:   saved || DEFAULT_TEST_INVITE_TEXT,
      isDefault: !saved,
      hasTest:   !!testDemo,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[send-test GET]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    if (!(await ownsVacancy(id, user.companyId))) return apiError("Вакансия не найдена", 404)

    const body = await req.json().catch(() => ({}))
    const candidateIds = Array.isArray(body?.candidateIds)
      ? body.candidateIds.filter((x: unknown): x is string => typeof x === "string")
      : []
    if (!candidateIds.length) return apiError("Не выбраны кандидаты", 400)

    // Если HR отредактировал текст — сохраняем как шаблон вакансии (merge),
    // чтобы scheduleTestInvitesForCandidates прочитал свежий testInviteMessage.
    const message = typeof body?.message === "string" ? body.message.trim() : ""
    if (message) {
      await db.update(demos)
        .set({
          postDemoSettings: sql`COALESCE(${demos.postDemoSettings}, '{}'::jsonb) || jsonb_build_object('testInviteMessage', ${message}::text)`,
          updatedAt: new Date(),
        })
        .where(and(eq(demos.vacancyId, id), eq(demos.kind, "test")))
        .catch((e) => console.error("[send-test] save testInviteMessage failed:", e))
    }

    const res = await scheduleTestInvitesForCandidates({ vacancyId: id, candidateIds })

    if (!res.ok) {
      if (res.error === "no_test") {
        return apiError("Сначала настройте тест на вакансии (вкладка «Тест»)", 400)
      }
      if (res.error === "no_candidates") {
        return apiError("Кандидаты не найдены в этой вакансии", 400)
      }
      return apiError("Не удалось поставить тест в очередь", 500)
    }

    return apiSuccess({
      scheduled:     res.scheduled,
      alreadyQueued: res.alreadyQueued,
      skipped:       res.skipped,
      noHhLink:      res.noHhLink,
      scheduledAt:   res.scheduledAt,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[send-test]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
