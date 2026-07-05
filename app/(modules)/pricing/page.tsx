"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LineChart, Building2 } from "lucide-react"

// Каркас модуля «Мониторинг цен». Реальный UI (карточки объектов, «Добавить
// объект», таблица сравнения) собирает отдельный агент по дизайн-доку
// docs/architecture/PRICE-MONITOR-2026-07.md — здесь только обёртка и
// пустое состояние, чтобы страница была рабочей сразу после гейта модуля.
export default function PriceMonitorObjectsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <LineChart className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Мониторинг цен</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Сравнение цен ваших объектов размещения с конкурентами рядом
              </p>
            </div>

            <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center gap-3 bg-card/50">
              <div className="h-12 w-12 rounded-full bg-lime-500/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-lime-600" />
              </div>
              <p className="text-sm font-medium">Объекты появятся здесь</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Добавьте объект по ссылке Airbnb, чтобы начать отслеживать цены конкурентов рядом
              </p>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
