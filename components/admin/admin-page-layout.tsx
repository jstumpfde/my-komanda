"use client"

// Обёртка для страниц admin-панели.
// Рендерит DashboardSidebar (верхнеуровневый) + DashboardHeader,
// а внутри main — левый AdminNav + область контента.

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AdminNav } from "@/components/admin/admin-nav"
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs"
import { AdminCategoryTabs } from "@/components/admin/admin-category-tabs"

interface AdminPageLayoutProps {
  children: React.ReactNode
}

export function AdminPageLayout({ children }: AdminPageLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-1 overflow-hidden min-h-0 h-full">
          <AdminNav />
          <main className="flex-1 overflow-auto bg-background">
            <AdminBreadcrumbs />
            <AdminCategoryTabs />
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
