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
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Layers, Plus, Tag, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ProductStatus = "active" | "archived"

interface Product {
  id: string
  name: string
  category: string
  description: string
  price: number
  unit: string
  vat: number
  status: ProductStatus
}

const CATEGORIES = ["Лицензии", "Внедрение", "Поддержка", "Обучение", "Интеграция", "Консультация", "Другое"]

const INITIAL_PRODUCTS: Product[] = [
  {
    id: "1", name: "Базовая лицензия платформы", category: "Лицензии",
    description: "Подписка на основной модуль CRM для 1 компании (до 10 пользователей)",
    price: 49_900, unit: "мес", vat: 20, status: "active",
  },
  {
    id: "2", name: "Внедрение и настройка", category: "Внедрение",
    description: "Полный цикл внедрения: анализ бизнес-процессов, настройка, обучение ключевых пользователей",
    price: 150_000, unit: "проект", vat: 20, status: "active",
  },
  {
    id: "3", name: "Техническая поддержка (стандарт)", category: "Поддержка",
    description: "Поддержка 5×8, время ответа 4 ч, до 10 запросов в месяц",
    price: 15_000, unit: "мес", vat: 20, status: "active",
  },
  {
    id: "4", name: "Обучение пользователей (1 группа)", category: "Обучение",
    description: "Онлайн-обучение до 15 человек, 4 ч программы, запись предоставляется",
    price: 35_000, unit: "сессия", vat: 20, status: "active",
  },
  {
    id: "5", name: "Интеграция с 1С", category: "Интеграция",
    description: "Двусторонняя синхронизация данных с 1С:Бухгалтерия или 1С:Предприятие",
    price: 80_000, unit: "проект", vat: 20, status: "active",
  },
  {
    id: "6", name: "Расширенная лицензия (архив)", category: "Лицензии",
    description: "Устаревший тариф — заменён новым. Не предлагать клиентам.",
    price: 39_900, unit: "мес", vat: 20, status: "archived",
  },
]

function formatPrice(price: number, unit: string) {
  const formatted = price >= 1_000_000
    ? `${(price / 1_000_000).toFixed(1)}М`
    : price >= 1_000
    ? `${Math.round(price / 1_000)}К`
    : String(price)
  return `${formatted} ₽ / ${unit}`
}

export default function SalesProductsPage() {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS)
  const [filterCategory, setFilterCategory] = useState("all")
  const [showArchived, setShowArchived] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [form, setForm] = useState({
    name: "", category: "Лицензии", description: "", price: "",
    unit: "мес", vat: "20",
  })

  const filtered = products.filter(p => {
    if (!showArchived && p.status === "archived") return false
    if (filterCategory !== "all" && p.category !== filterCategory) return false
    return true
  })

  const handleCreate = () => {
    if (!form.name || !form.price) { toast.error("Заполните название и цену"); return }
    const newProduct: Product = {
      id: String(Date.now()),
      name: form.name,
      category: form.category,
      description: form.description,
      price: Number(form.price.replace(/\s/g, "")),
      unit: form.unit,
      vat: Number(form.vat),
      status: "active",
    }
    setProducts(prev => [newProduct, ...prev])
    setSheetOpen(false)
    setForm({ name: "", category: "Лицензии", description: "", price: "", unit: "мес", vat: "20" })
    toast.success("Продукт добавлен")
  }

  const toggleStatus = (id: string) => {
    setProducts(prev => prev.map(p => p.id === id
      ? { ...p, status: p.status === "active" ? "archived" : "active" }
      : p
    ))
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
                  <Layers className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Продукты и услуги</h1>
                  <p className="text-sm text-muted-foreground">
                    {products.filter(p => p.status === "active").length} активных
                  </p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить продукт
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Все категории" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} id="show-archived" />
                <Label htmlFor="show-archived" className="text-sm cursor-pointer">Показать архивные</Label>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(product => (
                <div key={product.id} className={cn(
                  "border rounded-xl p-4 bg-card",
                  product.status === "archived" && "opacity-60"
                )}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight">{product.name}</p>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        "text-xs border-0 shrink-0 cursor-pointer",
                        product.status === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      )}
                      onClick={() => toggleStatus(product.id)}
                    >
                      {product.status === "active" ? "Активный" : "Архив"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{product.category}</span>
                  </div>

                  {product.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{product.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-foreground">{formatPrice(product.price, product.unit)}</p>
                    <span className="text-xs text-muted-foreground">НДС {product.vat}%</span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Нет продуктов</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Add Product Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Добавить продукт
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input placeholder="Название продукта или услуги" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Категория</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea placeholder="Что включено..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Цена (₽) *</Label>
                <Input placeholder="49 900" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Единица</Label>
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["мес", "год", "проект", "сессия", "ч", "шт"].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>НДС (%)</Label>
              <Select value={form.vat} onValueChange={v => setForm(p => ({ ...p, vat: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0% (без НДС)</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                </SelectContent>
              </Select>
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
