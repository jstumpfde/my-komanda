"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Download, Package, ShoppingCart, TrendingUp, ClipboardList, Users } from "lucide-react"
import { toast } from "sonner"

interface ReportTemplate {
  id: string
  title: string
  description: string
  icon: React.ElementType
  color: string
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  { id: "items",     title: "Товарный отчёт",          description: "Остатки, оборачиваемость и стоимость склада по всем позициям",   icon: Package,       color: "text-blue-500"   },
  { id: "orders",    title: "Отчёт по заказам",         description: "Все заказы за период: суммы, статусы, клиенты, сроки выполнения", icon: ShoppingCart,   color: "text-violet-500" },
  { id: "movement",  title: "Движение товаров",          description: "Приход и расход по каждой позиции за выбранный период",          icon: TrendingUp,     color: "text-emerald-500"},
  { id: "inventory", title: "Акт инвентаризации",       description: "Фактические остатки vs учётные данные на дату проведения",       icon: ClipboardList,  color: "text-amber-500"  },
  { id: "suppliers", title: "Анализ поставщиков",       description: "Закупки, суммы, сроки поставки и надёжность поставщиков",       icon: Users,          color: "text-rose-500"   },
]

interface GeneratedReport {
  id: string
  title: string
  period: string
  date: string
  format: string
}

const INITIAL_GENERATED: GeneratedReport[] = [
  { id: "1", title: "Товарный отчёт",    period: "Март 2026",       date: "29.03.2026 09:14", format: "Excel" },
  { id: "2", title: "Отчёт по заказам",  period: "Февраль 2026",    date: "01.03.2026 17:42", format: "Excel" },
  { id: "3", title: "Движение товаров",  period: "Q1 2026",         date: "01.03.2026 12:00", format: "PDF"   },
  { id: "4", title: "Акт инвентаризации",period: "28.02.2026",      date: "28.02.2026 19:33", format: "PDF"   },
]

const PERIODS = [
  "Текущий месяц",
  "Прошлый месяц",
  "Текущий квартал",
  "Прошлый квартал",
  "Текущий год",
  "Последние 30 дней",
  "Последние 7 дней",
]

export default function LogisticsReportsPage() {
  const [periods, setPeriods] = useState<Record<string, string>>(
    Object.fromEntries(REPORT_TEMPLATES.map(r => [r.id, "Текущий месяц"]))
  )
  const [generated, setGenerated] = useState<GeneratedReport[]>(INITIAL_GENERATED)

  const handleDownload = (report: ReportTemplate, format: "Excel" | "PDF") => {
    toast.info(`Формируется ${format}: ${report.title}…`)
    const newReport: GeneratedReport = {
      id: String(Date.now()),
      title: report.title,
      period: periods[report.id],
      date: "29.03.2026 " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      format,
    }
    setGenerated(prev => [newReport, ...prev])
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Отчёты</h1>
                <p className="text-sm text-muted-foreground">Выгрузка данных по складу и логистике</p>
              </div>
            </div>

            {/* Report tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {REPORT_TEMPLATES.map(report => (
                <Card key={report.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center ${report.color}`}>
                        <report.icon className="w-4.5 h-4.5" />
                      </div>
                      <CardTitle className="text-sm font-semibold">{report.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">{report.description}</p>
                    <div>
                      <Select value={periods[report.id]} onValueChange={v => setPeriods(p => ({ ...p, [report.id]: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-8" onClick={() => handleDownload(report, "Excel")}>
                        <Download className="w-3.5 h-3.5" /> Excel
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-8" onClick={() => handleDownload(report, "PDF")}>
                        <Download className="w-3.5 h-3.5" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Recent generated reports */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Сформированные отчёты</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Отчёт</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Период</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Дата формирования</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Формат</th>
                      <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Скачать</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generated.map(r => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium">{r.title}</td>
                        <td className="px-3 py-3 text-sm text-muted-foreground">{r.period}</td>
                        <td className="px-3 py-3 text-sm text-muted-foreground">{r.date}</td>
                        <td className="text-center px-3 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.format === "Excel" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {r.format}
                          </span>
                        </td>
                        <td className="text-center px-3 py-3">
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => toast.info(`Скачивание: ${r.title}`)}>
                            <Download className="w-3.5 h-3.5" /> Скачать
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {generated.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Нет сформированных отчётов</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
