"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Plus, ExternalLink, Pencil, BarChart2 } from "lucide-react"

const landings = [
  {
    id: 1,
    name: "Главная страница продукта",
    url: "/",
    conversion: "4.8%",
    visits: "12 400",
    leads: 595,
    status: "Активен",
  },
  {
    id: 2,
    name: "Лендинг тарифа Business",
    url: "/business",
    conversion: "6.2%",
    visits: "3 200",
    leads: 198,
    status: "Активен",
  },
  {
    id: 3,
    name: "Вебинар апрель 2026",
    url: "/webinar-april",
    conversion: "12.5%",
    visits: "980",
    leads: 123,
    status: "Активен",
  },
  {
    id: 4,
    name: "HR-модуль — промо",
    url: "/hr-promo",
    conversion: "3.1%",
    visits: "5 600",
    leads: 174,
    status: "Черновик",
  },
  {
    id: 5,
    name: "Партнёрская программа",
    url: "/partners",
    conversion: "2.4%",
    visits: "1 800",
    leads: 43,
    status: "Архив",
  },
]

const statusColors: Record<string, string> = {
  "Активен": "bg-green-100 text-green-700",
  "Черновик": "bg-gray-100 text-gray-700",
  "Архив": "bg-yellow-100 text-yellow-700",
}

export default function LandingsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Лендинги</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Создать лендинг
        </Button>
      </div>

      <TableCard>
        <DataTable>
          <DataHead>
            <DataHeadCell>Название</DataHeadCell>
            <DataHeadCell>URL</DataHeadCell>
            <DataHeadCell align="right">Конверсия</DataHeadCell>
            <DataHeadCell align="right">Посещений</DataHeadCell>
            <DataHeadCell align="right">Лидов</DataHeadCell>
            <DataHeadCell>Статус</DataHeadCell>
            <DataHeadCell align="right">Действия</DataHeadCell>
          </DataHead>
          <tbody>
            {landings.map((row) => (
              <DataRow key={row.id}>
                <DataCell className="font-medium">{row.name}</DataCell>
                <DataCell className="text-muted-foreground font-mono text-xs">{row.url}</DataCell>
                <DataCell align="right" className="font-semibold text-green-600">{row.conversion}</DataCell>
                <DataCell align="right" className="text-muted-foreground">{row.visits}</DataCell>
                <DataCell align="right" className="font-medium">{row.leads}</DataCell>
                <DataCell>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[row.status]}`}>
                    {row.status}
                  </span>
                </DataCell>
                <DataCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Открыть
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Редактировать
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <BarChart2 className="h-3.5 w-3.5 mr-1" />
                      Статистика
                    </Button>
                  </div>
                </DataCell>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
