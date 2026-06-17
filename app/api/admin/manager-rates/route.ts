import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { managerCommissionRates } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

const VALID_ROLES = new Set(["sales_manager", "account_manager"])

const DEFAULTS = [
  { role: "sales_manager",   salePercent: "10", accompanimentPercent: "5" },
  { role: "account_manager", salePercent: "0",  accompanimentPercent: "5" },
]

// GET /api/admin/manager-rates
// Возвращает ставки комиссий менеджеров платформы.
// Если строки в таблице отсутствуют — возвращает захардкоженные дефолты.
export async function GET() {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  const rows = await db
    .select({
      role:                 managerCommissionRates.role,
      salePercent:          managerCommissionRates.salePercent,
      accompanimentPercent: managerCommissionRates.accompanimentPercent,
    })
    .from(managerCommissionRates)

  const rates = rows.length > 0 ? rows : DEFAULTS

  return apiSuccess({ rates })
}

// PUT /api/admin/manager-rates
// Upsert ставки для одной роли.
// Body: { role: string, salePercent: number|string, accompanimentPercent: number|string }
export async function PUT(req: NextRequest) {
  try {
    await requirePlatformAdmin()
  } catch (e) {
    return e as Response
  }

  let body: { role?: unknown; salePercent?: unknown; accompanimentPercent?: unknown }
  try {
    body = await req.json()
  } catch {
    return apiError("Некорректный JSON", 400)
  }

  const { role, salePercent, accompanimentPercent } = body

  if (typeof role !== "string" || !VALID_ROLES.has(role)) {
    return apiError("role должен быть 'sales_manager' или 'account_manager'", 400)
  }

  const saleNum = Number(salePercent)
  const accompNum = Number(accompanimentPercent)

  if (isNaN(saleNum) || saleNum < 0 || saleNum > 100) {
    return apiError("salePercent должен быть числом от 0 до 100", 400)
  }
  if (isNaN(accompNum) || accompNum < 0 || accompNum > 100) {
    return apiError("accompanimentPercent должен быть числом от 0 до 100", 400)
  }

  const now = new Date()

  const [updated] = await db
    .insert(managerCommissionRates)
    .values({
      role,
      salePercent:          String(saleNum),
      accompanimentPercent: String(accompNum),
      updatedAt:            now,
    })
    .onConflictDoUpdate({
      target: managerCommissionRates.role,
      set: {
        salePercent:          String(saleNum),
        accompanimentPercent: String(accompNum),
        updatedAt:            now,
      },
    })
    .returning({
      role:                 managerCommissionRates.role,
      salePercent:          managerCommissionRates.salePercent,
      accompanimentPercent: managerCommissionRates.accompanimentPercent,
    })

  return apiSuccess({ rate: updated })
}
