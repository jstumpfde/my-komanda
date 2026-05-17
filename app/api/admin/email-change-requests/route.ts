import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { supportRequests, users, companies } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// GET /api/admin/email-change-requests
//   ?status=new|done|rejected  (default new)
//
// Возвращает запросы из support_requests с type='email_change' плюс
// денормализованные данные о пользователе и его компании — чтобы
// admin-таблица в одном запросе видела «кто запросил».
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const status = req.nextUrl.searchParams.get("status") ?? "new"

  try {
    const rows = await db
      .select({
        id:           supportRequests.id,
        createdAt:    supportRequests.createdAt,
        status:       supportRequests.status,
        data:         supportRequests.data,
        userId:       users.id,
        userName:     users.name,
        userEmail:    users.email,
        userRole:     users.role,
        companyId:    companies.id,
        companyName:  companies.name,
      })
      .from(supportRequests)
      .innerJoin(users, eq(users.id, supportRequests.userId))
      .leftJoin(companies, eq(companies.id, supportRequests.tenantId))
      .where(and(
        eq(supportRequests.type, "email_change"),
        eq(supportRequests.status, status),
      ))
      .orderBy(desc(supportRequests.createdAt))
      .limit(200)

    return apiSuccess(rows)
  } catch (err) {
    console.error("[admin/email-change-requests GET]", err)
    return apiError("Internal server error", 500)
  }
}
