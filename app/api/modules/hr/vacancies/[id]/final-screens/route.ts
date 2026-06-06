// PUT/PATCH /api/modules/hr/vacancies/[id]/final-screens
// Body: { afterVideo?: {title, subtitle, button}, afterAnketa?: {title, subtitle} }
// Сохраняет в vacancies.descriptionJson.finalScreens (#16/#25).
//
// afterVideo  — промежуточный экран после прохождения видео-уроков и
//               видео-визитки, ДО анкеты. Заголовок + подзаголовок + кнопка.
// afterAnketa — финальный экран ПОСЛЕ отправки анкеты. Заголовок + текст.
//
// Пустые поля валидны → пусть UI применит дефолт.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

interface AfterVideoCfg { title?: string; subtitle?: string; button?: string }
interface AfterAnketaCfg { title?: string; subtitle?: string }

const MAX = 500

function sanitize(v: unknown): string {
  if (typeof v !== "string") return ""
  return v.slice(0, MAX)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as {
      afterVideo?:  AfterVideoCfg
      afterAnketa?: AfterAnketaCfg
    }

    const [existing] = await db
      .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const currentJson = (existing.descriptionJson && typeof existing.descriptionJson === "object" && existing.descriptionJson !== null)
      ? existing.descriptionJson as Record<string, unknown>
      : {}
    const currentScreens = (currentJson.finalScreens && typeof currentJson.finalScreens === "object" && currentJson.finalScreens !== null)
      ? currentJson.finalScreens as { afterVideo?: AfterVideoCfg; afterAnketa?: AfterAnketaCfg }
      : {}

    const nextScreens = { ...currentScreens }
    if (body.afterVideo !== undefined) {
      nextScreens.afterVideo = {
        title:    sanitize(body.afterVideo?.title),
        subtitle: sanitize(body.afterVideo?.subtitle),
        button:   sanitize(body.afterVideo?.button),
      }
    }
    if (body.afterAnketa !== undefined) {
      nextScreens.afterAnketa = {
        title:    sanitize(body.afterAnketa?.title),
        subtitle: sanitize(body.afterAnketa?.subtitle),
      }
    }

    const nextJson = { ...currentJson, finalScreens: nextScreens }

    await db
      .update(vacancies)
      .set({ descriptionJson: nextJson, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))

    return apiSuccess({ ok: true, finalScreens: nextScreens })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
