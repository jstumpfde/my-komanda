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
        <main className="flex-1 overflow-auto bg-background [&_input]:bg-white [&_label]:font-medium [&_label]:text-foreground">
          <div className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
