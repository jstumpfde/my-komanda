"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Building2, Users, Plus, Search } from "lucide-react"
import { CompanyFormModal, type CompanyFormData } from "@/components/sales/company-form-modal"
import { ContactFormModal, type ContactFormData } from "@/components/sales/contact-form-modal"

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

function OwnCompanyInfo() {
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) => {
        const n = (data?.name) as string | undefined
        setName(n || null)
      })
      .catch(() => setName(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border p-3 bg-[var(--input-bg)] flex items-center gap-2" style={{ width: "fit-content", minWidth: "300px", maxWidth: "50%" }}>
        <Building2 className="size-4 text-muted-foreground shrink-0 animate-pulse" />
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3 bg-[var(--input-bg)] flex items-center gap-2" style={{ width: "fit-content", minWidth: "300px", maxWidth: "50%" }}>
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
  const [localCompanies, setLocalCompanies] = useState<CompanyOption[]>([])
  // Контакты кешируем по companyId, чтобы не дёргать API при каждом рендере.
  const [localContacts, setLocalContacts] = useState<Record<string, ContactOption[]>>({})

  // Реальный список компаний-клиентов из модуля продаж (tenant-scoped на сервере).
  useEffect(() => {
    if (mode !== "client") return
    fetch("/api/modules/sales/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { companies?: CompanyOption[] } | null) => {
        setLocalCompanies(Array.isArray(json?.companies) ? json!.companies : [])
      })
      .catch(() => setLocalCompanies([]))
  }, [mode])

  // Контакты выбранной компании — подгружаем при выборе (и для уже сохранённой
  // компании при открытии вакансии), если ещё не в кеше.
  useEffect(() => {
    if (mode !== "client" || !clientCompanyId) return
    if (localContacts[clientCompanyId]) return
    fetch(`/api/modules/sales/contacts?company_id=${encodeURIComponent(clientCompanyId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { contacts?: ContactOption[] } | null) => {
        setLocalContacts((prev) => ({ ...prev, [clientCompanyId]: Array.isArray(json?.contacts) ? json!.contacts : [] }))
      })
      .catch(() => setLocalContacts((prev) => ({ ...prev, [clientCompanyId]: [] })))
  }, [mode, clientCompanyId, localContacts])

  const filteredCompanies = searchQuery
    ? localCompanies.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.inn || "").includes(searchQuery),
      )
    : localCompanies

  const contacts = clientCompanyId ? (localContacts[clientCompanyId] || []) : []

  const handleCompanyCreate = async (data: CompanyFormData) => {
    try {
      const res = await fetch("/api/modules/sales/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const company = await res.json() as CompanyOption
      setLocalCompanies((prev) => [{ id: company.id, name: company.name, inn: company.inn, city: company.city }, ...prev])
      setLocalContacts((prev) => ({ ...prev, [company.id]: [] }))
      onCompanyChange(company.id)
      onContactChange(null)
      setCompanyModalOpen(false)
    } catch {
      toast.error("Не удалось создать компанию-клиента")
    }
  }

  const handleContactCreate = async (data: ContactFormData) => {
    if (!clientCompanyId) return
    try {
      const res = await fetch("/api/modules/sales/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: clientCompanyId,
          first_name: data.firstName,
          last_name: data.lastName,
          middle_name: data.middleName,
          position: data.position,
          department: data.department,
          phone: data.phone,
          mobile: data.mobile,
          email: data.email,
          telegram: data.telegram,
        }),
      })
      if (!res.ok) throw new Error()
      const contact = await res.json() as ContactOption
      setLocalContacts((prev) => ({
        ...prev,
        [clientCompanyId]: [...(prev[clientCompanyId] || []), { id: contact.id, firstName: contact.firstName, lastName: contact.lastName, position: contact.position }],
      }))
      onContactChange(contact.id)
      setContactModalOpen(false)
    } catch {
      toast.error("Не удалось создать контакт")
    }
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
            <Label className="text-xs text-muted-foreground">Компания-клиент</Label>
            <div className="flex items-center gap-3 w-full">
              <Select value={clientCompanyId || ""} onValueChange={(v) => { onCompanyChange(v); onContactChange(null) }}>
                <SelectTrigger className="bg-[var(--input-bg)] border border-input w-1/2 min-w-[300px]" style={{ maxWidth: "calc(100% - 160px)" }}>
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
              <Button variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0 whitespace-nowrap" onClick={() => setCompanyModalOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                Новая компания
              </Button>
            </div>
          </div>

          {/* Contact selector */}
          {clientCompanyId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Контактное лицо</Label>
              <div className="flex items-center gap-3 w-full">
              <Select value={clientContactId || ""} onValueChange={onContactChange}>
                <SelectTrigger className="bg-[var(--input-bg)] border border-input w-1/2 min-w-[300px]" style={{ maxWidth: "calc(100% - 160px)" }}>
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
              <Button variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0 whitespace-nowrap" onClick={() => setContactModalOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                Новый контакт
              </Button>
              </div>
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
