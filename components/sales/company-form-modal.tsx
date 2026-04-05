"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2 } from "lucide-react"

const INDUSTRIES = [
  "IT", "Финансы", "Ритейл", "Производство", "Строительство",
  "Логистика", "Медицина", "Образование", "Медиа", "Телеком",
  "Энергетика", "Сельское хозяйство", "Другое",
]

const REVENUE_RANGES = [
  "до 10 млн ₽", "10–50 млн ₽", "50–200 млн ₽", "200–500 млн ₽",
  "500 млн – 1 млрд ₽", "более 1 млрд ₽",
]

export interface CompanyFormData {
  name: string
  inn: string
  kpp: string
  ogrn: string
  industry: string
  city: string
  address: string
  phone: string
  email: string
  website: string
  revenue: string
  employeesCount: string
  type: string
  description: string
}

const EMPTY_FORM: CompanyFormData = {
  name: "", inn: "", kpp: "", ogrn: "", industry: "", city: "",
  address: "", phone: "", email: "", website: "", revenue: "",
  employeesCount: "", type: "client", description: "",
}

interface CompanyFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CompanyFormData) => void
  initial?: Partial<CompanyFormData>
  title?: string
}

export function CompanyFormModal({ open, onOpenChange, onSubmit, initial, title = "Добавить компанию" }: CompanyFormModalProps) {
  const [form, setForm] = useState<CompanyFormData>({ ...EMPTY_FORM, ...initial })

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSubmit(form)
    setForm({ ...EMPTY_FORM })
  }

  const update = (key: keyof CompanyFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Название *</Label>
            <Input placeholder='ООО "Ромашка"' value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>ИНН</Label>
              <Input placeholder="7701234567" value={form.inn} onChange={(e) => update("inn", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>КПП</Label>
              <Input placeholder="770101001" value={form.kpp} onChange={(e) => update("kpp", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ОГРН</Label>
              <Input placeholder="1027700000000" value={form.ogrn} onChange={(e) => update("ogrn", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Отрасль</Label>
              <Select value={form.industry} onValueChange={(v) => update("industry", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Город</Label>
              <Input placeholder="Москва" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Адрес</Label>
            <Input placeholder="ул. Ленина, д. 1" value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input placeholder="+7 (495) 000-00-00" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input placeholder="info@company.ru" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Сайт</Label>
            <Input placeholder="https://company.ru" value={form.website} onChange={(e) => update("website", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Оборот</Label>
              <Select value={form.revenue} onValueChange={(v) => update("revenue", v)}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  {REVENUE_RANGES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Сотрудников</Label>
              <Input type="number" placeholder="50" value={form.employeesCount} onChange={(e) => update("employeesCount", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={form.type} onValueChange={(v) => update("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Клиент</SelectItem>
                  <SelectItem value="partner">Партнёр</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Textarea placeholder="Дополнительная информация о компании..." value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim()}>
            {initial?.name ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
