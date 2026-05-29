"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield, Building2, Users, FileText } from "lucide-react"
import { CompaniesTab } from "@/components/admin/clients/companies-tab"
import { UsersTab } from "@/components/admin/clients/users-tab"
import { InvoicesTab } from "@/components/admin/clients/invoices-tab"

type View = "companies" | "users" | "invoices"
const VIEWS: View[] = ["companies", "users", "invoices"]

function AdminClientsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initial = searchParams.get("view")
  const [view, setView] = useState<View>(VIEWS.includes(initial as View) ? (initial as View) : "companies")

  function changeView(v: string) {
    const next = v as View
    setView(next)
    // Сохраняем выбранный таб в URL, не трогая остальные параметры
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (next === "companies") params.delete("view")
    else params.set("view", next)
    const qs = params.toString()
    router.replace(qs ? `/admin/clients?${qs}` : "/admin/clients", { scroll: false })
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14">

            {/* Заголовок */}
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Клиенты</h1>
            </div>
            <p className="text-muted-foreground text-sm mb-5">Управление компаниями, пользователями и счетами платформы</p>

            {/* Верхние табы хаба */}
            <Tabs value={view} onValueChange={changeView} className="mb-5">
              <TabsList>
                <TabsTrigger value="companies" className="gap-1.5"><Building2 className="w-3.5 h-3.5" />Компании</TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" />Пользователи</TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Счета</TabsTrigger>
              </TabsList>
            </Tabs>

            {view === "companies" && <CompaniesTab />}
            {view === "users" && <UsersTab />}
            {view === "invoices" && <InvoicesTab />}

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function AdminClientsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Загрузка...</div>}>
      <AdminClientsInner />
    </Suspense>
  )
}
