// Управление публичной ссылкой на «Отчёт по найму».
//   GET    — текущий активный токен компании (или null)
//   POST   — создать/перегенерировать (отзывает старый активный)
//   DELETE — отозвать активный токен
// Создание/отзыв публичной ссылки — действие уровня директора.
import { randomBytes } from "crypto"
import { and, eq, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { reportShares } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"

async function activeToken(companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: reportShares.token })
    .from(reportShares)
    .where(and(eq(reportShares.companyId, companyId), isNull(reportShares.revokedAt)))
    .orderBy(desc(reportShares.createdAt))
    .limit(1)
  return row?.token ?? null
}

export async function GET() {
  try {
    const user = await requireCompany()
    return apiSuccess({ token: await activeToken(user.companyId) })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST() {
  try {
    const user = await requireDirector()
    const companyId = user.companyId as string

    // Отзываем все старые активные токены (один активный на компанию).
    await db
      .update(reportShares)
      .set({ revokedAt: new Date() })
      .where(and(eq(reportShares.companyId, companyId), isNull(reportShares.revokedAt)))

    const token = randomBytes(18).toString("base64url")
    await db.insert(reportShares).values({
      token,
      companyId,
      createdBy: user.id ?? null,
    })
    return apiSuccess({ token })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function DELETE() {
  try {
    const user = await requireDirector()
    await db
      .update(reportShares)
      .set({ revokedAt: new Date() })
      .where(and(eq(reportShares.companyId, user.companyId as string), isNull(reportShares.revokedAt)))
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
