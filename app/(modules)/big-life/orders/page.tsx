// /big-life/orders — заказы из корзины biglife.company24.pro (Обложки +
// Ридер). Big Life — обычный тенант (см. lib/big-life/auth.ts); доступ
// проверяют сами API-роуты, эта страница — обычная компанийская страница.

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { BigLifeOrdersClient } from "./big-life-orders-client"

export const dynamic = "force-dynamic"

export default function BigLifeOrdersPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <BigLifeOrdersClient />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
