"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { NotificationSettings } from "@/components/notification-settings"
import { TelegramChannelSettings } from "@/components/company/telegram-channel-settings"
import { Bell } from "lucide-react"

export default function HrNotificationsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 space-y-6 px-4 sm:px-14">
            <div>
              <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-violet-600" /><h1 className="text-lg font-semibold">Уведомления HR</h1></div>
              <p className="text-sm text-muted-foreground">Настройте каналы уведомлений для событий найма</p>
            </div>
            <NotificationSettings module="hr" />
            <TelegramChannelSettings />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
