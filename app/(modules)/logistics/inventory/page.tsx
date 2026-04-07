"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Package, Plus, Search, ClipboardList } from "lucide-react"
import { toast } from "sonner"

type StockStatus = "in_stock" | "low" | "out"

interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  qty: number
  unit: string
  min_qty: number
  price: number
  supplier: string
  status: StockStatus
}

const INITIAL_ITEMS: InventoryItem[] = [
  { id: "1",  sku: "TRK-0041", name: "Крепёж М8×40 (уп. 100 шт.)",  category: "Крепёж",       qty: 12,  unit: "уп.",   min_qty: 50,  price: 450,   supplier: "МеталлСнаб",    status: "low"      },
  { id: "2",  sku: "BLT-1120", name: "Болт А2-70 М10×60",             category: "Крепёж",       qty: 28,  unit: "шт.",   min_qty: 100, price: 12,    supplier: "МеталлСнаб",    status: "low"      },
  { id: "3",  sku: "SHL-0088", name: "Полка стальная 600×400",         category: "Стеллажи",     qty: 0,   unit: "шт.",   min_qty: 10,  price: 3200,  supplier: "СкладМет",      status: "out"      },
  { id: "4",  sku: "PNT-2201", name: "Краска грунтовочная 10 л",       category: "ЛКМ",          qty: 5,   unit: "ведро", min_qty: 20,  price: 1800,  supplier: "ХимТрейд",      status: "low"      },
  { id: "5",  sku: "CBL-0033", name: "Кабель ВВГ 3×2.5 (100 м)",      category: "Электрика",    qty: 7,   unit: "бухта", min_qty: 15,  price: 8900,  supplier: "ЭлектроОпт",   status: "low"      },
  { id: "6",  sku: "PIP-0770", name: "Труба полипропиленовая 32 мм",   category: "Сантехника",   qty: 120, unit: "м",     min_qty: 50,  price: 85,    supplier: "СтройМатериал", status: "in_stock" },
  { id: "7",  sku: "GLV-0100", name: "Перчатки нитриловые (уп. 100)", category: "Расходники",   qty: 45,  unit: "уп.",   min_qty: 20,  price: 650,   supplier: "МедОпт",        status: "in_stock" },
  { id: "8",  sku: "BOX-0211", name: "Коробка картонная 60×40×40",     category: "Упаковка",     qty: 320, unit: "шт.",   min_qty: 100, price: 95,    supplier: "УпакТара",      status: "in_stock" },
  { id: "9",  sku: "FLT-0033", name: "Фильтр воздушный универс.",      category: "Запчасти",     qty: 14,  unit: "шт.",   min_qty: 10,  price: 2100,  supplier: "АвтоДеталь",    status: "in_stock" },
  { id: "10", sku: "LMP-5501", name: "Светодиодная лампа E27 20W",     category: "Электрика",    qty: 0,   unit: "шт.",   min_qty: 30,  price: 280,   supplier: "ЭлектроОпт",   status: "out"      },
  { id: "11", sku: "TRP-0008", name: "Тарпаулин 5×8 м",               category: "Укрывные мат.",qty: 18,  unit: "шт.",   min_qty: 5,   price: 2400,  supplier: "ТекстильОпт",   status: "in_stock" },
  { id: "12", sku: "SAF-0012", name: "Каска строительная белая",       category: "СИЗ",          qty: 52,  unit: "шт.",   min_qty: 20,  price: 850,   supplier: "ОхранТруда",    status: "in_stock" },
]

const CATEGORIES = Array.from(new Set(INITIAL_ITEMS.map(i => i.category)))
const SUPPLIERS  = Array.from(new Set(INITIAL_ITEMS.map(i => i.supplier)))

const STATUS_MAP: Record<StockStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  in_stock: { label: "В наличии",    variant: "default" },
  low:      { label: "Заканчивается",variant: "secondary" },
  out:      { label: "Нет в наличии",variant: "destructive" },
}

function getStatus(qty: number, min: number): StockStatus {
  if (qty === 0) return "out"
  if (qty < min) return "low"
  return "in_stock"
}

export default function LogisticsInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>(INITIAL_ITEMS)
  const [search, setSearch] = useState("")
  const [filterCat, setFilterCat] = useState("all")
  const [filterSupplier, setFilterSupplier] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [addOpen, setAddOpen] = useState(false)
  const [invOpen, setInvOpen] = useState(false)
  const [counts, setCounts] = useState<Record<string, string>>({})

  const [form, setForm] = useState({ sku: "", name: "", category: "", unit: "шт.", min_qty: "10", price: "", supplier: "" })

  const filtered = items.filter(i => {
    if (filterCat !== "all" && i.category !== filterCat) return false
    if (filterSupplier !== "all" && i.supplier !== filterSupplier) return false
    if (filterStatus !== "all" && i.status !== filterStatus) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.sku.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleAdd = () => {
    const newItem: InventoryItem = {
      id: String(Date.now()),
      sku: form.sku || `SKU-${Date.now()}`,
      name: form.name,
      category: form.category || "Прочее",
      qty: 0,
      unit: form.unit,
      min_qty: Number(form.min_qty) || 10,
      price: Number(form.price) || 0,
      supplier: form.supplier,
      status: "out",
    }
    setItems(prev => [newItem, ...prev])
    setAddOpen(false)
    setForm({ sku: "", name: "", category: "", unit: "шт.", min_qty: "10", price: "", supplier: "" })
    toast.success(`Товар "${newItem.name}" добавлен`)
  }

  const handleInventory = () => {
    setItems(prev => prev.map(i => {
      const val = counts[i.id]
      if (val === undefined || val === "") return i
      const newQty = Number(val)
      return { ...i, qty: newQty, status: getStatus(newQty, i.min_qty) }
    }))
    setInvOpen(false)
    setCounts({})
    toast.success("Инвентаризация сохранена")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-7xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Товары на складе</h1>
                  <p className="text-sm text-muted-foreground">{items.length} позиций</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInvOpen(true)}>
                  <ClipboardList className="w-4 h-4" /> Инвентаризация
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="w-4 h-4" /> Добавить товар
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по названию, артикулу..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Категория" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Поставщик" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все поставщики</SelectItem>
                  {SUPPLIERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="in_stock">В наличии</SelectItem>
                  <SelectItem value="low">Заканчивается</SelectItem>
                  <SelectItem value="out">Нет в наличии</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Артикул</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Наименование</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Категория</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Остаток</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ед.</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Мин.</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Цена</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Поставщик</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(item => {
                        const st = STATUS_MAP[item.status]
                        return (
                          <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{item.sku}</td>
                            <td className="px-3 py-3 text-sm font-medium">{item.name}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">{item.category}</td>
                            <td className="text-right px-3 py-3 text-sm font-semibold">{item.qty}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">{item.unit}</td>
                            <td className="text-right px-3 py-3 text-sm text-muted-foreground">{item.min_qty}</td>
                            <td className="text-right px-3 py-3 text-sm">{item.price.toLocaleString("ru-RU")} ₽</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">{item.supplier}</td>
                            <td className="text-center px-3 py-3">
                              <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                      {filtered.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-10 text-sm text-muted-foreground">Нет позиций</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>

      {/* Add item sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Добавить товар
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Артикул</Label>
              <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="TRK-0001" />
            </div>
            <div className="space-y-1.5">
              <Label>Наименование *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Название товара" />
            </div>
            <div className="space-y-1.5">
              <Label>Категория</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Крепёж, Электрика..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Единица измерения</Label>
                <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="шт." />
              </div>
              <div className="space-y-1.5">
                <Label>Мин. остаток</Label>
                <Input type="number" value={form.min_qty} onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Цена (₽)</Label>
              <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Поставщик</Label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Название поставщика" />
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={!form.name}>Добавить товар</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Inventory dialog */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Инвентаризация
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Введите фактическое количество. Пустые поля — не изменять.</p>
          <table className="w-full mt-3">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Артикул</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Название</th>
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 pr-2">Учёт</th>
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-2">Факт</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 text-xs font-mono text-muted-foreground">{item.sku}</td>
                  <td className="py-2 text-sm">{item.name}</td>
                  <td className="py-2 text-right pr-2 text-sm text-muted-foreground">{item.qty} {item.unit}</td>
                  <td className="py-2 pl-2">
                    <Input
                      type="number"
                      className="h-8 w-24 text-right"
                      placeholder={String(item.qty)}
                      value={counts[item.id] ?? ""}
                      onChange={e => setCounts(c => ({ ...c, [item.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="mt-4 w-full" onClick={handleInventory}>Сохранить инвентаризацию</Button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
