"use client"

import { useState } from "react"
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

const MOCK_COMPANIES = [
  { id: "1", name: 'ООО "Ромашка"' },
  { id: "2", name: 'ЗАО "Альфа Групп"' },
  { id: "3", name: "ИП Петров" },
  { id: "4", name: 'ООО "ТехноПлюс"' },
  { id: "5", name: 'ООО "СтройМастер"' },
]

const MOCK_CONTACTS: SalesContact[] = [
  { id: "1", companyId: "1", firstName: "Иван", lastName: "Петров", middleName: "Сергеевич", position: "Генеральный директор", department: "Руководство", phone: "+7 (495) 111-22-33", mobile: "+7 (999) 111-22-33", email: "i.petrov@romashka.ru", telegram: "@ipetrov", whatsapp: "+79991112233", comment: null, isPrimary: true, status: "active", companyName: 'ООО "Ромашка"' },
  { id: "2", companyId: "1", firstName: "Мария", lastName: "Сидорова", middleName: null, position: "HR-директор", department: "HR", phone: "+7 (495) 111-22-34", mobile: null, email: "m.sidorova@romashka.ru", telegram: "@msidorova", whatsapp: null, comment: "Отвечает за подбор", isPrimary: false, status: "active", companyName: 'ООО "Ромашка"' },
  { id: "3", companyId: "1", firstName: "Алексей", lastName: "Козлов", middleName: "Игоревич", position: "CTO", department: "IT", phone: null, mobile: "+7 (999) 222-33-44", email: "a.kozlov@romashka.ru", telegram: "@akozlov", whatsapp: null, comment: null, isPrimary: false, status: "active", companyName: 'ООО "Ромашка"' },
  { id: "4", companyId: "2", firstName: "Елена", lastName: "Волкова", middleName: "Андреевна", position: "Финансовый директор", department: "Финансы", phone: "+7 (495) 222-33-44", mobile: "+7 (999) 333-44-55", email: "e.volkova@alfagroup.ru", telegram: "@evolkova", whatsapp: "+79993334455", comment: "Согласует бюджеты", isPrimary: true, status: "active", companyName: 'ЗАО "Альфа Групп"' },
  { id: "5", companyId: "2", firstName: "Дмитрий", lastName: "Новиков", middleName: null, position: "Руководитель отдела продаж", department: "Продажи", phone: "+7 (495) 222-33-45", mobile: null, email: "d.novikov@alfagroup.ru", telegram: null, whatsapp: null, comment: null, isPrimary: false, status: "active", companyName: 'ЗАО "Альфа Групп"' },
  { id: "6", companyId: "3", firstName: "Сергей", lastName: "Петров", middleName: "Алексеевич", position: "Индивидуальный предприниматель", department: null, phone: "+7 (812) 333-44-55", mobile: "+7 (999) 444-55-66", email: "petrov@mail.ru", telegram: "@spetrov", whatsapp: "+79994445566", comment: null, isPrimary: true, status: "active", companyName: "ИП Петров" },
  { id: "7", companyId: "4", firstName: "Ольга", lastName: "Смирнова", middleName: "Владимировна", position: "Директор по персоналу", department: "HR", phone: "+7 (843) 444-55-66", mobile: null, email: "o.smirnova@technoplus.ru", telegram: "@osmirnova", whatsapp: null, comment: "Основной контакт по найму", isPrimary: true, status: "active", companyName: 'ООО "ТехноПлюс"' },
  { id: "8", companyId: "5", firstName: "Андрей", lastName: "Кузнецов", middleName: null, position: "Прораб", department: "Строительство", phone: "+7 (343) 555-66-77", mobile: "+7 (999) 555-66-77", email: "a.kuznetsov@stroymaster.ru", telegram: null, whatsapp: "+79995556677", comment: null, isPrimary: true, status: "active", companyName: 'ООО "СтройМастер"' },
]

export default function SalesContactsPage() {
  const [contacts, setContacts] = useState<SalesContact[]>(MOCK_CONTACTS)
  const [search, setSearch] = useState("")
  const [filterCompany, setFilterCompany] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [modalOpen, setModalOpen] = useState(false)

  const filtered = contacts.filter((c) => {
    const fullName = `${c.lastName} ${c.firstName} ${c.middleName || ""}`.toLowerCase()
    if (search && !fullName.includes(search.toLowerCase()) && !(c.email || "").toLowerCase().includes(search.toLowerCase()) && !(c.phone || "").includes(search)) return false
    if (filterCompany !== "all" && c.companyId !== filterCompany) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    return true
  })

  const handleCreate = (data: ContactFormData) => {
    const company = MOCK_COMPANIES.find((c) => c.id === data.companyId)
    const newContact: SalesContact = {
      id: String(Date.now()),
      companyId: data.companyId || null,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName || null,
      position: data.position || null,
      department: data.department || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      email: data.email || null,
      telegram: data.telegram || null,
      whatsapp: data.whatsapp || null,
      comment: data.comment || null,
      isPrimary: data.isPrimary,
      status: "active",
      companyName: company?.name || "—",
    }
    setContacts((prev) => [newContact, ...prev])
    setModalOpen(false)
    toast.success("Контакт добавлен")
  }

  const handleArchive = (contact: SalesContact) => {
    setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, status: "archive" } : c))
    toast.success("Контакт перемещён в архив")
  }

  const handleRestore = (contact: SalesContact) => {
    setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, status: "active" } : c))
    toast.success("Контакт восстановлен")
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
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Контакты</h1>
                  <p className="text-sm text-muted-foreground">{contacts.length} контактов в базе</p>
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
                  {MOCK_COMPANIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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

            {/* Table */}
            <ContactsTable
              contacts={filtered}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
          </div>
        </main>
      </SidebarInset>

      <ContactFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreate}
        companies={MOCK_COMPANIES}
      />
    </SidebarProvider>
  )
}
