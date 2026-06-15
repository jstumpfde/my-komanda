// POST /api/modules/hr/vacancies/[id]/save-test-invite-template
// body: { message: string }
//
// Сохраняет шаблон приглашения к тесту (postDemoSettings.testInviteMessage у
// demo kind='test') — тот же шаблон, что использует кнопка «Отправить тест» и
// рассылка через hh. Только сохранение, без планирования отправки.
//
// Зеркалит логику сохранения из send-test POST (merge в jsonb).

import { NextRequest } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // tenant-изоляция
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const body = (await req.json().catch(() => ({}))) as { message?: unknown }
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) return apiError("Пустой шаблон", 400)

    const res = await db.update(demos)
      .set({
        postDemoSettings: sql`COALESCE(${demos.postDemoSettings}, '{}'::jsonb) || jsonb_build_object('testInviteMessage', ${message}::text)`,
        updatedAt: new Date(),
      })
      .where(and(eq(demos.vacancyId, id), eq(demos.kind, "test")))
      .returning({ id: demos.id })

    if (res.length === 0) {
      return apiError("Сначала настройте тест на вакансии (вкладка «Тест»)", 400)
    }

    return apiSuccess({ saved: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[save-test-invite-template]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
