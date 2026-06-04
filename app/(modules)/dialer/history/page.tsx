"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {CALL_HISTORY, CALL_RESULTS, RESULT_MAP, formatDuration, SENTIMENT_EMOJI} from "@/lib/dialer/demo-data"

export default function DialerHistoryPage() {
  const [filterScript, setFilterScript] = useState("all")
  const [filterResult, setFilterResult] = useState("all")

  const filtered = CALL_HISTORY.filter((c) => {
    if (filterScript !== "all" && c.scriptName !== filterScript) return false
    if (filterResult !== "all" && c.result !== filterResult) return false
    return true
  })

  const scriptNames = [...new Set(CALL_HISTORY.map((c) => c.scriptName))]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">История звонков</h1>
              <p className="text-sm text-muted-foreground mt-1">Все звонки бота-звонаря</p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-5">
              <Select value={filterScript} onValueChange={setFilterScript}>
                <SelectTrigger className="w-[250px] h-10 rounded-xl"><SelectValue placeholder="Скрипт" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все скрипты</SelectItem>
                  {scriptNames.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterResult} onValueChange={setFilterResult}>
                <SelectTrigger className="w-[180px] h-10 rounded-xl"><SelectValue placeholder="Результат" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все результаты</SelectItem>
                  {CALL_RESULTS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <TableCard className="shadow-sm">
              <DataTable>
                <DataHead>
                  {["Время", "Скрипт", "Клиент", "Телефон", "Длительность", "Результат", ""].map((h) => (
                    <DataHeadCell key={h}>{h}</DataHeadCell>
                  ))}
                </DataHead>
                <tbody>
                  {filtered.map((call) => {
                    const res = RESULT_MAP[call.result]
                    return (
                      <DataRow key={call.id}>
                        <DataCell className="text-muted-foreground whitespace-nowrap">{new Date(call.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</DataCell>
                        <DataCell>{call.scriptName}</DataCell>
                        <DataCell className="font-medium">{call.clientName}</DataCell>
                        <DataCell className="text-muted-foreground">{call.phone}</DataCell>
                        <DataCell className="tabular-nums">{formatDuration(call.duration)}</DataCell>
                        <DataCell>
                          <Badge variant="secondary" className="text-[10px] border-0 font-medium" style={{ backgroundColor: `${res?.color}15`, color: res?.color }}>
                            {res?.label}
                          </Badge>
                        </DataCell>
                        <DataCell align="center">{call.sentiment ? SENTIMENT_EMOJI[call.sentiment] : ""}</DataCell>
                      </DataRow>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">Нет звонков</td></tr>
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
