"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield, Building2, Users, FileText, Trash2 } from "lucide-react"
import { CompaniesTab } from "@/components/admin/clients/companies-tab"
import { UsersTab } from "@/components/admin/clients/users-tab"
import { InvoicesTab } from "@/components/admin/clients/invoices-tab"
import { TrashTab } from "@/components/admin/clients/trash-tab"

type View = "companies" | "users" | "invoices" | "trash"
const VIEWS: View[] = ["companies", "users", "invoices", "trash"]

// Счётчик в табе: маленькая «пилюля» с числом.
function TabCount({ n }: { n: number }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
      {n.toLocaleString("ru-RU")}
    </span>
  )
}

function AdminClientsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initial = searchParams.get("view")
  const [view, setView] = useState<View>(VIEWS.includes(initial as View) ? (initial as View) : "companies")

  // Счётчики на табах (всего по платформе) + общий счётчик корзины.
  const [counts, setCounts] = useState<{ companies: number; users: number; invoices: number; trash: number } | null>(null)
  const loadCounts = useCallback(() => {
    Promise.all([
      fetch("/api/admin/clients?limit=1").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/users?limit=1").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/invoices?limit=1").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/trash").then(r => r.ok ? r.json() : null),
    ]).then(([c, u, i, t]) => {
      setCounts({
        companies: c?.total ?? 0,
        users: u?.total ?? 0,
        invoices: i?.total ?? 0,
        trash: t?.counts?.total ?? 0,
      })
    }).catch(() => {})
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

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

            {/* Табы хаба: Компании / Пользователи / Счета / Корзина */}
            <div className="flex items-center gap-3 flex-wrap mb-5">
              <Tabs value={view} onValueChange={changeView}>
                <TabsList>
                  <TabsTrigger value="companies" className="gap-1.5"><Building2 className="w-3.5 h-3.5" />Компании{counts && <TabCount n={counts.companies} />}</TabsTrigger>
                  <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" />Пользователи{counts && <TabCount n={counts.users} />}</TabsTrigger>
                  <TabsTrigger value="invoices" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Счета{counts && <TabCount n={counts.invoices} />}</TabsTrigger>
                  <TabsTrigger value="trash" className="gap-1.5"><Trash2 className="w-3.5 h-3.5" />Корзина{counts && counts.trash > 0 && <TabCount n={counts.trash} />}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {view === "companies" && <CompaniesTab />}
            {view === "users" && <UsersTab />}
            {view === "invoices" && <InvoicesTab />}
            {view === "trash" && <TrashTab onChanged={loadCounts} />}

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
