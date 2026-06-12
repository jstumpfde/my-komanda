"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ContactsTable, type SalesContact } from "@/components/sales/contacts-table"
import { ContactFormModal, type ContactFormData } from "@/components/sales/contact-form-modal"
import { Users, Plus, Search } from "lucide-react"
import { toast } from "sonner"

type CompanyOption = { id: string; name: string }

export default function SalesContactsPage() {
  const [contacts, setContacts] = useState<SalesContact[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterCompany, setFilterCompany] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)

  // Загружаем контакты и компании параллельно
  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch("/api/modules/sales/contacts").then((r) => r.json()),
      fetch("/api/modules/sales/companies").then((r) => r.json()),
    ])
      .then(([contactsData, companiesData]) => {
        const companiesList: CompanyOption[] = (companiesData.companies ?? []).map(
          (c: { id: string; name: string }) => ({ id: c.id, name: c.name }),
        )
        const companyMap = new Map(companiesList.map((c) => [c.id, c.name]))

        // Маппим: добавляем companyName из загруженных компаний
        const mapped: SalesContact[] = (contactsData.contacts ?? []).map(
          (c: Omit<SalesContact, "companyName">) => ({
            ...c,
            companyName: c.companyId ? (companyMap.get(c.companyId) ?? "—") : null,
          }),
        )
        setContacts(mapped)
        setCompanies(companiesList)
      })
      .catch(() => {
        setContacts([])
        setCompanies([])
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = contacts.filter((c) => {
    const fullName = `${c.lastName} ${c.firstName} ${c.middleName || ""}`.toLowerCase()
    if (search && !fullName.includes(search.toLowerCase()) && !(c.email || "").toLowerCase().includes(search.toLowerCase()) && !(c.phone || "").includes(search)) return false
    if (filterCompany !== "all" && c.companyId !== filterCompany) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    return true
  })

  const handleCreate = (data: ContactFormData) => {
    const company = companies.find((c) => c.id === data.companyId)
    fetch("/api/modules/sales/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: data.firstName,
        last_name: data.lastName,
        middle_name: data.middleName || null,
        company_id: data.companyId || null,
        position: data.position || null,
        department: data.department || null,
        phone: data.phone || null,
        mobile: data.mobile || null,
        email: data.email || null,
        telegram: data.telegram || null,
        whatsapp: data.whatsapp || null,
        comment: data.comment || null,
        is_primary: data.isPrimary,
      }),
    })
      .then((r) => r.json())
      .then((created) => {
        const newContact: SalesContact = {
          ...created,
          companyName: company?.name ?? null,
        }
        setContacts((prev) => [newContact, ...prev])
        setModalOpen(false)
        toast.success("Контакт добавлен")
      })
      .catch(() => toast.error("Не удалось добавить контакт"))
  }

  const handleArchive = (contact: SalesContact) => {
    fetch("/api/modules/sales/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contact.id }),
    })
      .then(() => {
        setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, status: "archive" } : c))
        toast.success("Контакт перемещён в архив")
      })
      .catch(() => toast.error("Не удалось архивировать контакт"))
  }

  const handleRestore = (contact: SalesContact) => {
    fetch("/api/modules/sales/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contact.id, status: "active" }),
    })
      .then(() => {
        setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, status: "active" } : c))
        toast.success("Контакт восстановлен")
      })
      .catch(() => toast.error("Не удалось восстановить контакт"))
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Контакты</h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? "Загрузка…" : `${contacts.length} контактов в базе`}
                  </p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить контакт
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[230px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по имени, email, телефону..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="w-[200px] h-9 border border-input rounded-md"><SelectValue placeholder="Компания" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все компании</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px] h-9 border border-input rounded-md"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активный</SelectItem>
                  <SelectItem value="archive">Архив</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading / empty state */}
            {loading && (
              <p className="text-sm text-muted-foreground py-10 text-center">Загрузка контактов…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">Пока нет данных</p>
            )}

            {/* Table */}
            {!loading && filtered.length > 0 && (
              <ContactsTable
                contacts={filtered}
                onArchive={handleArchive}
                onRestore={handleRestore}
              />
            )}
          </div>
        </main>
      </SidebarInset>

      <ContactFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreate}
        companies={companies}
      />
    </SidebarProvider>
  )
}
