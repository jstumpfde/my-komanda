"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Building2, Users, Plus, Search } from "lucide-react"
import { CompanyFormModal, type CompanyFormData } from "@/components/sales/company-form-modal"
import { ContactFormModal, type ContactFormData } from "@/components/sales/contact-form-modal"
import { cn } from "@/lib/utils"

interface CompanyOption {
  id: string
  name: string
  inn?: string | null
  city?: string | null
}

interface ContactOption {
  id: string
  firstName: string
  lastName: string
  position?: string | null
}

interface CompanySelectorProps {
  mode: "own" | "client"
  clientCompanyId: string | null
  clientContactId: string | null
  onModeChange: (mode: "own" | "client") => void
  onCompanyChange: (id: string | null) => void
  onContactChange: (id: string | null) => void
}

// Mock data — in real implementation, this would fetch from API
const MOCK_COMPANIES: CompanyOption[] = [
  { id: "1", name: 'ООО "Ромашка"', inn: "7701234567", city: "Москва" },
  { id: "2", name: 'ЗАО "Альфа Групп"', inn: "7709876543", city: "Москва" },
  { id: "3", name: "ИП Петров", inn: "771234567890", city: "Санкт-Петербург" },
  { id: "4", name: 'ООО "ТехноПлюс"', inn: "5001234567", city: "Казань" },
  { id: "5", name: 'ООО "СтройМастер"', inn: "6601234567", city: "Екатеринбург" },
]

const MOCK_CONTACTS: Record<string, ContactOption[]> = {
  "1": [
    { id: "1", firstName: "Иван", lastName: "Петров", position: "Генеральный директор" },
    { id: "2", firstName: "Мария", lastName: "Сидорова", position: "HR-директор" },
    { id: "3", firstName: "Алексей", lastName: "Козлов", position: "CTO" },
  ],
  "2": [
    { id: "4", firstName: "Елена", lastName: "Волкова", position: "Финансовый директор" },
    { id: "5", firstName: "Дмитрий", lastName: "Новиков", position: "Руководитель отдела продаж" },
  ],
  "3": [
    { id: "6", firstName: "Сергей", lastName: "Петров", position: "ИП" },
  ],
  "4": [
    { id: "7", firstName: "Ольга", lastName: "Смирнова", position: "Директор по персоналу" },
  ],
  "5": [
    { id: "8", firstName: "Андрей", lastName: "Кузнецов", position: "Прораб" },
  ],
}

function OwnCompanyInfo() {
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) => {
        const n = (data?.short_name ?? data?.company_name ?? data?.name) as string | undefined
        setName(n || null)
      })
      .catch(() => setName(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border p-3 bg-muted/30 flex items-center gap-2">
        <Building2 className="size-4 text-muted-foreground shrink-0 animate-pulse" />
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3 bg-muted/30 flex items-center gap-2">
      <Building2 className="size-4 text-muted-foreground shrink-0" />
      {name ? (
        <p className="text-sm font-medium">{name}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Не указана (настройте в Настройки → Компания)</p>
      )}
    </div>
  )
}

export function CompanySelector({
  mode,
  clientCompanyId,
  clientContactId,
  onModeChange,
  onCompanyChange,
  onContactChange,
}: CompanySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [localCompanies, setLocalCompanies] = useState<CompanyOption[]>(MOCK_COMPANIES)
  const [localContacts, setLocalContacts] = useState<Record<string, ContactOption[]>>(MOCK_CONTACTS)

  const filteredCompanies = searchQuery
    ? localCompanies.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.inn || "").includes(searchQuery),
      )
    : localCompanies

  const contacts = clientCompanyId ? (localContacts[clientCompanyId] || []) : []

  const handleCompanyCreate = (data: CompanyFormData) => {
    const newId = String(Date.now())
    const newCompany: CompanyOption = {
      id: newId,
      name: data.name,
      inn: data.inn || null,
      city: data.city || null,
    }
    setLocalCompanies((prev) => [newCompany, ...prev])
    setLocalContacts((prev) => ({ ...prev, [newId]: [] }))
    onCompanyChange(newId)
    setCompanyModalOpen(false)
  }

  const handleContactCreate = (data: ContactFormData) => {
    if (!clientCompanyId) return
    const newId = String(Date.now())
    const newContact: ContactOption = {
      id: newId,
      firstName: data.firstName,
      lastName: data.lastName,
      position: data.position || null,
    }
    setLocalContacts((prev) => ({
      ...prev,
      [clientCompanyId]: [...(prev[clientCompanyId] || []), newContact],
    }))
    onContactChange(newId)
    setContactModalOpen(false)
  }

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Компания</Label>

      <RadioGroup
        value={mode}
        onValueChange={(v) => {
          onModeChange(v as "own" | "client")
          if (v === "own") {
            onCompanyChange(null)
            onContactChange(null)
          }
        }}
        className="flex gap-4"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="own" id="company-own" />
          <Label htmlFor="company-own" className="cursor-pointer text-sm">Своя компания</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="client" id="company-client" />
          <Label htmlFor="company-client" className="cursor-pointer text-sm">Для клиента</Label>
        </div>
      </RadioGroup>

      {mode === "own" && <OwnCompanyInfo />}

      {mode === "client" && (
        <div className="space-y-3">
          {/* Company selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Компания-клиент</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setCompanyModalOpen(true)}>
                <Plus className="w-3 h-3" />
                Новая компания
              </Button>
            </div>
            <Select value={clientCompanyId || ""} onValueChange={(v) => { onCompanyChange(v); onContactChange(null) }}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите компанию" />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-7 h-8 text-sm"
                      placeholder="Поиск..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                {filteredCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{c.name}</span>
                      {c.inn && <span className="text-xs text-muted-foreground ml-1">ИНН {c.inn}</span>}
                    </div>
                  </SelectItem>
                ))}
                {filteredCompanies.length === 0 && (
                  <div className="py-4 text-center text-sm text-muted-foreground">Не найдено</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Contact selector */}
          {clientCompanyId && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Контактное лицо</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setContactModalOpen(true)}>
                  <Plus className="w-3 h-3" />
                  Новый контакт
                </Button>
              </div>
              <Select value={clientContactId || ""} onValueChange={onContactChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите контакт" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{c.lastName} {c.firstName}</span>
                        {c.position && <span className="text-xs text-muted-foreground ml-1">· {c.position}</span>}
                      </div>
                    </SelectItem>
                  ))}
                  {contacts.length === 0 && (
                    <div className="py-4 text-center text-sm text-muted-foreground">Нет контактов</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <CompanyFormModal
        open={companyModalOpen}
        onOpenChange={setCompanyModalOpen}
        onSubmit={handleCompanyCreate}
        title="Новая компания-клиент"
      />

      {clientCompanyId && (
        <ContactFormModal
          open={contactModalOpen}
          onOpenChange={setContactModalOpen}
          onSubmit={handleContactCreate}
          companies={localCompanies.map((c) => ({ id: c.id, name: c.name }))}
          initial={{ companyId: clientCompanyId }}
          title="Новый контакт"
        />
      )}
    </div>
  )
}
