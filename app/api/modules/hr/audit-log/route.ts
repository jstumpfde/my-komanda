import { NextRequest } from "next/server"
import { eq, desc, and, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// ФЗ-152: чтение журнала аудита. Только администратор/директор тенанта.
// GET /api/modules/hr/audit-log?action=&limit=
const VIEW_ROLES = new Set<string>([
  "platform_admin", "admin", "platform_manager", "manager", "director", "client",
])

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    if (!VIEW_ROLES.has(String(user.role))) {
      return apiError("Недостаточно прав для просмотра журнала аудита", 403)
    }
    const { searchParams } = new URL(req.url)
    const action = searchParams.get("action")
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1), 500)

    const conds: SQL[] = [eq(auditLog.tenantId, user.companyId)]
    if (action) conds.push(eq(auditLog.action, action))

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conds))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)

    return apiSuccess({ entries: rows })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
