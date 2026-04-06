"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { BarChart3, CheckCircle2, Clock, AlertTriangle, TrendingUp, Users } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"

const STATS = [
  { label: "Всего задач",       value: "48",  icon: <BarChart3 className="size-5 text-blue-500" />,    change: "+12 за неделю" },
  { label: "В работе",          value: "14",  icon: <Clock className="size-5 text-amber-500" />,       change: "29% от всех" },
  { label: "Просрочено",        value: "3",   icon: <AlertTriangle className="size-5 text-red-500" />, change: "−2 vs прошл. нед." },
  { label: "Завершено за нед.", value: "11",  icon: <CheckCircle2 className="size-5 text-emerald-500" />, change: "+38%" },
]

const TEAM_LOAD = [
  { name: "Анна И.",    initials: "АИ", color: "#8b5cf6", total: 8, done: 5, inProgress: 2 },
  { name: "Макс П.",    initials: "МП", color: "#3b82f6", total: 10, done: 6, inProgress: 3 },
  { name: "Мария С.",   initials: "МС", color: "#ef4444", total: 6, done: 3, inProgress: 2 },
  { name: "Дмитрий К.", initials: "ДК", color: "#10b981", total: 12, done: 9, inProgress: 2 },
  { name: "Елена С.",   initials: "ЕС", color: "#f59e0b", total: 7, done: 4, inProgress: 1 },
]

export default function TaskAnalyticsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="size-5 text-sky-500" />
              <h1 className="text-xl font-semibold">Аналитика задач</h1>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {STATS.map((s, i) => (
                <div key={i} className="border rounded-xl p-4 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    {s.icon}
                    <span className="text-2xl font-bold">{s.value}</span>
                  </div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.change}</p>
                </div>
              ))}
            </div>

            {/* Team load */}
            <div className="border rounded-xl bg-card">
              <div className="px-5 py-4 border-b flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Загрузка команды</h2>
              </div>
              <div className="divide-y">
                {TEAM_LOAD.map((m) => (
                  <div key={m.name} className="px-5 py-3 flex items-center gap-4">
                    <Avatar className="size-8">
                      <AvatarFallback style={{ backgroundColor: m.color }} className="text-white text-xs font-medium">{m.initials}</AvatarFallback>
                    </Avatar>
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-medium">{m.name}</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{m.done} завершено из {m.total}</span>
                        <span>{Math.round((m.done / m.total) * 100)}%</span>
                      </div>
                      <Progress value={(m.done / m.total) * 100} className="h-2" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">В работе: {m.inProgress}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
