"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users } from "lucide-react"

export interface ContactFormData {
  lastName: string
  firstName: string
  middleName: string
  companyId: string
  position: string
  department: string
  phone: string
  mobile: string
  email: string
  telegram: string
  whatsapp: string
  isPrimary: boolean
  preferredContact: string
  comment: string
}

const EMPTY_FORM: ContactFormData = {
  lastName: "", firstName: "", middleName: "", companyId: "", position: "",
  department: "", phone: "", mobile: "", email: "", telegram: "",
  whatsapp: "", isPrimary: false, preferredContact: "", comment: "",
}

interface CompanyOption {
  id: string
  name: string
}

interface ContactFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ContactFormData) => void
  companies: CompanyOption[]
  initial?: Partial<ContactFormData>
  title?: string
}

export function ContactFormModal({ open, onOpenChange, onSubmit, companies, initial, title = "Добавить контакт" }: ContactFormModalProps) {
  const [form, setForm] = useState<ContactFormData>({ ...EMPTY_FORM, ...initial })

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, ...initial })
    }
  }, [open, initial])

  const handleSubmit = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return
    onSubmit(form)
    setForm({ ...EMPTY_FORM })
  }

  const update = (key: keyof ContactFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Фамилия *</Label>
              <Input placeholder="Иванов" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Имя *</Label>
              <Input placeholder="Иван" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Отчество</Label>
            <Input placeholder="Иванович" value={form.middleName} onChange={(e) => update("middleName", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Компания *</Label>
            <Select value={form.companyId} onValueChange={(v) => update("companyId", v)}>
              <SelectTrigger className="border border-input rounded-md"><SelectValue placeholder="Выберите компанию" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Должность</Label>
              <Input placeholder="Генеральный директор" value={form.position} onChange={(e) => update("position", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Отдел</Label>
              <Input placeholder="Отдел продаж" value={form.department} onChange={(e) => update("department", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input placeholder="+7 (495) 000-00-00" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Мобильный</Label>
              <Input placeholder="+7 (999) 000-00-00" value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input placeholder="ivan@company.ru" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telegram</Label>
              <Input placeholder="@username" value={form.telegram} onChange={(e) => update("telegram", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input placeholder="+7 999 000-00-00" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="isPrimary"
                checked={form.isPrimary}
                onCheckedChange={(checked) => update("isPrimary", !!checked)}
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">Основной контакт в компании</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Предпочтительный способ связи</Label>
              <Select value={form.preferredContact} onValueChange={(v) => update("preferredContact", v)}>
                <SelectTrigger className="border border-input rounded-md"><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="phone">Телефон</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Комментарий</Label>
            <Textarea placeholder="Дополнительная информация..." value={form.comment} onChange={(e) => update("comment", e.target.value)} rows={3} className="bg-background border border-input" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={!form.firstName.trim() || !form.lastName.trim()}>
            {initial?.firstName ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
