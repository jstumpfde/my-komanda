"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Plus } from "lucide-react"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
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

            <TableCard className="shadow-sm">
              <DataTable>
                <DataHead>
                  {["Название", "Клиент", "Дедлайн", "Сумма", "Статус", "Конкурентов"].map((h) => (
                    <DataHeadCell key={h}>{h}</DataHeadCell>
                  ))}
                </DataHead>
                <tbody>
                  {TENDERS.map((t) => {
                    const st = TENDER_STATUS_MAP[t.status]
                    const deadline = new Date(t.deadline)
                    const daysLeft = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 86400000))
                    const isUrgent = daysLeft < 7
                    return (
                      <DataRow key={t.id}>
                        <DataCell className="font-medium">{t.title}</DataCell>
                        <DataCell>{t.client}</DataCell>
                        <DataCell>
                          <div className="text-sm">{deadline.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</div>
                          <div className={`text-xs font-medium ${isUrgent ? "text-red-500" : "text-muted-foreground"}`}>
                            {daysLeft === 0 ? "Сегодня!" : `${daysLeft} дн осталось`}
                          </div>
                        </DataCell>
                        <DataCell className="font-bold">{formatValueShort(t.value)}</DataCell>
                        <DataCell>
                          <Badge variant="secondary" className="text-[10px] border-0 font-medium" style={{ backgroundColor: `${st?.color}15`, color: st?.color }}>
                            {st?.label}
                          </Badge>
                        </DataCell>
                        <DataCell align="center">{t.competitors}</DataCell>
                      </DataRow>
                    )
                  })}
                </tbody>
              </DataTable>
            </TableCard>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
