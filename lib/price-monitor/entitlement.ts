import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { apiError } from "@/lib/api-helpers"

// Гейт доступа к модулю «Мониторинг цен»: видят и используют ТОЛЬКО компании,
// которым платформа включила price_monitor (клиенты Company24.pro). У остальных
// — 404 (скрываем существование модуля, а не 403). Директива Юрия 05.07:
// «Airbnb должен видеть только клиент Company24.pro».
//
// Проверяем companies.enabled_modules (источник правды пер-компанийного
// включения; тот же список, что фильтрует сайдбар).
async function companyHasPriceMonitor(companyId: string): Promise<boolean> {
  const [company] = await db
    .select({ enabledModules: companies.enabledModules })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  const enabled = company?.enabledModules
  return Array.isArray(enabled) && enabled.includes("price_monitor")
}

/** Для API-роутов: бросает apiError(404), если у компании нет модуля. */
export async function assertPriceMonitorModule(companyId: string): Promise<void> {
  if (!(await companyHasPriceMonitor(companyId))) {
    throw apiError("Модуль недоступен", 404)
  }
}

/** Для серверных страниц/layout: true, если доступ есть. */
export async function hasPriceMonitorAccess(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false
  return companyHasPriceMonitor(companyId)
}
