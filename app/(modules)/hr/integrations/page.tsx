"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { IntegrationsContent } from "@/components/hr/integrations-content"
import { useAuth } from "@/lib/auth"

export default function IntegrationsPage() {
  const { hasAccess } = useAuth()

  if (!hasAccess(["platform_admin", "admin", "director", "client"])) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="text-lg font-semibold mb-2">Доступ ограничен</h1>
        <p className="text-sm text-muted-foreground">У вас нет доступа к этому разделу.</p>
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 px-4 sm:px-14">
            <IntegrationsContent />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
