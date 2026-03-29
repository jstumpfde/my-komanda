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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building2, Plus, Search, Users, Briefcase, Clock, Globe, Phone, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ClientStatus = "active" | "inactive" | "prospect"

interface Client {
  id: string
  name: string
  inn: string
  industry: string
  city: string
  website: string
  contactsCount: number
  dealsCount: number
  lastActivity: string
  status: ClientStatus
  notes: string
}

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Активный",
  inactive: "Неактивный",
  prospect: "Перспективный",
}

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  prospect: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
}

const INDUSTRIES = ["ИТ", "Производство", "Торговля", "Строительство", "Финансы", "Медиа", "Логистика", "Другое"]

const INITIAL_CLIENTS: Client[] = [
  { id: "1", name: "ООО Техностар", inn: "7701234567", industry: "ИТ", city: "Москва", website: "technostar.ru", contactsCount: 3, dealsCount: 5, lastActivity: "Сегодня", status: "active", notes: "Ключевой клиент, внедрение CRM" },
  { id: "2", name: "ГК Вектор", inn: "7809876543", industry: "Производство", city: "Санкт-Петербург", website: "vector-group.ru", contactsCount: 5, dealsCount: 3, lastActivity: "Вчера", status: "active", notes: "Крупный заказчик оборудования" },
  { id: "3", name: "ЗАО Капитал", inn: "5044567890", industry: "Финансы", city: "Москва", website: "capital-zao.ru", contactsCount: 2, dealsCount: 7, lastActivity: "3 дня назад", status: "active", notes: "" },
  { id: "4", name: "ООО СтройГрупп", inn: "6321234567", industry: "Строительство", city: "Самара", website: "stroygrupp.com", contactsCount: 4, dealsCount: 2, lastActivity: "Неделю назад", status: "prospect", notes: "Переговоры по тендеру" },
  { id: "5", name: "АО Альфа Ресурс", inn: "7751234567", industry: "Торговля", city: "Москва", website: "alfa-resource.ru", contactsCount: 2, dealsCount: 4, lastActivity: "2 дня назад", status: "active", notes: "" },
  { id: "6", name: "ООО Медиасфера", inn: "7707654321", industry: "Медиа", city: "Москва", website: "mediasfera.ru", contactsCount: 1, dealsCount: 1, lastActivity: "10 дней назад", status: "inactive", notes: "Приостановили сотрудничество" },
  { id: "7", name: "ООО Горизонт", inn: "5401234567", industry: "Логистика", city: "Новосибирск", website: "gorizont-nsk.ru", contactsCount: 3, dealsCount: 3, lastActivity: "4 дня назад", status: "active", notes: "" },
  { id: "8", name: "ИТ Решения ООО", inn: "7734567890", industry: "ИТ", city: "Москва", website: "itrешения.рф", contactsCount: 2, dealsCount: 6, lastActivity: "Сегодня", status: "active", notes: "Партнёр по интеграциям" },
]

const CONTACTS_BY_CLIENT: Record<string, { name: string; position: string; phone: string; email: string }[]> = {
  "1": [
    { name: "Иван Смирнов", position: "Директор", phone: "+7 999 111-22-33", email: "i.smirnov@technostar.ru" },
    { name: "Анна Волкова", position: "Бухгалтер", phone: "+7 999 111-22-44", email: "a.volkova@technostar.ru" },
  ],
  "2": [
    { name: "Павел Орлов", position: "Коммерческий директор", phone: "+7 812 555-66-77", email: "p.orlov@vector-group.ru" },
  ],
}

function ClientCard({ client, onOpen }: { client: Client; onOpen: (c: Client) => void }) {
  const initials = client.name.replace(/[^А-ЯA-Z]/g, "").slice(0, 2) || client.name.slice(0, 2).toUpperCase()
  return (
    <div
      className="border rounded-xl p-4 bg-card hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onOpen(client)}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{client.name}</p>
          <p className="text-xs text-muted-foreground">{client.industry} · {client.city}</p>
        </div>
        <Badge className={cn("text-xs border-0 shrink-0", STATUS_COLORS[client.status])}>
          {STATUS_LABELS[client.status]}
        </Badge>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {client.contactsCount}
        </div>
        <div className="flex items-center gap-1">
          <Briefcase className="w-3 h-3" />
          {client.dealsCount} сделок
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Clock className="w-3 h-3" />
          {client.lastActivity}
        </div>
      </div>
    </div>
  )
}

export default function SalesClientsPage() {
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS)
  const [search, setSearch] = useState("")
  const [filterIndustry, setFilterIndustry] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const [form, setForm] = useState({
    name: "", inn: "", industry: "ИТ", city: "", website: "", notes: "",
  })

  const filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.inn.includes(search)) return false
    if (filterIndustry !== "all" && c.industry !== filterIndustry) return false
    if (filterStatus !== "all" && c.status !== filterStatus) return false
    return true
  })

  const handleCreate = () => {
    if (!form.name) { toast.error("Введите название"); return }
    const newClient: Client = {
      id: String(Date.now()),
      name: form.name,
      inn: form.inn || "—",
      industry: form.industry,
      city: form.city || "—",
      website: form.website || "—",
      contactsCount: 0,
      dealsCount: 0,
      lastActivity: "Только что",
      status: "prospect",
      notes: form.notes,
    }
    setClients(prev => [newClient, ...prev])
    setSheetOpen(false)
    setForm({ name: "", inn: "", industry: "ИТ", city: "", website: "", notes: "" })
    toast.success("Клиент добавлен")
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
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Клиенты</h1>
                  <p className="text-sm text-muted-foreground">{clients.length} компаний в базе</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить клиента
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по названию, ИНН..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterIndustry} onValueChange={setFilterIndustry}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Отрасль" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все отрасли</SelectItem>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активный</SelectItem>
                  <SelectItem value="prospect">Перспективный</SelectItem>
                  <SelectItem value="inactive">Неактивный</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map(client => (
                <ClientCard key={client.id} client={client} onOpen={setSelectedClient} />
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Нет клиентов</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Add Client Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Добавить клиента
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Название компании *</Label>
              <Input placeholder="ООО Ромашка" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>ИНН</Label>
              <Input placeholder="7700000000" value={form.inn} onChange={e => setForm(p => ({ ...p, inn: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Отрасль</Label>
              <Select value={form.industry} onValueChange={v => setForm(p => ({ ...p, industry: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Город</Label>
              <Input placeholder="Москва" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Сайт</Label>
              <Input placeholder="company.ru" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
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

      {/* Client Detail Sheet */}
      <Sheet open={!!selectedClient} onOpenChange={open => { if (!open) setSelectedClient(null) }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedClient && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">
                      {selectedClient.name.replace(/[^А-ЯA-Z]/g, "").slice(0, 2) || selectedClient.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <SheetTitle>{selectedClient.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{selectedClient.industry} · {selectedClient.city}</p>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4" />
                  {selectedClient.website}
                </div>
                <Badge className={cn("text-xs border-0", STATUS_COLORS[selectedClient.status])}>
                  {STATUS_LABELS[selectedClient.status]}
                </Badge>
              </div>

              <Tabs defaultValue="contacts">
                <TabsList className="mb-4">
                  <TabsTrigger value="contacts">Контакты</TabsTrigger>
                  <TabsTrigger value="deals">Сделки</TabsTrigger>
                  <TabsTrigger value="notes">Заметки</TabsTrigger>
                </TabsList>

                <TabsContent value="contacts">
                  {(CONTACTS_BY_CLIENT[selectedClient.id] || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Нет контактов</p>
                  ) : (
                    <div className="space-y-2">
                      {(CONTACTS_BY_CLIENT[selectedClient.id] || []).map((c, i) => (
                        <div key={i} className="border rounded-lg p-3">
                          <p className="text-sm font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground mb-2">{c.position}</p>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="w-3 h-3" />{c.phone}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="w-3 h-3" />{c.email}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="deals">
                  <div className="space-y-2">
                    <div className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Основная сделка</p>
                        <p className="text-xs text-muted-foreground">Переговоры</p>
                      </div>
                      <Badge variant="secondary">В работе</Badge>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="notes">
                  <div className="p-3 rounded-lg bg-muted/40 text-sm text-foreground">
                    {selectedClient.notes || "Заметок нет"}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
