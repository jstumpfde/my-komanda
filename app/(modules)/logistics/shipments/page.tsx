"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Ship } from "lucide-react"

export default function LogisticsShipmentsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Ship className="w-5 h-5 text-orange-500" />
            </div>
            <h1 className="text-2xl font-semibold">Перевозки</h1>
          </div>
          <p className="text-muted-foreground">В разработке — будет в TZ-05</p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
