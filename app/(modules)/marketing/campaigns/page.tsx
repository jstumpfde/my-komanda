"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Plus, Megaphone } from "lucide-react"
import { CAMPAIGNS, CHANNEL_MAP, MARKETING_CHANNELS } from "@/lib/marketing/demo-data"

const STATUSES: Record<string, { label: string; cls: string }> = {
  active:    { label: "Активна",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  completed: { label: "Завершена", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  paused:    { label: "Пауза",    cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
}

export default function CampaignsPage() {
  const [filterChannel, setFilterChannel] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")

  const filtered = CAMPAIGNS.filter((c) => {
    if (filterChannel !== "all" && c.channel !== filterChannel) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    return true
  })

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 pt-3 pb-2">
                  <Megaphone className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold">Рекламные кампании</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Управление кампаниями по всем каналам</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button className="rounded-xl shadow-sm gap-1.5" disabled>
                      <Plus className="w-4 h-4" />
                      Новая кампания
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Скоро</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-5">
              <Select value={filterChannel} onValueChange={setFilterChannel}>
                <SelectTrigger className="w-[200px] h-10 rounded-xl"><SelectValue placeholder="Канал" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все каналы</SelectItem>
                  {MARKETING_CHANNELS.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px] h-10 rounded-xl"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="completed">Завершённые</SelectItem>
                  <SelectItem value="paused">На паузе</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Название</DataHeadCell>
                  <DataHeadCell>Канал</DataHeadCell>
                  <DataHeadCell align="center">Статус</DataHeadCell>
                  <DataHeadCell align="right">Бюджет</DataHeadCell>
                  <DataHeadCell align="right">Потрачено</DataHeadCell>
                  <DataHeadCell align="right">Лиды</DataHeadCell>
                  <DataHeadCell align="right">Период</DataHeadCell>
                </DataHead>
                <tbody>
                  {filtered.map((c) => {
                    const ch = CHANNEL_MAP[c.channel]
                    const st = STATUSES[c.status]
                    const pct = Math.round((c.spent / c.budget) * 100)
                    return (
                      <DataRow key={c.id}>
                        <DataCell>
                          <p className="text-sm font-medium">{c.name}</p>
                          <div className="h-1 bg-muted rounded-full mt-1.5 w-24">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ch?.color || "#666" }} />
                          </div>
                        </DataCell>
                        <DataCell>
                          <Badge variant="secondary" className="text-[10px] font-medium border-0" style={{ backgroundColor: `${ch?.color}15`, color: ch?.color }}>
                            {ch?.name || c.channel}
                          </Badge>
                        </DataCell>
                        <DataCell align="center">
                          <Badge variant="secondary" className={`text-[10px] font-medium border-0 ${st?.cls}`}>{st?.label}</Badge>
                        </DataCell>
                        <DataCell align="right" className="text-muted-foreground">{new Intl.NumberFormat("ru-RU").format(c.budget)} ₽</DataCell>
                        <DataCell align="right" className="font-medium">{new Intl.NumberFormat("ru-RU").format(c.spent)} ₽</DataCell>
                        <DataCell align="right" className="font-bold">{c.leads}</DataCell>
                        <DataCell align="right" className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(c.startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — {new Date(c.endDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                        </DataCell>
                      </DataRow>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">Нет кампаний</td></tr>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
