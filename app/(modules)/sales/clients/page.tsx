"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CompaniesTable, type SalesCompany } from "@/components/sales/companies-table"
import { CompanyFormModal, type CompanyFormData } from "@/components/sales/company-form-modal"
import { Building2, Plus, Search, SlidersHorizontal, Settings2 } from "lucide-react"
import { toast } from "sonner"

export default function SalesClientsPage() {
  const [companies, setCompanies] = useState<SalesCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch("/api/modules/sales/companies")
      .then((r) => r.json())
      .then((data) => {
        // API не возвращает contactsCount/vacanciesCount — подставляем 0
        const mapped: SalesCompany[] = (data.companies ?? []).map(
          (c: Omit<SalesCompany, "contactsCount" | "vacanciesCount">) => ({
            ...c,
            contactsCount: 0,
            vacanciesCount: 0,
          }),
        )
        setCompanies(mapped)
      })
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = companies.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.inn || "").includes(search)) return false
    if (filterType !== "all" && c.type !== filterType) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    return true
  })

  const handleCreate = (data: CompanyFormData) => {
    fetch("/api/modules/sales/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        inn: data.inn || null,
        ogrn: data.ogrn || null,
        industry: data.industry || null,
        city: data.city || null,
        address: data.address || null,
        website: data.website || null,
        phone: data.phone || null,
        email: data.email || null,
        revenue: data.revenue || null,
        employees_count: data.employeesCount ? parseInt(data.employeesCount) : null,
        description: data.description || null,
        type: data.type,
      }),
    })
      .then((r) => r.json())
      .then((created) => {
        const newCompany: SalesCompany = {
          ...created,
          contactsCount: 0,
          vacanciesCount: 0,
        }
        setCompanies((prev) => [newCompany, ...prev])
        setModalOpen(false)
        toast.success("Компания добавлена")
      })
      .catch(() => toast.error("Не удалось добавить компанию"))
  }

  const handleArchive = (company: SalesCompany) => {
    fetch("/api/modules/sales/companies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: company.id }),
    })
      .then(() => {
        setCompanies((prev) => prev.map((c) => c.id === company.id ? { ...c, status: "archive" } : c))
        toast.success("Компания перемещена в архив")
      })
      .catch(() => toast.error("Не удалось архивировать компанию"))
  }

  const handleRestore = (company: SalesCompany) => {
    fetch("/api/modules/sales/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: company.id, status: "active" }),
    })
      .then(() => {
        setCompanies((prev) => prev.map((c) => c.id === company.id ? { ...c, status: "active" } : c))
        toast.success("Компания восстановлена")
      })
      .catch(() => toast.error("Не удалось восстановить компанию"))
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Компании</h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? "Загрузка…" : `${companies.length} компаний в базе`}
                  </p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить компанию
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[240px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по названию, ИНН..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px] h-9 border border-input rounded-md"><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="client">Клиент</SelectItem>
                  <SelectItem value="partner">Партнёр</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px] h-9 border border-input rounded-md"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активная</SelectItem>
                  <SelectItem value="archive">Архив</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9 gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" />Фильтры</Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5"><Settings2 className="w-3.5 h-3.5" />Настройки</Button>
            </div>

            {/* Loading / empty state */}
            {loading && (
              <p className="text-sm text-muted-foreground py-10 text-center">Загрузка компаний…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">Пока нет данных</p>
            )}

            {/* Table */}
            {!loading && filtered.length > 0 && (
              <CompaniesTable
                companies={filtered}
                onArchive={handleArchive}
                onRestore={handleRestore}
              />
            )}
          </div>
        </main>
      </SidebarInset>

      <CompanyFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreate}
      />
    </SidebarProvider>
  )
}
