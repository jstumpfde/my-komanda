import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { auditLog, users } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/clients/[id]/activity — последние 50 событий аудита компании
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const { id } = await params

  try {
    const rows = await db
      .select({
        id:         auditLog.id,
        action:     auditLog.action,
        entityType: auditLog.entityType,
        entityId:   auditLog.entityId,
        count:      auditLog.count,
        meta:       auditLog.meta,
        ip:         auditLog.ip,
        createdAt:  auditLog.createdAt,
        userId:     auditLog.userId,
        userEmail:  auditLog.userEmail,
        userName:   users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.tenantId, id))
      .orderBy(desc(auditLog.createdAt))
      .limit(50)

    return apiSuccess(rows)
  } catch (err) {
    console.error("[admin/clients/activity GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
