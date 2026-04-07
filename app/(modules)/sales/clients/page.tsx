"use client"

import { useState } from "react"
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

const MOCK_COMPANIES: SalesCompany[] = [
  { id: "1", name: 'ООО "Ромашка"', inn: "7701234567", kpp: "770101001", ogrn: null, industry: "IT", city: "Москва", address: null, website: "romashka.ru", phone: "+7 (495) 111-22-33", email: "info@romashka.ru", revenue: "50–200 млн ₽", employeesCount: 120, description: null, logoUrl: null, type: "client", status: "active", contactsCount: 3, vacanciesCount: 2 },
  { id: "2", name: 'ЗАО "Альфа Групп"', inn: "7709876543", kpp: "770901001", ogrn: null, industry: "Финансы", city: "Москва", address: null, website: "alfagroup.ru", phone: "+7 (495) 222-33-44", email: "info@alfagroup.ru", revenue: "500 млн – 1 млрд ₽", employeesCount: 450, description: null, logoUrl: null, type: "client", status: "active", contactsCount: 5, vacanciesCount: 1 },
  { id: "3", name: "ИП Петров", inn: "771234567890", kpp: null, ogrn: null, industry: "Ритейл", city: "Санкт-Петербург", address: null, website: null, phone: "+7 (812) 333-44-55", email: "petrov@mail.ru", revenue: "до 10 млн ₽", employeesCount: 5, description: null, logoUrl: null, type: "client", status: "active", contactsCount: 1, vacanciesCount: 0 },
  { id: "4", name: 'ООО "ТехноПлюс"', inn: "5001234567", kpp: "500101001", ogrn: null, industry: "Производство", city: "Казань", address: null, website: "technoplus.ru", phone: "+7 (843) 444-55-66", email: "info@technoplus.ru", revenue: "200–500 млн ₽", employeesCount: 200, description: null, logoUrl: null, type: "client", status: "active", contactsCount: 2, vacanciesCount: 3 },
  { id: "5", name: 'ООО "СтройМастер"', inn: "6601234567", kpp: "660101001", ogrn: null, industry: "Строительство", city: "Екатеринбург", address: null, website: "stroymaster.ru", phone: "+7 (343) 555-66-77", email: "info@stroymaster.ru", revenue: "10–50 млн ₽", employeesCount: 35, description: null, logoUrl: null, type: "client", status: "archive", contactsCount: 1, vacanciesCount: 0 },
]

const INDUSTRIES = ["IT", "Финансы", "Ритейл", "Производство", "Строительство", "Логистика", "Медицина", "Другое"]

export default function SalesClientsPage() {
  const [companies, setCompanies] = useState<SalesCompany[]>(MOCK_COMPANIES)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)

  const filtered = companies.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.inn || "").includes(search)) return false
    if (filterType !== "all" && c.type !== filterType) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    return true
  })

  const handleCreate = (data: CompanyFormData) => {
    const newCompany: SalesCompany = {
      id: String(Date.now()),
      name: data.name,
      inn: data.inn || null,
      kpp: null,
      ogrn: data.ogrn || null,
      industry: data.industry || null,
      city: data.city || null,
      address: data.address || null,
      website: data.website || null,
      phone: data.phone || null,
      email: data.email || null,
      revenue: data.revenue || null,
      employeesCount: data.employeesCount ? parseInt(data.employeesCount) : null,
      description: data.description || null,
      logoUrl: null,
      type: data.type,
      status: "active",
      contactsCount: 0,
      vacanciesCount: 0,
    }
    setCompanies((prev) => [newCompany, ...prev])
    setModalOpen(false)
    toast.success("Компания добавлена")
  }

  const handleArchive = (company: SalesCompany) => {
    setCompanies((prev) => prev.map((c) => c.id === company.id ? { ...c, status: "archive" } : c))
    toast.success("Компания перемещена в архив")
  }

  const handleRestore = (company: SalesCompany) => {
    setCompanies((prev) => prev.map((c) => c.id === company.id ? { ...c, status: "active" } : c))
    toast.success("Компания восстановлена")
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
                  <h1 className="text-2xl font-semibold">Компании</h1>
                  <p className="text-sm text-muted-foreground">{companies.length} компаний в базе</p>
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

            {/* Table */}
            <CompaniesTable
              companies={filtered}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
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
