"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Users, Plus, Phone, Mail, Building2, Star, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Supplier {
  id: string
  name: string
  inn: string
  contact: string
  phone: string
  email: string
  address: string
  paymentTerms: string
  itemCount: number
  lastPurchase: string
  rating: number
}

const INITIAL_SUPPLIERS: Supplier[] = [
  { id: "1", name: "МеталлСнаб",     inn: "7701234567", contact: "Громов Игорь",      phone: "+7 495 111-22-33", email: "igromov@metallsnab.ru",     address: "г. Москва, ул. Складская, 10",          paymentTerms: "Отсрочка 30 дней", itemCount: 48, lastPurchase: "20.03.2026", rating: 5 },
  { id: "2", name: "ХимТрейд",        inn: "7709876543", contact: "Фёдорова Марина",  phone: "+7 495 222-33-44", email: "fedorova@himtrade.com",      address: "г. Москва, пр. Химиков, 3",             paymentTerms: "Предоплата",       itemCount: 12, lastPurchase: "15.03.2026", rating: 4 },
  { id: "3", name: "ЭлектроОпт",      inn: "7703456789", contact: "Кузнецов Сергей",  phone: "+7 495 333-44-55", email: "kuznetsov@electroopt.ru",    address: "г. Москва, ул. Электродная, 7",         paymentTerms: "Отсрочка 14 дней", itemCount: 34, lastPurchase: "22.03.2026", rating: 4 },
  { id: "4", name: "СтройМатериал",   inn: "7705678901", contact: "Павлова Анна",     phone: "+7 495 444-55-66", email: "pavlova@stmat.ru",           address: "Московская обл., г. Подольск, ул. 5",   paymentTerms: "Отсрочка 21 день", itemCount: 22, lastPurchase: "18.03.2026", rating: 3 },
  { id: "5", name: "СкладМет",         inn: "7707890123", contact: "Волков Виктор",    phone: "+7 495 555-66-77", email: "volkov@skladmet.ru",         address: "г. Москва, 2-й Автозаводской пр., 4",   paymentTerms: "Предоплата",       itemCount: 9,  lastPurchase: "10.03.2026", rating: 2 },
  { id: "6", name: "УпакТара",         inn: "7702345678", contact: "Сидорова Елена",   phone: "+7 495 666-77-88", email: "sidorova@upaktara.ru",       address: "г. Москва, ул. Промышленная, 20",       paymentTerms: "Отсрочка 7 дней",  itemCount: 7,  lastPurchase: "25.03.2026", rating: 5 },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={cn("w-3.5 h-3.5", i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  )
}

export default function LogisticsSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS)
  const [search, setSearch] = useState("")
  const [filterRating, setFilterRating] = useState("all")
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: "", inn: "", contact: "", phone: "", email: "", address: "", paymentTerms: "", rating: "4" })

  const filtered = suppliers.filter(s => {
    if (filterRating !== "all" && s.rating !== Number(filterRating)) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.contact.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleAdd = () => {
    const newSupplier: Supplier = {
      id: String(Date.now()),
      name: form.name,
      inn: form.inn,
      contact: form.contact,
      phone: form.phone,
      email: form.email,
      address: form.address,
      paymentTerms: form.paymentTerms || "Предоплата",
      itemCount: 0,
      lastPurchase: "—",
      rating: Number(form.rating),
    }
    setSuppliers(prev => [...prev, newSupplier])
    setAddOpen(false)
    setForm({ name: "", inn: "", contact: "", phone: "", email: "", address: "", paymentTerms: "", rating: "4" })
    toast.success(`Поставщик "${newSupplier.name}" добавлен`)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Поставщики</h1>
                  <p className="text-sm text-muted-foreground">{suppliers.length} поставщиков</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4" /> Добавить поставщика
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Рейтинг" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все рейтинги</SelectItem>
                  {[5,4,3,2,1].map(r => <SelectItem key={r} value={String(r)}>{"★".repeat(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Cards/Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Название</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">ИНН</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Контакт</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Телефон</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Email</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3">Товаров</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Последняя закупка</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Рейтинг</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(s => (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{s.name}</p>
                                <p className="text-xs text-muted-foreground">{s.paymentTerms}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{s.inn}</td>
                          <td className="px-3 py-3 text-sm">{s.contact}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              {s.phone}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              {s.email}
                            </div>
                          </td>
                          <td className="text-right px-3 py-3 text-sm font-semibold">{s.itemCount}</td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">{s.lastPurchase}</td>
                          <td className="px-3 py-3">
                            <StarRating rating={s.rating} />
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">Нет поставщиков</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>

      {/* Add supplier sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Добавить поставщика
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ООО «Название»" />
            </div>
            <div className="space-y-1.5">
              <Label>ИНН</Label>
              <Input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} placeholder="7700000000" />
            </div>
            <div className="space-y-1.5">
              <Label>Контактное лицо</Label>
              <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Фамилия Имя" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+7 495 000-00-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="supplier@mail.ru" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Адрес</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="г. Москва, ..." />
            </div>
            <div className="space-y-1.5">
              <Label>Условия оплаты</Label>
              <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="Отсрочка 30 дней" />
            </div>
            <div className="space-y-1.5">
              <Label>Рейтинг</Label>
              <Select value={form.rating} onValueChange={v => setForm(f => ({ ...f, rating: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5,4,3,2,1].map(r => <SelectItem key={r} value={String(r)}>{"★".repeat(r)} ({r})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={!form.name}>Добавить поставщика</Button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
