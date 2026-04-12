"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { GitBranch, Calculator, Link2, FileText, Lock } from "lucide-react"

const SETTINGS = [
  { name: "Этапы воронки", desc: "Настройка этапов B2B-воронки и автоматических переходов", icon: GitBranch, color: "#3B82F6" },
  { name: "Скоринг сделок", desc: "Автоматическая оценка вероятности закрытия по параметрам", icon: Calculator, color: "#8B5CF6" },
  { name: "Интеграции", desc: "1С, Битрикс24, amoCRM — синхронизация данных", icon: Link2, color: "#10B981" },
  { name: "Шаблоны КП", desc: "Генерация коммерческих предложений по шаблону", icon: FileText, color: "#F59E0B" },
]

export default function B2BSettingsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Настройки B2B</h1>
              <p className="text-sm text-muted-foreground mt-1">Воронка, скоринг и интеграции</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SETTINGS.map((s) => (
                <div key={s.name} className="rounded-xl border border-border/60 bg-card p-6 opacity-60 cursor-not-allowed" style={{ borderLeft: `3px solid ${s.color}` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                      <s.icon className="w-5 h-5" style={{ color: s.color }} />
                    </div>
                    <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="w-3 h-3" />Скоро</Badge>
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{s.name}</h3>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
