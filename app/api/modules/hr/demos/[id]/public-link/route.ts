import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { demos, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// Длина публичного секрета — ≥24 симв. по спеке (angle brackets безопасности,
// см. drizzle/0278). nanoid по умолчанию — URL-safe алфавит (A-Za-z0-9_-).
const PUBLIC_TOKEN_LEN = 28

// Верификация принадлежности блока компании — тот же паттерн, что
// getOwnedDemo в app/api/modules/hr/demos/[id]/route.ts (не экспортирован
// оттуда, поэтому здесь свой минимальный select).
async function getOwnedDemoForLink(demoId: string, companyId: string) {
  const [row] = await db
    .select({
      id: demos.id,
      publicToken: demos.publicToken,
    })
    .from(demos)
    .innerJoin(vacancies, eq(demos.vacancyId, vacancies.id))
    .where(and(eq(demos.id, demoId), eq(vacancies.companyId, companyId)))
    .limit(1)
  return row ?? null
}

// POST /api/modules/hr/demos/[id]/public-link
// Идемпотентно: если public_token уже сгенерирован — отдаём тот же URL.
// Иначе генерируем случайный токен и сохраняем (retry на маловероятный
// конфликт уникальности).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const existing = await getOwnedDemoForLink(id, user.companyId)
    if (!existing) return apiError("Блок не найден", 404)

    if (existing.publicToken) {
      return apiSuccess({ token: existing.publicToken, url: `${getAppBaseUrl()}/start/${existing.publicToken}` })
    }

    let token = ""
    let saved = false
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      token = nanoid(PUBLIC_TOKEN_LEN)
      try {
        await db.update(demos).set({ publicToken: token }).where(eq(demos.id, id))
        saved = true
      } catch (err) {
        // Уникальный конфликт (крайне маловероятен) — пробуем снова с новым токеном.
        if (attempt === 2) throw err
      }
    }

    return apiSuccess({ token, url: `${getAppBaseUrl()}/start/${token}` })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[demos/[id]/public-link POST] error:", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
