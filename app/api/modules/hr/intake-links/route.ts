import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancyIntakeLinks } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — list intake links for tenant
export async function GET() {
  try {
    const user = await requireCompany()
    const links = await db
      .select()
      .from(vacancyIntakeLinks)
      .where(eq(vacancyIntakeLinks.tenantId, user.companyId))
      .orderBy(vacancyIntakeLinks.createdAt)
    return apiSuccess(links)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST — create new intake link
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { password?: string; expiresInDays?: number; reusable?: boolean }

    const token = nanoid(16)
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const [link] = await db
      .insert(vacancyIntakeLinks)
      .values({
        tenantId: user.companyId,
        token,
        createdBy: user.id!,
        password: body.password || null,
        expiresAt,
        reusable: body.reusable ?? false,
        status: "active",
      })
      .returning()

    return apiSuccess(link, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
