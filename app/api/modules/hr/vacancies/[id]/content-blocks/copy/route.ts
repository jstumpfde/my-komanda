// POST /api/modules/hr/vacancies/[id]/content-blocks/copy
// Кросс-вакансийная копия блока контента (демо/тест) целиком или одного урока
// внутри блока. [id] — вакансия-ИСТОЧНИК.
//
// body: { sourceBlockId: string, lessonId?: string, targetVacancyId: string, targetBlockId?: string }
// - lessonId не задан → копируется БЛОК ЦЕЛИКОМ (все уроки) — создаётся НОВЫЙ
//   блок в конце списка блоков targetVacancyId, targetBlockId не используется.
// - lessonId задан → копируется ОДИН урок — targetBlockId ОБЯЗАТЕЛЕН, урок
//   добавляется в конец lessonsJson целевого блока.
//
// Тенант-изоляция: ОБЕ вакансии (источник И цель) обязаны принадлежать
// user.companyId — иначе можно было бы утащить контент из чужой компании
// или подсунуть данные в чужую вакансию (см. skill tenant-isolation-check).
//
// Глубокая копия с перегенерацией id — cloneLessonWithNewIds (lib/course-types),
// та же утилита, что использует клиентский быстрый путь копирования в пределах
// одной вакансии (content-blocks-tab.tsx/notion-editor.tsx).

import { NextRequest } from "next/server"
import { eq, and, max } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { cloneLessonWithNewIds, type Lesson } from "@/lib/course-types"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id: sourceVacancyId } = await ctx.params

    const body = await req.json().catch(() => ({})) as {
      sourceBlockId?: unknown
      lessonId?: unknown
      targetVacancyId?: unknown
      targetBlockId?: unknown
    }

    const sourceBlockId = typeof body.sourceBlockId === "string" ? body.sourceBlockId : null
    const lessonId = typeof body.lessonId === "string" ? body.lessonId : null
    const targetVacancyId = typeof body.targetVacancyId === "string" ? body.targetVacancyId : null
    const targetBlockId = typeof body.targetBlockId === "string" ? body.targetBlockId : null

    if (!sourceBlockId) return apiError("'sourceBlockId' обязателен", 400)
    if (!targetVacancyId) return apiError("'targetVacancyId' обязателен", 400)
    if (lessonId && !targetBlockId) return apiError("'targetBlockId' обязателен при копировании урока", 400)

    // Тенант-изоляция: обе вакансии должны принадлежать компании пользователя.
    const [sourceVacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, sourceVacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!sourceVacancy) return apiError("Вакансия-источник не найдена", 404)

    const [targetVacancy] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, targetVacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!targetVacancy) return apiError("Целевая вакансия не найдена", 404)

    // Блок-источник должен реально принадлежать sourceVacancyId (а не просто
    // существовать где-то ещё в компании — иначе можно было бы читать чужой блок).
    const [sourceBlock] = await db
      .select()
      .from(demos)
      .where(and(eq(demos.id, sourceBlockId), eq(demos.vacancyId, sourceVacancyId)))
      .limit(1)
    if (!sourceBlock) return apiError("Исходный блок не найден", 404)

    const sourceLessons: Lesson[] = Array.isArray(sourceBlock.lessonsJson) ? (sourceBlock.lessonsJson as Lesson[]) : []

    if (lessonId) {
      // ─── Копия ОДНОГО урока в указанный блок целевой вакансии ───────────
      const lesson = sourceLessons.find((l) => l.id === lessonId)
      if (!lesson) return apiError("Урок не найден", 404)

      const [targetBlock] = await db
        .select()
        .from(demos)
        .where(and(eq(demos.id, targetBlockId as string), eq(demos.vacancyId, targetVacancyId)))
        .limit(1)
      if (!targetBlock) return apiError("Целевой блок не найден", 404)

      const clonedLesson = cloneLessonWithNewIds(lesson, "")
      const targetLessons: Lesson[] = Array.isArray(targetBlock.lessonsJson) ? (targetBlock.lessonsJson as Lesson[]) : []

      await db
        .update(demos)
        .set({ lessonsJson: [...targetLessons, clonedLesson], updatedAt: new Date() })
        .where(eq(demos.id, targetBlock.id))

      return apiSuccess({
        targetVacancyId,
        targetVacancyTitle: targetVacancy.title,
        targetBlockId: targetBlock.id,
        targetBlockTitle: targetBlock.title,
        lessonId: clonedLesson.id,
      })
    }

    // ─── Копия БЛОКА ЦЕЛИКОМ — новая запись в конце списка блоков цели ─────
    const clonedLessons = sourceLessons.map((l) => cloneLessonWithNewIds(l, ""))
    const newTitle = `${sourceBlock.title} (копия)`

    const { randomUUID } = await import("crypto")
    const kind = `block:${randomUUID()}`

    const [{ maxOrder }] = await db
      .select({ maxOrder: max(demos.sortOrder) })
      .from(demos)
      .where(eq(demos.vacancyId, targetVacancyId))
    const sortOrder = (maxOrder ?? -1) + 1

    const [created] = await db
      .insert(demos)
      .values({
        vacancyId: targetVacancyId,
        kind,
        title: newTitle,
        lessonsJson: clonedLessons,
        contentType: sourceBlock.contentType,
        status: "draft",
        sortOrder,
        // postDemoSettings НЕ копируем — копия не должна унаследовать
        // isLiveBattle=true и уйти кандидатам целевой вакансии без явного
        // решения HR.
      })
      .returning()

    return apiSuccess({
      targetVacancyId,
      targetVacancyTitle: targetVacancy.title,
      targetBlockId: created.id,
      targetBlockTitle: created.title,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[content-blocks/copy POST] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
