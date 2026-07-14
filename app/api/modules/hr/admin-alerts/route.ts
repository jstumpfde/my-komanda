// GET /api/modules/hr/admin-alerts
//
// Открытые алерты «Сторожа найма» (admin_alerts) для баннера
// components/dashboard/admin-alerts-banner.tsx — тонкий поллинг раз в 60с.
//
// Видимость (Юрий 14.07): эти алерты — внутренняя эксплуатационная
// информация о технических сбоях платформы (hh-синк, AI-скоринг, рассинхрон
// стадий), а НЕ то, что требует действия обычного HR/директора компании —
// даже если алерт формально company-scoped (companyId = их компания), он
// путает и пугает клиента больше, чем помогает. Поэтому видимость СТРОГО
// platform admin (PLATFORM_ADMIN_EMAILS) — и для платформенных (companyId
// =NULL), и для company-scoped алертов. Директор без platform_admin получает
// пустой список (тихое скрытие, баннер просто не рендерится — не 403/404,
// чтобы не обнаруживать наличие фичи).
//
// Легковесный ответ: count + первые 3 (баннер большего не показывает).
import { NextRequest } from "next/server"
import { eq, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminAlerts } from "@/lib/db/schema"
import { requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export const dynamic = "force-dynamic"

const PREVIEW_LIMIT = 3

export async function GET(_req: NextRequest) {
  try {
    const user = await requireDirector()
    if (!isPlatformAdminEmail(user.email)) {
      return apiSuccess({ count: 0, alerts: [] })
    }

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
      .where(eq(adminAlerts.status, "open"))
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
