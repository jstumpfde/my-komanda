// GET/PUT/DELETE /api/modules/pricing/objects/[id] — детали, настройки, удаление.
// Tenant-изоляция: объект должен принадлежать company_id текущего пользователя.
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { priceMonitorObjects, priceMonitorSettings, type PriceMonitorObjectSettings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { assertPriceMonitorModule } from "@/lib/price-monitor/entitlement"
import { getEffectiveSettings } from "@/lib/price-monitor/run-monitor"
import { loadLatestOccupancy } from "@/lib/price-monitor/occupancy"

async function loadOwnedObject(companyId: string, id: string) {
  const [object] = await db
    .select()
    .from(priceMonitorObjects)
    .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, companyId)))
    .limit(1)
  return object ?? null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    await assertPriceMonitorModule(user.companyId)
    const { id } = await ctx.params
    const object = await loadOwnedObject(user.companyId, id)
    if (!object) return apiError("Объект не найден", 404)

    const [companySettings] = await db
      .select()
      .from(priceMonitorSettings)
      .where(eq(priceMonitorSettings.companyId, user.companyId))
      .limit(1)

    const effectiveSettings = getEffectiveSettings(object, companySettings ?? null)
    const occupancy = await loadLatestOccupancy(object.id)

    return apiSuccess({ object, companySettings: companySettings ?? null, effectiveSettings, occupancy })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// Валидация settingsJson по типу PriceMonitorObjectSettings. Все поля
// опциональны; при наличии — проверяем диапазоны/формат.
function validateSettingsJson(input: unknown): { ok: true; value: PriceMonitorObjectSettings } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: {} }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "settingsJson должен быть объектом" }
  }
  const raw = input as Record<string, unknown>
  const value: PriceMonitorObjectSettings = {}

  if (raw.radiusM !== undefined) {
    const n = raw.radiusM
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      return { ok: false, error: "radiusM должен быть положительным числом" }
    }
    value.radiusM = n
  }

  if (raw.leadDays !== undefined) {
    const n = raw.leadDays
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 90) {
      return { ok: false, error: "leadDays должен быть целым числом от 0 до 90" }
    }
    value.leadDays = n
  }

  if (raw.periods !== undefined) {
    if (!Array.isArray(raw.periods) || raw.periods.length === 0) {
      return { ok: false, error: "periods должен быть непустым массивом чисел" }
    }
    for (const p of raw.periods) {
      if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 365) {
        return { ok: false, error: "periods: каждое значение должно быть целым числом от 1 до 365" }
      }
    }
    value.periods = raw.periods as number[]
  }

  if (raw.complexFilter !== undefined) {
    if (raw.complexFilter !== null && typeof raw.complexFilter !== "string") {
      return { ok: false, error: "complexFilter должен быть строкой" }
    }
    value.complexFilter = raw.complexFilter as string | undefined
  }

  if (raw.autoDiscover !== undefined) {
    if (typeof raw.autoDiscover !== "boolean") {
      return { ok: false, error: "autoDiscover должен быть булевым значением" }
    }
    value.autoDiscover = raw.autoDiscover
  }

  if (raw.schedule !== undefined) {
    if (typeof raw.schedule !== "object" || raw.schedule === null || Array.isArray(raw.schedule)) {
      return { ok: false, error: "schedule должен быть объектом" }
    }
    const sched = raw.schedule as Record<string, unknown>
    const schedule: NonNullable<PriceMonitorObjectSettings["schedule"]> = {}
    if (sched.intervalMinutes !== undefined) {
      if (sched.intervalMinutes !== null && (typeof sched.intervalMinutes !== "number" || sched.intervalMinutes <= 0)) {
        return { ok: false, error: "schedule.intervalMinutes должен быть положительным числом или null" }
      }
      schedule.intervalMinutes = sched.intervalMinutes as number | null
    }
    if (sched.runAtTime !== undefined) {
      if (sched.runAtTime !== null && (typeof sched.runAtTime !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(sched.runAtTime))) {
        return { ok: false, error: "schedule.runAtTime должен быть в формате HH:MM или null" }
      }
      schedule.runAtTime = sched.runAtTime as string | null
    }
    value.schedule = schedule
  }

  return { ok: true, value }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    await assertPriceMonitorModule(user.companyId)
    const { id } = await ctx.params
    const object = await loadOwnedObject(user.companyId, id)
    if (!object) return apiError("Объект не найден", 404)

    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      complexName?: string | null
      isActive?: boolean
      settingsJson?: unknown
    }

    const patch: Partial<typeof priceMonitorObjects.$inferInsert> = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return apiError("Название не может быть пустым", 400)
      patch.name = name
    }

    if (body.complexName !== undefined) {
      patch.complexName = body.complexName?.trim() || null
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") return apiError("isActive должен быть булевым значением", 400)
      patch.isActive = body.isActive
    }

    if (body.settingsJson !== undefined) {
      const validated = validateSettingsJson(body.settingsJson)
      if (!validated.ok) return apiError(validated.error, 400)
      patch.settingsJson = validated.value
    }

    if (Object.keys(patch).length === 0) {
      return apiSuccess({ object })
    }

    const [updated] = await db
      .update(priceMonitorObjects)
      .set(patch)
      .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, user.companyId)))
      .returning()

    return apiSuccess({ object: updated })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    await assertPriceMonitorModule(user.companyId)
    const { id } = await ctx.params
    const object = await loadOwnedObject(user.companyId, id)
    if (!object) return apiError("Объект не найден", 404)

    await db
      .delete(priceMonitorObjects)
      .where(and(eq(priceMonitorObjects.id, id), eq(priceMonitorObjects.companyId, user.companyId)))

    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
