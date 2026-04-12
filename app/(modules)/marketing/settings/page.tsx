"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Settings, Search, Users, Send, BarChart3, LineChart, Lock } from "lucide-react"

const INTEGRATIONS = [
  { name: "Яндекс.Директ API", desc: "Автоимпорт кампаний, расходов и статистики", icon: Search, color: "#FF0000" },
  { name: "VK Рекламный кабинет", desc: "Синхронизация аудиторий и лидов", icon: Users, color: "#0077FF" },
  { name: "Telegram Ads", desc: "Статистика каналов и постов", icon: Send, color: "#26A5E4" },
  { name: "Google Analytics", desc: "Импорт трафика, конверсий и целей", icon: BarChart3, color: "#F59E0B" },
  { name: "Яндекс.Метрика", desc: "Вебвизор, цели, сегменты аудитории", icon: LineChart, color: "#FF0000" },
]

export default function MarketingSettingsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Настройки маркетинга</h1>
              <p className="text-sm text-muted-foreground mt-1">Подключение рекламных кабинетов и аналитики</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {INTEGRATIONS.map((int) => (
                <div
                  key={int.name}
                  className="rounded-xl border border-border/60 bg-card p-6 opacity-60 cursor-not-allowed relative overflow-hidden"
                  style={{ borderLeft: `3px solid ${int.color}` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${int.color}15` }}>
                      <int.icon className="w-5 h-5" style={{ color: int.color }} />
                    </div>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Lock className="w-3 h-3" />
                      Скоро
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{int.name}</h3>
                  <p className="text-xs text-muted-foreground">{int.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
