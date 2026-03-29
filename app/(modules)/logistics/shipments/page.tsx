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
import { Truck, Plus } from "lucide-react"
import { toast } from "sonner"

type ShipmentStatus = "preparing" | "transferred" | "in_transit" | "delivered"

interface Shipment {
  id: string
  number: string
  orderNumber: string
  client: string
  date: string
  carrier: string
  tracking: string
  warehouse: string
  status: ShipmentStatus
}

const INITIAL_SHIPMENTS: Shipment[] = [
  { id: "1", number: "ОТГ-0601", orderNumber: "ЗАК-2299", client: "АО «ТехноМаш»",    date: "28.03.2026", carrier: "СДЭК",          tracking: "CDEK-1234567890", warehouse: "Склад №2", status: "in_transit"  },
  { id: "2", number: "ОТГ-0602", orderNumber: "ЗАК-2294", client: "ООО «КрасПласт»",   date: "28.03.2026", carrier: "Деловые Линии", tracking: "DL-9876543",      warehouse: "Склад №2", status: "in_transit"  },
  { id: "3", number: "ОТГ-0603", orderNumber: "ЗАК-2298", client: "ООО «РемСервис»",   date: "29.03.2026", carrier: "Собственная",    tracking: "—",               warehouse: "Склад №1", status: "delivered"   },
  { id: "4", number: "ОТГ-0604", orderNumber: "ЗАК-2300", client: "ИП Казаков В.В.",   date: "29.03.2026", carrier: "Boxberry",      tracking: "BB-4567890",      warehouse: "Склад №1", status: "preparing"   },
  { id: "5", number: "ОТГ-0605", orderNumber: "ЗАК-2293", client: "ИП Соколов Д.А.",   date: "28.03.2026", carrier: "СДЭК",          tracking: "CDEK-0099887766", warehouse: "Склад №1", status: "delivered"   },
  { id: "6", number: "ОТГ-0606", orderNumber: "ЗАК-2301", client: "ООО «Стройторг»",   date: "29.03.2026", carrier: "ПЭК",           tracking: "PEK-2024-0039",   warehouse: "Склад №1", status: "transferred" },
]

const STATUS_MAP: Record<ShipmentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  preparing:   { label: "Подготовка",          variant: "secondary" },
  transferred: { label: "Передан перевозчику", variant: "default"   },
  in_transit:  { label: "В пути",              variant: "outline"   },
  delivered:   { label: "Доставлен",           variant: "outline"   },
}

const ORDERS_LIST = ["ЗАК-2301", "ЗАК-2300", "ЗАК-2299", "ЗАК-2298", "ЗАК-2297", "ЗАК-2296"]
const WAREHOUSES  = ["Склад №1", "Склад №2", "Склад №3"]
const CARRIERS    = ["СДЭК", "Деловые Линии", "ПЭК", "Boxberry", "Собственная доставка"]

export default function LogisticsShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>(INITIAL_SHIPMENTS)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ order: ORDERS_LIST[0], client: "", warehouse: "Склад №1", carrier: CARRIERS[0], tracking: "", date: "" })

  const handleAdd = () => {
    const newShipment: Shipment = {
      id: String(Date.now()),
      number: `ОТГ-${607 + shipments.length}`,
      orderNumber: form.order,
      client: form.client || "Клиент",
      date: form.date || "29.03.2026",
      carrier: form.carrier,
      tracking: form.tracking || "—",
      warehouse: form.warehouse,
      status: "preparing",
    }
    setShipments(prev => [newShipment, ...prev])
    setAddOpen(false)
    setForm({ order: ORDERS_LIST[0], client: "", warehouse: "Склад №1", carrier: CARRIERS[0], tracking: "", date: "" })
    toast.success(`Отгрузка ${newShipment.number} оформлена`)
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
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Отгрузки</h1>
                  <p className="text-sm text-muted-foreground">{shipments.length} отгрузок</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4" /> Оформить отгрузку
              </Button>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Номер</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Заказ</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Клиент</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Дата</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Перевозчик</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Трек-номер</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Склад</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.map(s => {
                        const st = STATUS_MAP[s.status]
                        return (
                          <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-xs font-mono font-semibold">{s.number}</td>
                            <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{s.orderNumber}</td>
                            <td className="px-3 py-3 text-sm max-w-[160px] truncate">{s.client}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">{s.date}</td>
                            <td className="px-3 py-3 text-sm">{s.carrier}</td>
                            <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{s.tracking}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">{s.warehouse}</td>
                            <td className="text-center px-3 py-3">
                              <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>

      {/* Add shipment sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Оформить отгрузку
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Заказ</Label>
              <Select value={form.order} onValueChange={v => setForm(f => ({ ...f, order: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDERS_LIST.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Клиент</Label>
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
              <Label>Перевозчик</Label>
              <Select value={form.carrier} onValueChange={v => setForm(f => ({ ...f, carrier: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Трек-номер</Label>
              <Input value={form.tracking} onChange={e => setForm(f => ({ ...f, tracking: e.target.value }))} placeholder="CDEK-0000000000" />
            </div>
            <div className="space-y-1.5">
              <Label>Дата отгрузки</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleAdd}>Оформить отгрузку</Button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
