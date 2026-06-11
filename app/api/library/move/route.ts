/**
 * POST /api/library/move
 *
 * Переносит материал из одного раздела библиотеки в другой.
 * Тело запроса: { id, from: SectionKey, to: SectionKey }
 *
 * SectionKey = "demo" | "block" | "test" | "anketa"
 *
 * Случаи:
 *  1. demo/block/test → demo/block/test  — UPDATE demo_templates.length
 *  2. anketa → demo/block/test           — INSERT demo_templates + soft-delete questionnaire_template
 *  3. demo/block/test → anketa           — INSERT questionnaire_templates + soft-delete demo_template
 *  4. Одинаковый раздел                  — 400 Bad Request
 *
 * Системные материалы (isSystem=true) не перемещаются — 403.
 */

import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { demoTemplates, questionnaireTemplates } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { questionsToSections, sectionsToQuestions } from "@/lib/library/convert"
import type { Lesson } from "@/lib/course-types"
import type { Question } from "@/lib/course-types"

type SectionKey = "demo" | "block" | "test" | "anketa"

const MATERIAL_SECTIONS: SectionKey[] = ["demo", "block", "test"]

/** Значение length в demo_templates для каждого section-ключа. */
function sectionToLength(section: "demo" | "block" | "test"): string {
  if (section === "block") return "block"
  if (section === "test") return "test"
  return "standard"
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as { id?: string; from?: string; to?: string }

    const id = body.id?.trim()
    const from = body.from as SectionKey | undefined
    const to = body.to as SectionKey | undefined

    const validSections: SectionKey[] = ["demo", "block", "test", "anketa"]
    if (!id) return apiError("id обязателен", 400)
    if (!from || !validSections.includes(from)) return apiError("from: некорректное значение", 400)
    if (!to || !validSections.includes(to)) return apiError("to: некорректное значение", 400)
    if (from === to) return apiError("from и to совпадают", 400)

    // ── Случай 1: demo/block/test → demo/block/test ─────────────────────────
    if (MATERIAL_SECTIONS.includes(from) && MATERIAL_SECTIONS.includes(to)) {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(demoTemplates)
          .where(eq(demoTemplates.id, id))
          .limit(1)

        if (!row) throw apiError("Материал не найден", 404)
        if (row.isSystem) throw apiError("Системные материалы нельзя перемещать", 403)
        if (row.tenantId !== user.companyId) throw apiError("Нет доступа", 403)

        const newLength = sectionToLength(to as "demo" | "block" | "test")
        const [updated] = await tx
          .update(demoTemplates)
          .set({ length: newLength, updatedAt: new Date() })
          .where(and(eq(demoTemplates.id, id), eq(demoTemplates.tenantId, user.companyId)))
          .returning()

        return { id: updated.id, to }
      })
      return apiSuccess(result)
    }

    // ── Случай 2: anketa → demo/block/test ──────────────────────────────────
    if (from === "anketa" && MATERIAL_SECTIONS.includes(to)) {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(questionnaireTemplates)
          .where(eq(questionnaireTemplates.id, id))
          .limit(1)

        if (!row) throw apiError("Анкета не найдена", 404)
        if (row.isSystem) throw apiError("Системные материалы нельзя перемещать", 403)
        if (row.tenantId !== user.companyId) throw apiError("Нет доступа", 403)

        const questions = (Array.isArray(row.questions) ? row.questions : []) as Question[]
        const sections = questionsToSections(questions, row.name)
        const newLength = sectionToLength(to as "demo" | "block" | "test")

        const [created] = await tx
          .insert(demoTemplates)
          .values({
            tenantId: user.companyId,
            name: row.name,
            niche: "universal",
            length: newLength,
            isSystem: false,
            sections,
          })
          .returning()

        // Soft-delete исходной анкеты
        await tx
          .update(questionnaireTemplates)
          .set({ deletedAt: new Date() })
          .where(eq(questionnaireTemplates.id, id))

        return { id: created.id, to }
      })
      return apiSuccess(result)
    }

    // ── Случай 3: demo/block/test → anketa ──────────────────────────────────
    if (MATERIAL_SECTIONS.includes(from) && to === "anketa") {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(demoTemplates)
          .where(eq(demoTemplates.id, id))
          .limit(1)

        if (!row) throw apiError("Материал не найден", 404)
        if (row.isSystem) throw apiError("Системные материалы нельзя перемещать", 403)
        if (row.tenantId !== user.companyId) throw apiError("Нет доступа", 403)

        const sections = (Array.isArray(row.sections) ? row.sections : []) as Lesson[]
        const questions = sectionsToQuestions(sections)

        const [created] = await tx
          .insert(questionnaireTemplates)
          .values({
            tenantId: user.companyId,
            name: row.name,
            type: "candidate",
            questions,
            isSystem: false,
          })
          .returning()

        // Soft-delete исходного материала
        await tx
          .update(demoTemplates)
          .set({ deletedAt: new Date() })
          .where(eq(demoTemplates.id, id))

        return { id: created.id, to }
      })
      return apiSuccess(result)
    }

    return apiError("Неизвестная комбинация from/to", 400)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[library/move POST]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
