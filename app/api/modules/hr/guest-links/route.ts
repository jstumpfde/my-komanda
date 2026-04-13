import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancyGuestLinks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// POST — create guest link for a vacancy
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { vacancyId: string; password?: string; expiresInDays?: number }

    if (!body.vacancyId) return apiError("vacancyId обязателен", 400)

    const token = nanoid(16)
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const [link] = await db
      .insert(vacancyGuestLinks)
      .values({
        vacancyId: body.vacancyId,
        tenantId: user.companyId,
        token,
        password: body.password || null,
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
