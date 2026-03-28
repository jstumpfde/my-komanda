import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenantModules, modules } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

interface Body {
  moduleId: string
  action: "activate" | "deactivate"
  limits?: {
    maxVacancies?: number | null
    maxCandidates?: number | null
    maxEmployees?: number | null
    maxScenarios?: number | null
    maxUsers?: number | null
  }
}

// POST /api/admin/tenant/[tenantId]/modules — подключить/отключить модуль клиенту
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    await requirePlatformAdmin()
    const { tenantId } = await params

    const body = await req.json() as Body
    const { moduleId, action, limits } = body

    if (!moduleId || !action) {
      return apiError("moduleId и action обязательны", 400)
    }
    if (action !== "activate" && action !== "deactivate") {
      return apiError("action должен быть 'activate' или 'deactivate'", 400)
    }

    // Проверяем что модуль существует
    const [mod] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.id, moduleId))
      .limit(1)

    if (!mod) return apiError("Модуль не найден", 404)

    if (action === "activate") {
      await db
        .insert(tenantModules)
        .values({
          tenantId,
          moduleId,
          isActive: true,
          activatedAt: new Date(),
          maxVacancies:  limits?.maxVacancies  ?? null,
          maxCandidates: limits?.maxCandidates ?? null,
          maxEmployees:  limits?.maxEmployees  ?? null,
          maxScenarios:  limits?.maxScenarios  ?? null,
          maxUsers:      limits?.maxUsers      ?? null,
        })
        .onConflictDoUpdate({
          target: [tenantModules.tenantId, tenantModules.moduleId],
          set: {
            isActive: true,
            activatedAt: new Date(),
            maxVacancies:  limits?.maxVacancies  ?? null,
            maxCandidates: limits?.maxCandidates ?? null,
            maxEmployees:  limits?.maxEmployees  ?? null,
            maxScenarios:  limits?.maxScenarios  ?? null,
            maxUsers:      limits?.maxUsers      ?? null,
          },
        })
    } else {
      await db
        .update(tenantModules)
        .set({ isActive: false })
        .where(
          and(
            eq(tenantModules.tenantId, tenantId),
            eq(tenantModules.moduleId, moduleId),
          )
        )
    }

    return apiSuccess({ tenantId, moduleId, action })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[admin/tenant/modules POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
