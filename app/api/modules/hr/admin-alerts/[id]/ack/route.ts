// POST /api/modules/hr/admin-alerts/[id]/ack
//
// Директор помечает алерт «принято» (acked). Не resolved — статус остаётся
// видимым для истории/аудита, но пропадает из баннера (баннер фильтрует
// status='open' в GET /api/modules/hr/admin-alerts). Тенант-изоляция:
// company-level алерт — только своя компания; платформенный (companyId=NULL)
// — только platform_admin.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminAlerts } from "@/lib/db/schema"
import { requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDirector()
    const { id } = await params

    const [alert] = await db
      .select({ id: adminAlerts.id, companyId: adminAlerts.companyId, status: adminAlerts.status })
      .from(adminAlerts)
      .where(eq(adminAlerts.id, id))
      .limit(1)
    if (!alert) return apiError("Алерт не найден", 404)

    const isPlatformAlert = alert.companyId === null
    if (isPlatformAlert) {
      if (!isPlatformAdminEmail(user.email)) return apiError("Алерт не найден", 404)
    } else if (alert.companyId !== user.companyId) {
      return apiError("Алерт не найден", 404)
    }

    if (alert.status !== "open") {
      return apiSuccess({ id: alert.id, status: alert.status })
    }

    await db
      .update(adminAlerts)
      .set({ status: "acked", ackedAt: new Date(), ackedBy: user.id })
      .where(and(eq(adminAlerts.id, id), eq(adminAlerts.status, "open")))

    return apiSuccess({ id, status: "acked" })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST admin-alerts/ack]", err)
    return apiError("Internal server error", 500)
  }
}
