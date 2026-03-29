"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Plus, Search, Phone, Mail, MessageCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ContactStatus = "active" | "inactive" | "new"

interface Contact {
  id: string
  name: string
  initials: string
  position: string
  company: string
  phone: string
  email: string
  telegram: string
  lastContact: string
  status: ContactStatus
  notes: string
}

const STATUS_COLORS: Record<ContactStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  active: "Активный",
  inactive: "Неактивный",
  new: "Новый",
}

const INITIAL_CONTACTS: Contact[] = [
  { id: "1", name: "Иван Смирнов", initials: "ИС", position: "Директор", company: "ООО Техностар", phone: "+7 999 111-22-33", email: "i.smirnov@technostar.ru", telegram: "@ivan_smirnov", lastContact: "Сегодня", status: "active", notes: "Принимает решения по закупкам" },
  { id: "2", name: "Павел Орлов", initials: "ПО", position: "Коммерческий директор", company: "ГК Вектор", phone: "+7 812 555-66-77", email: "p.orlov@vector-group.ru", telegram: "@p_orlov_vgk", lastContact: "Вчера", status: "active", notes: "" },
  { id: "3", name: "Роман Федоров", initials: "РФ", position: "Финансовый директор", company: "ЗАО Капитал", phone: "+7 495 333-44-55", email: "r.fedorov@capital-zao.ru", telegram: "—", lastContact: "3 дня назад", status: "active", notes: "Согласует бюджет" },
  { id: "4", name: "Светлана Морозова", initials: "СМ", position: "Главный бухгалтер", company: "ООО Горизонт", phone: "+7 383 222-33-44", email: "s.morozova@gorizont-nsk.ru", telegram: "@svetlana_mrz", lastContact: "Неделю назад", status: "active", notes: "" },
  { id: "5", name: "Михаил Волков", initials: "МВ", position: "IT-директор", company: "АО Альфа Ресурс", phone: "+7 495 666-77-88", email: "m.volkov@alfa-resource.ru", telegram: "@m_volkov_ar", lastContact: "2 дня назад", status: "active", notes: "Технический специалист" },
  { id: "6", name: "Елена Тихонова", initials: "ЕТ", position: "Менеджер по закупкам", company: "ООО СтройГрупп", phone: "+7 846 444-55-66", email: "e.tikhonova@stroygrupp.com", telegram: "—", lastContact: "5 дней назад", status: "inactive", notes: "" },
  { id: "7", name: "Кирилл Зайцев", initials: "КЗ", position: "Технический директор", company: "ИТ Решения ООО", phone: "+7 499 777-88-99", email: "k.zaitsev@itrешения.рф", telegram: "@k_zaitsev_itr", lastContact: "Сегодня", status: "active", notes: "Партнёр по интеграциям" },
  { id: "8", name: "Анна Кузнецова", initials: "АК", position: "PR-менеджер", company: "ООО Медиасфера", phone: "+7 495 888-99-00", email: "a.kuznetsova@mediasfera.ru", telegram: "@anna_k_media", lastContact: "10 дней назад", status: "inactive", notes: "" },
  { id: "9", name: "Дмитрий Лебедев", initials: "ДЛ", position: "CEO", company: "ООО Техностар", phone: "+7 999 000-11-22", email: "d.lebedev@technostar.ru", telegram: "@d_lebedev", lastContact: "Сегодня", status: "new", notes: "Новый контакт, рекомендация от Смирнова" },
  { id: "10", name: "Ольга Данилова", initials: "ОД", position: "HR-директор", company: "ГК Вектор", phone: "+7 812 111-22-33", email: "o.danilova@vector-group.ru", telegram: "@olga_danilova", lastContact: "Вчера", status: "active", notes: "" },
]

const COMPANIES = ["Все компании", "ООО Техностар", "ГК Вектор", "ЗАО Капитал", "ООО Горизонт", "АО Альфа Ресурс", "ООО СтройГрупп", "ИТ Решения ООО", "ООО Медиасфера"]

export default function SalesContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS)
  const [search, setSearch] = useState("")
  const [filterCompany, setFilterCompany] = useState("all")
  const [sheetOpen, setSheetOpen] = useState(false)

  const [form, setForm] = useState({
    name: "", position: "", company: "", phone: "", email: "", telegram: "", notes: "",
  })

  const filtered = contacts.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !c.company.toLowerCase().includes(search.toLowerCase()) &&
        !c.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCompany !== "all" && c.company !== filterCompany) return false
    return true
  })

  const handleCreate = () => {
    if (!form.name) { toast.error("Введите имя контакта"); return }
    const words = form.name.split(" ")
    const initials = (words[0]?.[0] || "") + (words[1]?.[0] || "")
    const newContact: Contact = {
      id: String(Date.now()),
      name: form.name,
      initials: initials.toUpperCase() || "??",
      position: form.position || "—",
      company: form.company || "—",
      phone: form.phone || "—",
      email: form.email || "—",
      telegram: form.telegram || "—",
      lastContact: "Только что",
      status: "new",
      notes: form.notes,
    }
    setContacts(prev => [newContact, ...prev])
    setSheetOpen(false)
    setForm({ name: "", position: "", company: "", phone: "", email: "", telegram: "", notes: "" })
    toast.success("Контакт добавлен")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Контакты</h1>
                  <p className="text-sm text-muted-foreground">{contacts.length} человек в базе</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить контакт
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по имени, email..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Все компании" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все компании</SelectItem>
                  {COMPANIES.slice(1).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Имя</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Должность</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Компания</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Телефон</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Telegram</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Контакт</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(contact => (
                      <tr key={contact.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="w-8 h-8 shrink-0">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">{contact.initials}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium text-foreground">{contact.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{contact.position}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{contact.company}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3 shrink-0" />
                            {contact.phone}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{contact.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MessageCircle className="w-3 h-3 shrink-0" />
                            {contact.telegram}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {contact.lastContact}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("text-xs border-0", STATUS_COLORS[contact.status])}>
                            {STATUS_LABELS[contact.status]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                          Контакты не найдены
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Add Contact Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Добавить контакт
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Имя *</Label>
              <Input placeholder="Иван Иванов" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Должность</Label>
              <Input placeholder="Директор" value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Компания</Label>
              <Select value={form.company} onValueChange={v => setForm(p => ({ ...p, company: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите компанию" /></SelectTrigger>
                <SelectContent>
                  {COMPANIES.slice(1).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input placeholder="+7 999 000-00-00" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input placeholder="ivan@company.ru" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telegram</Label>
              <Input placeholder="@username" value={form.telegram} onChange={e => setForm(p => ({ ...p, telegram: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Заметки</Label>
              <Textarea placeholder="Дополнительная информация..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate}>Добавить</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
