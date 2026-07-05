"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Settings } from "lucide-react"

// Каркас настроек «Мониторинг цен» — company-level дефолты (радиус, периоды,
// расписание, авто-поиск конкурентов), см. price_monitor_settings в
// docs/architecture/PRICE-MONITOR-2026-07.md. Реальную форму собирает
// отдельный агент по API GET/PUT /api/modules/pricing/settings.
export default function PriceMonitorSettingsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Settings className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Настройки мониторинга</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Радиус поиска, периоды проживания и расписание прогонов по умолчанию
              </p>
            </div>

            <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center gap-3 bg-card/50 max-w-2xl">
              <p className="text-sm font-medium">Настройки появятся здесь</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Радиус, фильтр ЖК, периоды проживания, расписание и авто-поиск конкурентов
              </p>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
