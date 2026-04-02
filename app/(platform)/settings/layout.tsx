"use client"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { SettingsHeader } from "@/components/settings/settings-header"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <SettingsHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 max-w-5xl" style={{ paddingLeft: 56, paddingRight: 56 }}>{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
