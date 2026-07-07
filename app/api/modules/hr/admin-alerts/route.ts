// GET /api/modules/hr/admin-alerts
//
// Открытые алерты «Сторожа найма» (admin_alerts) для баннера
// components/dashboard/admin-alerts-banner.tsx — тонкий поллинг раз в 60с.
//
// Видимость: директор компании (requireDirector) видит company-level алерты
// своей компании (companyId = user.companyId). Платформенные (companyId=NULL)
// видит ТОЛЬКО platform_admin — обычный HR/директор клиента их не должен
// видеть (это внутренняя эксплуатационная информация платформы, не про
// его компанию). Директор без platform_admin получает только свои.
//
// Легковесный ответ: count + первые 3 (баннер большего не показывает).
import { NextRequest } from "next/server"
import { and, eq, or, isNull, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminAlerts } from "@/lib/db/schema"
import { requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

const PREVIEW_LIMIT = 3

export async function GET(_req: NextRequest) {
  try {
    const user = await requireDirector()
    const isPlatformAdmin = isPlatformAdminEmail(user.email)

    const visibilityFilter = isPlatformAdmin
      ? or(eq(adminAlerts.companyId, user.companyId), isNull(adminAlerts.companyId))
      : eq(adminAlerts.companyId, user.companyId)

    const rows = await db
      .select({
        id:         adminAlerts.id,
        companyId:  adminAlerts.companyId,
        severity:   adminAlerts.severity,
        title:      adminAlerts.title,
        message:    adminAlerts.message,
        actionUrl:  adminAlerts.actionUrl,
        createdAt:  adminAlerts.createdAt,
      })
      .from(adminAlerts)
      .where(and(eq(adminAlerts.status, "open"), visibilityFilter))
      .orderBy(
        // critical → warning → info, затем свежие сверху. text-сортировка
        // 'severity' ASC/DESC не даёт нужный порядок (алфавит), поэтому явный CASE.
        sql`CASE ${adminAlerts.severity} WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`,
        desc(adminAlerts.createdAt),
      )

    return apiSuccess({
      count: rows.length,
      alerts: rows.slice(0, PREVIEW_LIMIT),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[GET admin-alerts]", err)
    return apiError("Internal server error", 500)
  }
}
