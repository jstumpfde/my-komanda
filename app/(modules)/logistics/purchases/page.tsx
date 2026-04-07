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
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClipboardList, Plus } from "lucide-react"
import { toast } from "sonner"

type PurchaseStatus = "draft" | "approval" | "sent" | "received"

interface PurchaseItem {
  product: string
  qty: number
  price: number
}

interface Purchase {
  id: string
  number: string
  supplier: string
  date: string
  expectedDate: string
  items: PurchaseItem[]
  status: PurchaseStatus
}

const INITIAL_PURCHASES: Purchase[] = [
  { id: "1", number: "ЗКП-0501", supplier: "МеталлСнаб",    date: "25.03.2026", expectedDate: "03.04.2026", status: "sent",     items: [{ product: "Крепёж М8×40", qty: 100, price: 420 }, { product: "Болт А2-70", qty: 1000, price: 10 }] },
  { id: "2", number: "ЗКП-0502", supplier: "ХимТрейд",       date: "27.03.2026", expectedDate: "05.04.2026", status: "approval", items: [{ product: "Краска грунтовочная 10 л", qty: 50, price: 1600 }] },
  { id: "3", number: "ЗКП-0503", supplier: "ЭлектроОпт",     date: "28.03.2026", expectedDate: "07.04.2026", status: "draft",    items: [{ product: "Кабель ВВГ 3×2.5 100м", qty: 20, price: 8200 }, { product: "Лампа E27 20W", qty: 200, price: 240 }] },
  { id: "4", number: "ЗКП-0500", supplier: "УпакТара",        date: "20.03.2026", expectedDate: "28.03.2026", status: "received", items: [{ product: "Коробка картонная 60×40", qty: 500, price: 80 }] },
  { id: "5", number: "ЗКП-0499", supplier: "СтройМатериал",  date: "18.03.2026", expectedDate: "26.03.2026", status: "received", items: [{ product: "Труба PP 32 мм", qty: 300, price: 75 }, { product: "Тарпаулин 5×8", qty: 20, price: 2100 }] },
]

const STATUS_MAP: Record<PurchaseStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:    { label: "Черновик",    variant: "secondary"   },
  approval: { label: "Согласование",variant: "default"     },
  sent:     { label: "Отправлен",   variant: "outline"     },
  received: { label: "Получен",     variant: "outline"     },
}

const TABS = [
  { value: "all",      label: "Все"          },
  { value: "draft",    label: "Черновик"     },
  { value: "approval", label: "Согласование" },
  { value: "sent",     label: "Отправлен"    },
  { value: "received", label: "Получен"      },
]

const SUPPLIERS_LIST = ["МеталлСнаб", "ХимТрейд", "ЭлектроОпт", "СтройМатериал", "СкладМет", "УпакТара"]
const PRODUCTS = ["Крепёж М8×40", "Болт А2-70", "Полка 600×400", "Краска грунт.", "Кабель ВВГ 3×2.5", "Труба PP 32 мм", "Перчатки нитр.", "Коробка 60×40", "Лампа E27 20W", "Тарпаулин 5×8"]

function purchaseTotal(p: Purchase) {
  return p.items.reduce((s, i) => s + i.qty * i.price, 0)
}

export default function LogisticsPurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>(INITIAL_PURCHASES)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ supplier: SUPPLIERS_LIST[0], expectedDate: "" })
  const [formItems, setFormItems] = useState([{ product: PRODUCTS[0], qty: "1", price: "0" }])

  const handleAdd = () => {
    const newPurchase: Purchase = {
      id: String(Date.now()),
      number: `ЗКП-${504 + purchases.length}`,
      supplier: form.supplier,
      date: "29.03.2026",
      expectedDate: form.expectedDate,
      status: "draft",
      items: formItems.map(fi => ({ product: fi.product, qty: Number(fi.qty), price: Number(fi.price) })),
    }
    setPurchases(prev => [newPurchase, ...prev])
    setAddOpen(false)
    setForm({ supplier: SUPPLIERS_LIST[0], expectedDate: "" })
    setFormItems([{ product: PRODUCTS[0], qty: "1", price: "0" }])
    toast.success(`Закупка ${newPurchase.number} создана`)
  }

  const addFormItem = () => setFormItems(prev => [...prev, { product: PRODUCTS[0], qty: "1", price: "0" }])
  const removeFormItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx))

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
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Закупки</h1>
                  <p className="text-sm text-muted-foreground">{purchases.length} заказов поставщикам</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4" /> Создать закупку
              </Button>
            </div>

            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                {TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
              </TabsList>

              {TABS.map(t => {
                const list = t.value === "all" ? purchases : purchases.filter(p => p.status === t.value)
                return (
                  <TabsContent key={t.value} value={t.value}>
                    <Card>
                      <CardContent className="p-0">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Номер</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Поставщик</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ожидается</th>
                              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Позиций</th>
                              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сумма</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map(p => {
                              const st = STATUS_MAP[p.status]
                              const total = purchaseTotal(p)
                              return (
                                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3 text-xs font-mono font-semibold">{p.number}</td>
                                  <td className="px-3 py-3 text-sm font-medium">{p.supplier}</td>
                                  <td className="px-3 py-3 text-sm text-muted-foreground">{p.date}</td>
                                  <td className="px-3 py-3 text-sm text-muted-foreground">{p.expectedDate}</td>
                                  <td className="text-right px-3 py-3 text-sm">{p.items.length}</td>
                                  <td className="text-right px-3 py-3 text-sm font-semibold">{total.toLocaleString("ru-RU")} ₽</td>
                                  <td className="text-center px-3 py-3">
                                    <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                                  </td>
                                </tr>
                              )
                            })}
                            {list.length === 0 && (
                              <tr><td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">Нет закупок</td></tr>
                            )}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )
              })}
            </Tabs>
          </div>
        </main>
      </SidebarInset>

      {/* Add purchase sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Создать закупку
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Поставщик</Label>
              <Select value={form.supplier} onValueChange={v => setForm(f => ({ ...f, supplier: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPLIERS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ожидаемая дата поставки</Label>
              <Input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
            </div>

            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Позиции заказа</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addFormItem}>
                  <Plus className="w-3 h-3" /> Добавить
                </Button>
              </div>
              <div className="space-y-2">
                {formItems.map((fi, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_60px_80px_auto] gap-2 items-end">
                    <div>
                      <Select value={fi.product} onValueChange={v => setFormItems(prev => prev.map((x, i) => i === idx ? { ...x, product: v } : x))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRODUCTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="h-8 text-sm" type="number" min="1" value={fi.qty} onChange={e => setFormItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))} placeholder="Кол" />
                    <Input className="h-8 text-sm" type="number" min="0" value={fi.price} onChange={e => setFormItems(prev => prev.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} placeholder="Цена" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeFormItem(idx)}>×</Button>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={handleAdd}>Создать закупку</Button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
