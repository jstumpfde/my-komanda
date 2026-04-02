"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { NotificationSettings } from "@/components/notification-settings"

export default function HrNotificationsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 max-w-4xl" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-foreground mb-1">Уведомления HR</h1>
              <p className="text-sm text-muted-foreground">Настройте каналы уведомлений для событий найма</p>
            </div>
            <NotificationSettings module="hr" />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
