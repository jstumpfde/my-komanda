import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { vacancyGuestLinks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Генерирует читаемый пароль из 8 символов (base36) для защиты guest-view
// ссылок по умолчанию. HR может передать свой пароль в теле запроса.
function generateDefaultPassword(): string {
  return randomBytes(4).toString("hex") // 8 hex-символов, напр. "a3f1c8b2"
}

// POST — create guest link for a vacancy
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { vacancyId: string; password?: string; noPassword?: boolean; expiresInDays?: number }

    if (!body.vacancyId) return apiError("vacancyId обязателен", 400)

    const token = nanoid(16)
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    // Пароль обязателен по умолчанию (security S-6): AI-оценки кандидатов
    // доступны по ссылке. Если HR явно передал noPassword=true — ссылка
    // без пароля (вызывающая сторона осознанно снимает защиту).
    const password = body.noPassword === true
      ? null
      : (body.password?.trim() || generateDefaultPassword())

    const [link] = await db
      .insert(vacancyGuestLinks)
      .values({
        vacancyId: body.vacancyId,
        tenantId: user.companyId,
        token,
        password,
        expiresAt,
      })
      .returning()

    return apiSuccess(link, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// GET — list guest links for a vacancy
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancy_id")
    if (!vacancyId) return apiError("vacancy_id обязателен", 400)

    const links = await db
      .select()
      .from(vacancyGuestLinks)
      .where(and(eq(vacancyGuestLinks.vacancyId, vacancyId), eq(vacancyGuestLinks.tenantId, user.companyId)))

    return apiSuccess(links)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
