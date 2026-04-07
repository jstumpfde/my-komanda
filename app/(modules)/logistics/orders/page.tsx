"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { ShoppingCart, Plus, ChevronDown, ChevronUp, Check, Clock } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type OrderStatus = "new" | "processing" | "shipped" | "done" | "cancelled"

interface OrderItem {
  product: string
  qty: number
  price: number
}

interface Order {
  id: string
  number: string
  client: string
  date: string
  items: OrderItem[]
  warehouse: string
  deliveryDate: string
  status: OrderStatus
}

const INITIAL_ORDERS: Order[] = [
  { id: "1",  number: "ЗАК-2301", client: "ООО «Стройторг»",      date: "29.03.2026", warehouse: "Склад №1",   deliveryDate: "02.04.2026", status: "new",        items: [{ product: "Крепёж М8×40", qty: 5, price: 450 }, { product: "Болт А2-70", qty: 200, price: 12 }, { product: "Каска строительная", qty: 20, price: 850 }, { product: "Перчатки нитр.", qty: 10, price: 650 }] },
  { id: "2",  number: "ЗАК-2300", client: "ИП Казаков В.В.",       date: "29.03.2026", warehouse: "Склад №1",   deliveryDate: "01.04.2026", status: "processing", items: [{ product: "Кабель ВВГ 3×2.5", qty: 3, price: 8900 }] },
  { id: "3",  number: "ЗАК-2299", client: "АО «ТехноМаш»",         date: "28.03.2026", warehouse: "Склад №2",   deliveryDate: "01.04.2026", status: "shipped",    items: [{ product: "Труба PP 32 мм", qty: 50, price: 85 }, { product: "Полка 600×400", qty: 5, price: 3200 }, { product: "Краска грунт.", qty: 10, price: 1800 }, { product: "Лампа E27 20W", qty: 100, price: 280 }, { product: "Тарпаулин 5×8", qty: 3, price: 2400 }, { product: "Коробка 60×40", qty: 50, price: 95 }, { product: "Фильтр воздушный", qty: 4, price: 2100 }] },
  { id: "4",  number: "ЗАК-2298", client: "ООО «РемСервис»",        date: "28.03.2026", warehouse: "Склад №1",   deliveryDate: "31.03.2026", status: "done",       items: [{ product: "Болт А2-70", qty: 500, price: 12 }, { product: "Крепёж М8×40", qty: 3, price: 450 }] },
  { id: "5",  number: "ЗАК-2297", client: "ИП Иванова М.А.",        date: "27.03.2026", warehouse: "Склад №1",   deliveryDate: "30.03.2026", status: "done",       items: [{ product: "Перчатки нитр.", qty: 5, price: 650 }, { product: "Каска белая", qty: 10, price: 850 }, { product: "Тарпаулин 5×8", qty: 2, price: 2400 }] },
  { id: "6",  number: "ЗАК-2296", client: "ООО «АгроТех»",          date: "27.03.2026", warehouse: "Склад №3",   deliveryDate: "01.04.2026", status: "processing", items: [{ product: "Труба PP 32 мм", qty: 30, price: 85 }, { product: "Кабель ВВГ", qty: 2, price: 8900 }] },
  { id: "7",  number: "ЗАК-2295", client: "ПАО «МегаСтрой»",        date: "26.03.2026", warehouse: "Склад №1",   deliveryDate: "29.03.2026", status: "cancelled",  items: [{ product: "Полка 600×400", qty: 20, price: 3200 }] },
  { id: "8",  number: "ЗАК-2294", client: "ООО «КрасПласт»",        date: "26.03.2026", warehouse: "Склад №2",   deliveryDate: "30.03.2026", status: "shipped",    items: [{ product: "Коробка 60×40", qty: 200, price: 95 }, { product: "Тарпаулин 5×8", qty: 5, price: 2400 }] },
  { id: "9",  number: "ЗАК-2293", client: "ИП Соколов Д.А.",        date: "25.03.2026", warehouse: "Склад №1",   deliveryDate: "28.03.2026", status: "done",       items: [{ product: "Каска строительная", qty: 30, price: 850 }] },
  { id: "10", number: "ЗАК-2292", client: "ООО «ТекстильОпт»",      date: "25.03.2026", warehouse: "Склад №3",   deliveryDate: "28.03.2026", status: "done",       items: [{ product: "Тарпаулин 5×8", qty: 8, price: 2400 }, { product: "Перчатки нитр.", qty: 20, price: 650 }] },
]

const STATUS_MAP: Record<OrderStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new:        { label: "Новый",        variant: "default"     },
  processing: { label: "В обработке",  variant: "secondary"   },
  shipped:    { label: "Отгружен",     variant: "outline"     },
  done:       { label: "Выполнен",     variant: "outline"     },
  cancelled:  { label: "Отменён",      variant: "destructive" },
}

const STATUS_TIMELINE: Record<OrderStatus, { label: string; done: boolean }[]> = {
  new:        [{ label: "Создан", done: true }, { label: "В обработке", done: false }, { label: "Отгружен", done: false }, { label: "Выполнен", done: false }],
  processing: [{ label: "Создан", done: true }, { label: "В обработке", done: true }, { label: "Отгружен", done: false }, { label: "Выполнен", done: false }],
  shipped:    [{ label: "Создан", done: true }, { label: "В обработке", done: true }, { label: "Отгружен", done: true }, { label: "Выполнен", done: false }],
  done:       [{ label: "Создан", done: true }, { label: "В обработке", done: true }, { label: "Отгружен", done: true }, { label: "Выполнен", done: true }],
  cancelled:  [{ label: "Создан", done: true }, { label: "Отменён", done: true }],
}

const TABS: { value: string; label: string }[] = [
  { value: "all",        label: "Все"         },
  { value: "new",        label: "Новые"       },
  { value: "processing", label: "В обработке" },
  { value: "shipped",    label: "Отгружены"   },
  { value: "done",       label: "Выполнены"   },
  { value: "cancelled",  label: "Отменены"    },
]

const PRODUCTS = ["Крепёж М8×40", "Болт А2-70", "Полка 600×400", "Краска грунт.", "Кабель ВВГ 3×2.5", "Труба PP 32 мм", "Перчатки нитр.", "Коробка 60×40", "Фильтр воздушный", "Лампа E27 20W", "Тарпаулин 5×8", "Каска строительная"]
const WAREHOUSES = ["Склад №1", "Склад №2", "Склад №3"]

function orderTotal(order: Order) {
  return order.items.reduce((s, i) => s + i.qty * i.price, 0)
}

export default function LogisticsOrdersPage() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ client: "", warehouse: "Склад №1", deliveryDate: "" })
  const [formItems, setFormItems] = useState([{ product: PRODUCTS[0], qty: "1", price: "0" }])

  const handleAdd = () => {
    const newOrder: Order = {
      id: String(Date.now()),
      number: `ЗАК-${2302 + orders.length}`,
      client: form.client,
      date: "29.03.2026",
      warehouse: form.warehouse,
      deliveryDate: form.deliveryDate,
      status: "new",
      items: formItems.map(fi => ({ product: fi.product, qty: Number(fi.qty), price: Number(fi.price) })),
    }
    setOrders(prev => [newOrder, ...prev])
    setAddOpen(false)
    setForm({ client: "", warehouse: "Склад №1", deliveryDate: "" })
    setFormItems([{ product: PRODUCTS[0], qty: "1", price: "0" }])
    toast.success(`Заказ ${newOrder.number} создан`)
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
                  <ShoppingCart className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Заказы</h1>
                  <p className="text-sm text-muted-foreground">{orders.length} заказов</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4" /> Новый заказ
              </Button>
            </div>

            <Tabs defaultValue="all">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                {TABS.map(t => (
                  <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                ))}
              </TabsList>

              {TABS.map(t => {
                const list = t.value === "all" ? orders : orders.filter(o => o.status === t.value)
                return (
                  <TabsContent key={t.value} value={t.value}>
                    <Card>
                      <CardContent className="p-0">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Номер</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Клиент</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата</th>
                              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Позиций</th>
                              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сумма</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Склад</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                              <th className="w-8 px-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {list.map(order => {
                              const st = STATUS_MAP[order.status]
                              const isOpen = expanded === order.id
                              const total = orderTotal(order)
                              return (
                                <>
                                  <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setExpanded(isOpen ? null : order.id)}>
                                    <td className="px-4 py-3 text-xs font-mono font-semibold">{order.number}</td>
                                    <td className="px-3 py-3 text-sm max-w-[160px] truncate">{order.client}</td>
                                    <td className="px-3 py-3 text-sm text-muted-foreground">{order.date}</td>
                                    <td className="text-right px-3 py-3 text-sm">{order.items.length}</td>
                                    <td className="text-right px-3 py-3 text-sm font-semibold">{total.toLocaleString("ru-RU")} ₽</td>
                                    <td className="px-3 py-3 text-sm text-muted-foreground">{order.warehouse}</td>
                                    <td className="text-center px-3 py-3">
                                      <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                                    </td>
                                    <td className="px-2 text-muted-foreground">
                                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </td>
                                  </tr>
                                  {isOpen && (
                                    <tr key={`${order.id}-detail`} className="bg-muted/10 border-b">
                                      <td colSpan={8} className="px-6 py-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {/* Items */}
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-2">Позиции заказа</p>
                                            <table className="w-full text-sm">
                                              <thead>
                                                <tr className="border-b">
                                                  <th className="text-left py-1.5 text-xs text-muted-foreground font-medium">Товар</th>
                                                  <th className="text-right py-1.5 text-xs text-muted-foreground font-medium">Кол-во</th>
                                                  <th className="text-right py-1.5 text-xs text-muted-foreground font-medium">Цена</th>
                                                  <th className="text-right py-1.5 text-xs text-muted-foreground font-medium">Сумма</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {order.items.map((item, i) => (
                                                  <tr key={i} className="border-b last:border-0">
                                                    <td className="py-1.5">{item.product}</td>
                                                    <td className="text-right py-1.5 text-muted-foreground">{item.qty}</td>
                                                    <td className="text-right py-1.5 text-muted-foreground">{item.price} ₽</td>
                                                    <td className="text-right py-1.5 font-medium">{(item.qty * item.price).toLocaleString("ru-RU")} ₽</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                            <div className="flex justify-end mt-2 text-sm font-semibold">
                                              Итого: {total.toLocaleString("ru-RU")} ₽
                                            </div>
                                          </div>
                                          {/* Timeline */}
                                          <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-3">История статусов</p>
                                            <div className="space-y-2">
                                              {STATUS_TIMELINE[order.status].map((step, i) => (
                                                <div key={i} className="flex items-center gap-2.5">
                                                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", step.done ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground")}>
                                                    {step.done ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                                  </div>
                                                  <span className={cn("text-sm", step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
                                                </div>
                                              ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-3">Доставка: {order.deliveryDate}</p>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              )
                            })}
                            {list.length === 0 && (
                              <tr><td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">Нет заказов</td></tr>
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

      {/* Add order sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Новый заказ
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Клиент *</Label>
              <Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="ООО «Название»" />
            </div>
            <div className="space-y-1.5">
              <Label>Склад</Label>
              <Select value={form.warehouse} onValueChange={v => setForm(f => ({ ...f, warehouse: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Дата доставки</Label>
              <Input type="date" value={form.deliveryDate} onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))} />
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

            <Button className="w-full" onClick={handleAdd} disabled={!form.client}>Создать заказ</Button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
