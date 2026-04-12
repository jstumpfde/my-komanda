"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Plus } from "lucide-react"
import { TENDERS, TENDER_STATUS_MAP, formatValueShort } from "@/lib/b2b/demo-data"

export default function B2BTendersPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Тендеры</h1>
                <p className="text-sm text-muted-foreground mt-1">Участие в тендерах и госзакупках</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button className="rounded-xl gap-1.5" disabled><Plus className="w-4 h-4" />Новый тендер</Button>
                  </TooltipTrigger>
                  <TooltipContent>Скоро</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="rounded-xl border border-border shadow-sm bg-card">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Название", "Клиент", "Дедлайн", "Сумма", "Статус", "Конкурентов"].map((h) => (
                      <th key={h} className="text-left text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TENDERS.map((t) => {
                    const st = TENDER_STATUS_MAP[t.status]
                    const deadline = new Date(t.deadline)
                    const daysLeft = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 86400000))
                    const isUrgent = daysLeft < 7
                    return (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-4 text-sm font-medium">{t.title}</td>
                        <td className="px-5 py-4 text-sm">{t.client}</td>
                        <td className="px-5 py-4">
                          <div className="text-sm">{deadline.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</div>
                          <div className={`text-xs font-medium ${isUrgent ? "text-red-500" : "text-muted-foreground"}`}>
                            {daysLeft === 0 ? "Сегодня!" : `${daysLeft} дн осталось`}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold">{formatValueShort(t.value)}</td>
                        <td className="px-5 py-4">
                          <Badge variant="secondary" className="text-[10px] border-0 font-medium" style={{ backgroundColor: `${st?.color}15`, color: st?.color }}>
                            {st?.label}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-sm text-center">{t.competitors}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
