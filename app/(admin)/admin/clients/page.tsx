"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield, Building2, Users, FileText, Trash2 } from "lucide-react"
import { CompaniesTab } from "@/components/admin/clients/companies-tab"
import { UsersTab } from "@/components/admin/clients/users-tab"
import { InvoicesTab } from "@/components/admin/clients/invoices-tab"

type View = "companies" | "users" | "invoices"
const VIEWS: View[] = ["companies", "users", "invoices"]

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
  // Подвид: Активные / Корзина — общий для всех табов (в URL ?sub=trash).
  const [sub, setSub] = useState<"active" | "trash">(searchParams.get("sub") === "trash" ? "trash" : "active")
  const trashed = sub === "trash"

  // Счётчики на табах (всего по платформе). Лёгкий запрос limit=1 → читаем total.
  const [counts, setCounts] = useState<{ companies: number; users: number; invoices: number } | null>(null)
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch("/api/admin/clients?limit=1").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/users?limit=1").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/invoices?limit=1").then(r => r.ok ? r.json() : null),
    ]).then(([c, u, i]) => {
      if (!alive) return
      setCounts({ companies: c?.total ?? 0, users: u?.total ?? 0, invoices: i?.total ?? 0 })
    }).catch(() => {})
    return () => { alive = false }
  }, [])

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

  function changeSub(v: string) {
    const next = v === "trash" ? "trash" : "active"
    setSub(next)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (next === "active") params.delete("sub")
    else params.set("sub", "trash")
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

            {/* Табы хаба в одну строку: Компании/Пользователи/Счета | Активные/Корзина */}
            <div className="flex items-center gap-3 flex-wrap mb-5">
              <Tabs value={view} onValueChange={changeView}>
                <TabsList>
                  <TabsTrigger value="companies" className="gap-1.5"><Building2 className="w-3.5 h-3.5" />Компании{counts && <TabCount n={counts.companies} />}</TabsTrigger>
                  <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" />Пользователи{counts && <TabCount n={counts.users} />}</TabsTrigger>
                  <TabsTrigger value="invoices" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Счета{counts && <TabCount n={counts.invoices} />}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="h-6 w-px bg-border" />
              <Tabs value={sub} onValueChange={changeSub}>
                <TabsList>
                  <TabsTrigger value="active">Активные</TabsTrigger>
                  <TabsTrigger value="trash" className="gap-1.5"><Trash2 className="w-3.5 h-3.5" />Корзина</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {view === "companies" && <CompaniesTab trashed={trashed} />}
            {view === "users" && <UsersTab trashed={trashed} />}
            {view === "invoices" && <InvoicesTab trashed={trashed} />}

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
