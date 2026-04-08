"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Briefcase, Plus, Clock, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Priority = "high" | "medium" | "low"
type Stage = "new" | "talks" | "proposal" | "approval" | "closed"

interface Deal {
  id: string
  company: string
  contact: string
  amount: number
  manager: string
  managerInitials: string
  daysInStage: number
  priority: Priority
  stage: Stage
}

const STAGES: { key: Stage; label: string; color: string; headerColor: string }[] = [
  { key: "new", label: "Новая", color: "border-t-slate-400", headerColor: "bg-slate-100 dark:bg-slate-800/50" },
  { key: "talks", label: "Переговоры", color: "border-t-blue-500", headerColor: "bg-blue-50 dark:bg-blue-900/20" },
  { key: "proposal", label: "КП отправлено", color: "border-t-amber-500", headerColor: "bg-amber-50 dark:bg-amber-900/20" },
  { key: "approval", label: "Согласование", color: "border-t-purple-500", headerColor: "bg-purple-50 dark:bg-purple-900/20" },
  { key: "closed", label: "Закрыта", color: "border-t-emerald-500", headerColor: "bg-emerald-50 dark:bg-emerald-900/20" },
]

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-slate-400",
}

const INITIAL_DEALS: Deal[] = [
  { id: "1", company: "ООО Техностар", contact: "Иван Смирнов", amount: 850_000, manager: "Алексей Иванов", managerInitials: "АИ", daysInStage: 2, priority: "high", stage: "new" },
  { id: "2", company: "ЗАО Прогресс", contact: "Анна Кузнецова", amount: 420_000, manager: "Мария Петрова", managerInitials: "МП", daysInStage: 5, priority: "medium", stage: "new" },
  { id: "3", company: "ИП Соколов А.В.", contact: "Алексей Соколов", amount: 180_000, manager: "Сергей Новиков", managerInitials: "СН", daysInStage: 1, priority: "low", stage: "new" },
  { id: "4", company: "ГК Вектор", contact: "Павел Орлов", amount: 1_200_000, manager: "Алексей Иванов", managerInitials: "АИ", daysInStage: 8, priority: "high", stage: "talks" },
  { id: "5", company: "ООО Горизонт", contact: "Светлана Морозова", amount: 650_000, manager: "Дмитрий Козлов", managerInitials: "ДК", daysInStage: 3, priority: "medium", stage: "talks" },
  { id: "6", company: "АО Альфа Ресурс", contact: "Михаил Волков", amount: 980_000, manager: "Мария Петрова", managerInitials: "МП", daysInStage: 12, priority: "high", stage: "proposal" },
  { id: "7", company: "ООО СтройГрупп", contact: "Елена Тихонова", amount: 340_000, manager: "Сергей Новиков", managerInitials: "СН", daysInStage: 6, priority: "low", stage: "proposal" },
  { id: "8", company: "ЗАО Капитал", contact: "Роман Федоров", amount: 2_100_000, manager: "Алексей Иванов", managerInitials: "АИ", daysInStage: 4, priority: "high", stage: "approval" },
  { id: "9", company: "ООО Медиасфера", contact: "Ольга Данилова", amount: 560_000, manager: "Дмитрий Козлов", managerInitials: "ДК", daysInStage: 9, priority: "medium", stage: "approval" },
  { id: "10", company: "ИТ Решения ООО", contact: "Кирилл Зайцев", amount: 890_000, manager: "Мария Петрова", managerInitials: "МП", daysInStage: 0, priority: "high", stage: "closed" },
]

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}М ₽`
  if (n >= 1_000) return `${Math.round(n / 1_000)}К ₽`
  return `${n} ₽`
}

function DealCard({ deal }: { deal: Deal }) {
  return (
    <div className="bg-card border rounded-lg p-3 cursor-pointer space-y-2.5">
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <Circle className={cn("w-2 h-2 fill-current shrink-0", PRIORITY_COLORS[deal.priority])} />
          <span className="text-sm font-medium text-foreground leading-tight">{deal.company}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{deal.contact}</p>
      <p className="text-base font-bold text-foreground">{formatMoney(deal.amount)}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Avatar className="w-5 h-5">
            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{deal.managerInitials}</AvatarFallback>
          </Avatar>
          <span className="text-[10px] text-muted-foreground">{deal.manager.split(" ")[0]}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {deal.daysInStage}д
        </div>
      </div>
    </div>
  )
}

export default function SalesDealsPage() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filterManager, setFilterManager] = useState("all")

  const [form, setForm] = useState({
    company: "", contact: "", amount: "", manager: "Алексей Иванов",
    source: "сайт", closeDate: "",
  })

  const managers = ["Алексей Иванов", "Мария Петрова", "Дмитрий Козлов", "Сергей Новиков"]

  const filtered = filterManager === "all" ? deals : deals.filter(d => d.manager === filterManager)

  const stageDeals = (stage: Stage) => filtered.filter(d => d.stage === stage)
  const stageTotal = (stage: Stage) => stageDeals(stage).reduce((s, d) => s + d.amount, 0)

  const handleCreate = () => {
    if (!form.company || !form.amount) {
      toast.error("Заполните компанию и сумму")
      return
    }
    const initials = form.manager.split(" ").map(w => w[0]).join("").slice(0, 2)
    const newDeal: Deal = {
      id: String(Date.now()),
      company: form.company,
      contact: form.contact || "—",
      amount: Number(form.amount.replace(/\s/g, "")),
      manager: form.manager,
      managerInitials: initials,
      daysInStage: 0,
      priority: "medium",
      stage: "new",
    }
    setDeals(prev => [newDeal, ...prev])
    setSheetOpen(false)
    setForm({ company: "", contact: "", amount: "", manager: "Алексей Иванов", source: "сайт", closeDate: "" })
    toast.success("Сделка создана")
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
                  <Briefcase className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Сделки</h1>
                  <p className="text-sm text-muted-foreground">Канбан-доска CRM</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                <Plus className="w-4 h-4" />
                Новая сделка
              </Button>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 mb-4">
              <Select value={filterManager} onValueChange={setFilterManager}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Все менеджеры" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все менеджеры</SelectItem>
                  {managers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Kanban */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
              {STAGES.map((stage) => {
                const stageDealsList = stageDeals(stage.key)
                const total = stageTotal(stage.key)
                return (
                  <div key={stage.key} className={cn("rounded-xl border-t-4 bg-background", stage.color)}>
                    <div className={cn("rounded-b-none rounded-t-lg px-3 py-2.5", stage.headerColor)}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{stage.label}</span>
                        <Badge variant="secondary" className="text-xs">{stageDealsList.length}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatMoney(total)}</p>
                    </div>
                    <div className="p-2 space-y-2 min-h-[120px]">
                      {stageDealsList.map(deal => (
                        <DealCard key={deal.id} deal={deal} />
                      ))}
                      {stageDealsList.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">Нет сделок</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* New Deal Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Новая сделка
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Компания / Клиент *</Label>
              <Input placeholder="ООО Ромашка" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Контактное лицо</Label>
              <Input placeholder="Иван Иванов" value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Сумма сделки (₽) *</Label>
              <Input placeholder="500 000" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Ответственный менеджер</Label>
              <Select value={form.manager} onValueChange={v => setForm(p => ({ ...p, manager: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {managers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Источник</Label>
              <Select value={form.source} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["сайт", "звонок", "реклама", "реферал", "партнёр", "другое"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Планируемая дата закрытия</Label>
              <Input type="date" value={form.closeDate} onChange={e => setForm(p => ({ ...p, closeDate: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate}>Создать</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
