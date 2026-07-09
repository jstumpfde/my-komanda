// /big-life/covers — управление архивом обложек Big Life
// (biglife.company24.pro/Big Life Covers.dc.html): цена, скидка, остаток,
// «нет в наличии», публикация. Big Life — обычный тенант (см. lib/big-life/auth.ts);
// доступ проверяют сами API-роуты, эта страница — обычная компанийская страница.

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { BigLifeCoversClient } from "./big-life-covers-client"

export const dynamic = "force-dynamic"

export default function BigLifeCoversPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <BigLifeCoversClient />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
