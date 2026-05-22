// GET / PUT /api/modules/hr/vacancies/[id]/offer
// Конфиг блока «Оффер» (Группа 19).
// Хранится в vacancies.descriptionJson.offer.

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export interface OfferConfig {
  templateText:     string
  requireSignature: boolean
}

const MAX_TEMPLATE = 10_000

const DEFAULT_TEMPLATE = `Здравствуйте, {{name}}!

Рады предложить вам позицию «{{position}}» в нашей компании.

Условия:
- Заработная плата: {{salary}}
- Дата выхода: {{startDate}}

Если согласны — подпишите оффер.`

function sanitize(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_TEMPLATE) : ""
}

function readConfig(dj: unknown): OfferConfig | null {
  if (!dj || typeof dj !== "object") return null
  const o = (dj as Record<string, unknown>).offer
  if (!o || typeof o !== "object") return null
  const obj = o as Record<string, unknown>
  return {
    templateText:     typeof obj.templateText === "string" ? obj.templateText : DEFAULT_TEMPLATE,
    requireSignature: obj.requireSignature === true,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const [row] = await db
      .select({ descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Vacancy not found", 404)
    return apiSuccess({ config: readConfig(row.descriptionJson), defaultTemplate: DEFAULT_TEMPLATE })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as Partial<OfferConfig>

    const [existing] = await db
      .select({ descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const currentJson = (existing.descriptionJson && typeof existing.descriptionJson === "object" && existing.descriptionJson !== null)
      ? existing.descriptionJson as Record<string, unknown>
      : {}

    const nextConfig: OfferConfig = {
      templateText:     sanitize(body.templateText) || DEFAULT_TEMPLATE,
      requireSignature: body.requireSignature === true,
    }

    const nextJson = { ...currentJson, offer: nextConfig }

    await db
      .update(vacancies)
      .set({ descriptionJson: nextJson, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))

    return apiSuccess({ ok: true, config: nextConfig })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
