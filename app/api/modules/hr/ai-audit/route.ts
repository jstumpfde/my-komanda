import { NextRequest } from "next/server"
import { eq, desc, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiAuditLog } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// GET — list AI audit logs
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancy_id")
    const action = req.nextUrl.searchParams.get("action")
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200)

    const conditions = [eq(aiAuditLog.tenantId, user.companyId)]
    if (vacancyId) conditions.push(eq(aiAuditLog.vacancyId, vacancyId))
    if (action) conditions.push(eq(aiAuditLog.action, action))

    const logs = await db
      .select()
      .from(aiAuditLog)
      .where(and(...conditions))
      .orderBy(desc(aiAuditLog.createdAt))
      .limit(limit)

    return apiSuccess(logs)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
