"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { DEFAULT_TARIFFS, DEFAULT_CLIENTS, formatPrice, type ClientCompany } from "@/lib/tariff-types"
import {
  Users, Building2, Shield, Filter,
} from "lucide-react"

const STATUS_CONFIG: Record<ClientCompany["status"], { label: string; color: string }> = {
  active: { label: "Активен", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  trial: { label: "Trial", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  overdue: { label: "Просрочен", color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  churned: { label: "Ушёл", color: "bg-muted text-muted-foreground border-border" },
}

export default function AdminClientsPage() {
  const [clients] = useState<ClientCompany[]>(DEFAULT_CLIENTS)
  const [filterTariff, setFilterTariff] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterManager, setFilterManager] = useState("all")

  const filtered = clients.filter(c => {
    if (filterTariff !== "all" && c.tariffId !== filterTariff) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    if (filterManager !== "all" && c.manager !== filterManager) return false
    return true
  })

  const getTariffName = (id: string) => DEFAULT_TARIFFS.find(t => t.id === id)?.name || id
  const getTariffPrice = (id: string) => {
    const t = DEFAULT_TARIFFS.find(t => t.id === id)
    return t ? formatPrice(t.price) : "—"
  }

  const managers = [...new Set(clients.map(c => c.manager))]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-5 h-5 text-primary" />
                  <h1 className="text-2xl font-semibold text-foreground">Клиенты</h1>
                </div>
                <p className="text-muted-foreground text-sm">Управление клиентскими аккаунтами</p>
              </div>

              {/* Фильтры */}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={filterTariff} onValueChange={setFilterTariff}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Тариф" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все тарифы</SelectItem>
                    {DEFAULT_TARIFFS.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    <SelectItem value="active">Активен</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="overdue">Просрочен</SelectItem>
                    <SelectItem value="churned">Ушёл</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterManager} onValueChange={setFilterManager}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="КМ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все КМ</SelectItem>
                    {managers.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Таблица клиентов */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Компания</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Тариф</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Вакансий</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Кандидатов</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Оплачен до</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">КМ</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(client => {
                        const tariff = DEFAULT_TARIFFS.find(t => t.id === client.tariffId)
                        const statusCfg = STATUS_CONFIG[client.status]
                        const isOverdue = client.paidUntil < new Date()
                        return (
                          <tr key={client.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <Building2 className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{client.name}</p>
                                  <p className="text-xs text-muted-foreground">{client.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{getTariffName(client.tariffId)}</p>
                                <p className="text-xs text-muted-foreground">{getTariffPrice(client.tariffId)}</p>
                              </div>
                            </td>
                            <td className="text-right px-4 py-3 text-sm">
                              <span className="font-medium text-foreground">{client.vacanciesUsed}</span>
                              {tariff && <span className="text-muted-foreground">/{tariff.maxVacancies === 999 ? "∞" : tariff.maxVacancies}</span>}
                            </td>
                            <td className="text-right px-4 py-3 text-sm">
                              <span className="font-medium text-foreground">{client.candidatesUsed.toLocaleString("ru-RU")}</span>
                              {tariff && <span className="text-muted-foreground">/{tariff.maxCandidates.toLocaleString("ru-RU")}</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("text-sm", isOverdue ? "text-red-600 font-medium" : "text-foreground")}>
                                {client.paidUntil.toLocaleDateString("ru-RU")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{client.manager}</td>
                            <td className="text-center px-4 py-3">
                              <Badge variant="outline" className={cn("text-xs", statusCfg.color)}>
                                {statusCfg.label}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                            Нет клиентов по выбранным фильтрам
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{clients.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Всего клиентов</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{clients.filter(c => c.status === "active").length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Активных</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{clients.filter(c => c.status === "overdue").length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Просрочено</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {clients.reduce((sum, c) => sum + (DEFAULT_TARIFFS.find(t => t.id === c.tariffId)?.price || 0), 0).toLocaleString("ru-RU")} ₽
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">MRR</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
