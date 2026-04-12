"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Phone, Mic, Bell, Brain, Lock } from "lucide-react"

const INTEGRATIONS = [
  { name: "IP-телефония", desc: "Манго Офис, Билайн Бизнес, МегаФон — автоматическая запись звонков", icon: Phone, color: "#3B82F6" },
  { name: "Whisper API", desc: "Транскрипция звонков в текст для AI-анализа", icon: Brain, color: "#8B5CF6" },
  { name: "Автоматический анализ", desc: "AI проверяет каждый звонок по чек-листу без участия человека", icon: Mic, color: "#10B981" },
  { name: "Уведомления", desc: "Низкий балл → автоматический alert руководителю отдела", icon: Bell, color: "#F59E0B" },
]

export default function QCSettingsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Настройки ОКК</h1>
              <p className="text-sm text-muted-foreground mt-1">Интеграции с телефонией и AI-анализом</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {INTEGRATIONS.map((int) => (
                <div
                  key={int.name}
                  className="rounded-xl border border-border/60 bg-card p-6 opacity-60 cursor-not-allowed"
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
