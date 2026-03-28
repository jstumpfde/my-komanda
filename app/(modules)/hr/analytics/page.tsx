"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { BarChart3 } from "lucide-react"

export default function HrAnalyticsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <h1 className="text-xl font-semibold text-foreground mb-6">Аналитика HR</h1>
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <BarChart3 className="size-14 text-muted-foreground/25 mb-4" />
              <p className="text-muted-foreground font-medium">Раздел в разработке</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Здесь появится аналитика по найму, воронке и источникам
              </p>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
