// GET /api/modules/ai-rop/managers — менеджеры со статистикой (кол-во звонков),
// флагом видимости в отчётах, закреплённым продуктом и переносом в CRM.
// PATCH — обновить is_active/excluded_from_reports/default_product/crm_sync_enabled.
//
// excluded_from_reports НЕ перезатирается синком менеджеров из Bitrix (managers.ts) —
// это ручная HR-настройка.
import { NextResponse } from "next/server"
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, ropManagers, ropSalesScripts } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"
import { requireRopManage, requireRopTeam, ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"
import { ropCallsScope, type RopScope } from "@/lib/ai-rop/rls"

export async function GET() {
  try {
    const user = await requireRopTeam()
    const scope: RopScope = {
      companyId: user.companyId,
      isTeamViewer: ropCanViewTeam(user),
      bitrixManagerId: null,
    }
    if (!scope.isTeamViewer) scope.bitrixManagerId = await ropManagerScope(user)

    const rows = await db
      .select({
        id: ropCalls.managerId,
        name: sql<string>`COALESCE(MAX(${ropCalls.managerName}), MAX(${ropManagers.name}), '')`,
        email: sql<string | null>`MAX(${ropManagers.email})`,
        isActive: sql<boolean>`COALESCE(BOOL_OR(${ropManagers.isActive}), true)`,
        excludedFromReports: sql<boolean>`COALESCE(BOOL_OR(${ropManagers.excludedFromReports}), false)`,
        defaultProduct: sql<string | null>`MAX(${ropManagers.defaultProduct})`,
        crmSyncEnabled: sql<boolean>`COALESCE(BOOL_OR(${ropManagers.crmSyncEnabled}), false)`,
        calls: sql<number>`COUNT(*)::int`,
      })
      .from(ropCalls)
      .leftJoin(ropManagers, and(eq(ropManagers.tenantId, ropCalls.tenantId), eq(ropManagers.bitrixManagerId, ropCalls.managerId)))
      .where(and(ropCallsScope(scope), isNotNull(ropCalls.managerId), ne(ropCalls.managerId, "")))
      .groupBy(ropCalls.managerId)
      .orderBy(desc(sql`COUNT(*)`))

    return NextResponse.json({ ok: true, items: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/managers] GET error:", err)
    return apiError("Internal server error", 500)
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRopManage()
    const body = (await req.json().catch(() => ({}))) as {
      id?: string
      is_active?: boolean
      excluded_from_reports?: boolean
      default_product?: string | null
      crm_sync_enabled?: boolean
    }
    const { id } = body
    if (!id) return apiError("id обязателен", 400)

    let validatedProduct: string | null | undefined
    if ("default_product" in body) {
      const raw = (body.default_product ?? "").toString().trim()
      if (!raw) {
        validatedProduct = null
      } else {
        const [known] = await db
          .select({ id: ropSalesScripts.id })
          .from(ropSalesScripts)
          .where(and(eq(ropSalesScripts.tenantId, user.companyId), eq(ropSalesScripts.product, raw), eq(ropSalesScripts.isActive, true)))
          .limit(1)
        if (!known) return apiError(`Неизвестный продукт: ${raw}`, 400)
        validatedProduct = raw
      }
    }

    const [current] = await db
      .select({
        isActive: ropManagers.isActive,
        excludedFromReports: ropManagers.excludedFromReports,
        defaultProduct: ropManagers.defaultProduct,
        crmSyncEnabled: ropManagers.crmSyncEnabled,
      })
      .from(ropManagers)
      .where(and(eq(ropManagers.tenantId, user.companyId), eq(ropManagers.bitrixManagerId, id)))
      .limit(1)

    const nextActive = "is_active" in body ? !!body.is_active : current ? !!current.isActive : true
    const nextExcluded = "excluded_from_reports" in body ? !!body.excluded_from_reports : current ? !!current.excludedFromReports : false
    const nextProduct = validatedProduct !== undefined ? validatedProduct : current?.defaultProduct ?? null
    const nextCrmSync = "crm_sync_enabled" in body ? !!body.crm_sync_enabled : current ? !!current.crmSyncEnabled : false

    await db
      .insert(ropManagers)
      .values({
        tenantId: user.companyId,
        bitrixManagerId: id,
        isActive: nextActive,
        excludedFromReports: nextExcluded,
        defaultProduct: nextProduct,
        crmSyncEnabled: nextCrmSync,
      })
      .onConflictDoUpdate({
        target: [ropManagers.tenantId, ropManagers.bitrixManagerId],
        set: {
          isActive: nextActive,
          excludedFromReports: nextExcluded,
          defaultProduct: nextProduct,
          crmSyncEnabled: nextCrmSync,
          updatedAt: new Date(),
        },
      })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/managers] PATCH error:", err)
    return apiError("Internal server error", 500)
  }
}
