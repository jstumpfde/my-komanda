"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { BarChart3, Calculator, FlaskConical, GitFork, Funnel } from "lucide-react"

const FEATURES = [
  { icon: Calculator, label: "ROI-калькулятор", desc: "Автоматический расчёт окупаемости каждого канала" },
  { icon: FlaskConical, label: "A/B тесты", desc: "Сравнение креативов, аудиторий и посадочных страниц" },
  { icon: GitFork, label: "Атрибуция", desc: "Мультиканальная атрибуция: first-touch, last-touch, linear" },
  { icon: Funnel, label: "Воронка", desc: "Визуализация конверсий от охвата до клиента" },
]

export default function MarketingAnalyticsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6">
                <BarChart3 className="w-10 h-10 text-purple-500" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Детальная аналитика</h1>
              <p className="text-muted-foreground max-w-md mb-8">
                AI-анализ эффективности каналов, прогноз бюджета, автоматические отчёты
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
                {FEATURES.map((f) => (
                  <div key={f.label} className="rounded-xl border border-border/60 bg-card p-5 text-left hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <f.icon className="w-5 h-5 text-purple-500" />
                      </div>
                      <span className="font-semibold">{f.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground mt-8">Будет доступно в следующем обновлении</p>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
