import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { salesSettings } from "@/lib/db/schema"
import { requireCompany, requireDirector, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  type FunnelType,
  type CrmStage,
  normalizeStages,
  getDefaultStages,
} from "@/lib/crm/deal-stages"

// Эффективный объект настроек CRM для тенанта (с подставленными дефолтами).
function resolveSettings(row: typeof salesSettings.$inferSelect | undefined) {
  const funnelType: FunnelType = (row?.funnelType as FunnelType) ?? "booking"
  return {
    funnelType,
    stages: normalizeStages(row?.stages ?? null, funnelType),
    leadSources: (row?.leadSources as string[] | null) ?? null,
    automations: (row?.automations as unknown[] | null) ?? null,
    slotStepMinutes: row?.slotStepMinutes ?? 30,
    bookAheadDays: row?.bookAheadDays ?? 14,
  }
}

// ---------------------------------------------------------------------------
// GET — настройки CRM тенанта (с дефолтами, без создания строки)
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const user = await requireCompany()
    const [row] = await db
      .select()
      .from(salesSettings)
      .where(eq(salesSettings.tenantId, user.companyId))
      .limit(1)
    return apiSuccess(resolveSettings(row))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ---------------------------------------------------------------------------
// PUT — upsert настроек (только директор). При смене типа воронки без явного
// набора стадий — подставляем дефолт нового типа.
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  try {
    const user = await requireDirector()
    const body = (await req.json()) as {
      funnelType?: FunnelType
      stages?: CrmStage[]
      leadSources?: string[]
      automations?: unknown[]
      slotStepMinutes?: number
      bookAheadDays?: number
    }

    const now = new Date()
    const funnelType: FunnelType = body.funnelType === "b2b" ? "b2b" : "booking"
    // Если стадии не переданы явно — берём дефолт выбранного типа.
    const stages = body.stages !== undefined
      ? normalizeStages(body.stages, funnelType)
      : getDefaultStages(funnelType)
    // Шаг слота: допустимые значения 5..120 мин; дни вперёд: 1..90.
    const clampInt = (v: unknown, min: number, max: number, def: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def
    const slotStepMinutes = body.slotStepMinutes !== undefined ? clampInt(body.slotStepMinutes, 5, 120, 30) : undefined
    const bookAheadDays = body.bookAheadDays !== undefined ? clampInt(body.bookAheadDays, 1, 90, 14) : undefined

    const [upserted] = await db
      .insert(salesSettings)
      .values({
        tenantId: user.companyId,
        funnelType,
        stages,
        leadSources: body.leadSources ?? null,
        automations: body.automations ?? null,
        slotStepMinutes: slotStepMinutes ?? 30,
        bookAheadDays: bookAheadDays ?? 14,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: salesSettings.tenantId,
        set: {
          funnelType,
          ...(body.stages !== undefined && { stages }),
          ...(body.leadSources !== undefined && { leadSources: body.leadSources }),
          ...(body.automations !== undefined && { automations: body.automations }),
          ...(slotStepMinutes !== undefined && { slotStepMinutes }),
          ...(bookAheadDays !== undefined && { bookAheadDays }),
          updatedAt: now,
        },
      })
      .returning()

    return apiSuccess(resolveSettings(upserted))
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// ---------------------------------------------------------------------------
// DELETE — сброс к дефолтам (удаляем строку). Только директор.
// ---------------------------------------------------------------------------
export async function DELETE() {
  try {
    const user = await requireDirector()
    await db.delete(salesSettings).where(eq(salesSettings.tenantId, user.companyId))
    return apiSuccess({ message: "Настройки CRM сброшены до значений по умолчанию" })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
