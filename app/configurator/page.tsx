"use client"

import { Sparkles } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ConfiguratorChat } from "@/components/configurator/ConfiguratorChat"

export default function ConfiguratorPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14">
            {/* Hero */}
            <div className="mb-6 flex items-start gap-4">
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-500 flex items-center justify-center">
                <Sparkles className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                  Конфигуратор
                </h1>
                <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                  Настройте платформу словами — Нэнси соберёт автоматизацию за вас.
                </p>
              </div>
            </div>

            {/* Chat */}
            <ConfiguratorChat />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
