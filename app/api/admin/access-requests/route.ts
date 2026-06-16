import { NextRequest } from "next/server"
import { and, desc, eq, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { accessRequests } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"
import { apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/access-requests
//   ?status=new|contacted|approved|rejected
//   ?requestType=access|demo|...
//
// Заявки на регистрацию/доступ (таблица access_requests). Видны только
// платформенному оператору: пускаем по платформенной роли ИЛИ по email из
// PLATFORM_ADMIN_EMAILS (тот же гейт, что и у /admin layout — иначе
// владелец-директор с whitelisted-email получил бы 403).
export async function GET(req: NextRequest) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return apiError("Unauthorized", 401)
  }

  const status = req.nextUrl.searchParams.get("status")
  const requestType = req.nextUrl.searchParams.get("requestType")

  const conds: SQL[] = []
  if (status) conds.push(eq(accessRequests.status, status))
  if (requestType) conds.push(eq(accessRequests.requestType, requestType))

  try {
    const rows = await db
      .select()
      .from(accessRequests)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(accessRequests.createdAt))
      .limit(300)

    return apiSuccess(rows)
  } catch (err) {
    console.error("[admin/access-requests GET]", err)
    return apiError("Internal server error", 500)
  }
}
