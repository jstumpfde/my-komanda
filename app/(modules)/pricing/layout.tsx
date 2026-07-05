import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { hasPriceMonitorAccess } from "@/lib/price-monitor/entitlement"

// Серверный гейт всех страниц /pricing/*: модуль «Мониторинг цен» доступен
// ТОЛЬКО компаниям с включённым price_monitor (клиенты Company24.pro). Иначе
// 404 — даже по прямому URL, не только скрытием в меню. Директива Юрия 05.07.
export default async function PriceMonitorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!(await hasPriceMonitorAccess(session?.user?.companyId))) {
    notFound()
  }
  return <>{children}</>
}
