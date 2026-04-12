"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Warehouse, Plus, MapPin, User, Maximize2 } from "lucide-react"
import { toast } from "sonner"

interface WarehouseItem {
  id: string
  name: string
  address: string
  area: number
  positions: number
  usedPositions: number
  manager: string
}

const INITIAL_WAREHOUSES: WarehouseItem[] = [
  {
    id: "1",
    name: "Склад №1 — Основной",
    address: "г. Москва, ул. Промышленная, 12, стр. 3",
    area: 2400,
    positions: 320,
    usedPositions: 248,
    manager: "Смирнов Алексей",
  },
  {
    id: "2",
    name: "Склад №2 — Северный",
    address: "г. Москва, Северный проезд, 5",
    area: 860,
    positions: 120,
    usedPositions: 41,
    manager: "Петрова Ольга",
  },
  {
    id: "3",
    name: "Склад №3 — Временный",
    address: "Московская обл., г. Химки, ул. Складская, 8",
    area: 400,
    positions: 50,
    usedPositions: 47,
    manager: "Захаров Денис",
  },
]

function occupancyColor(pct: number) {
  if (pct >= 90) return "bg-red-500"
  if (pct >= 70) return "bg-amber-500"
  return "bg-emerald-500"
}

export default function LogisticsWarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>(INITIAL_WAREHOUSES)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", address: "", area: "", manager: "" })

  const handleAdd = () => {
    const wh: WarehouseItem = {
      id: String(Date.now()),
      name: form.name,
      address: form.address,
      area: Number(form.area) || 0,
      positions: Math.floor((Number(form.area) || 100) / 7.5),
      usedPositions: 0,
      manager: form.manager,
    }
    setWarehouses(prev => [...prev, wh])
    setOpen(false)
    setForm({ name: "", address: "", area: "", manager: "" })
    toast.success(`Склад "${wh.name}" добавлен`)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-5" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Warehouse className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Склады</h1>
                  <p className="text-sm text-muted-foreground">{warehouses.length} складских объекта</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" /> Добавить склад
              </Button>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {warehouses.map(wh => {
                const pct = Math.round((wh.usedPositions / wh.positions) * 100)
                return (
                  <Card key={wh.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Warehouse className="w-4.5 h-4.5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-tight">{wh.name}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct >= 90 ? "bg-red-100 text-red-700" : pct >= 70 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {pct}%
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{wh.address}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Maximize2 className="w-4 h-4 shrink-0" />
                        <span>{wh.area.toLocaleString("ru-RU")} м²</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="w-4 h-4 shrink-0" />
                        <span>{wh.manager}</span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Заполненность</span>
                          <span>{wh.usedPositions} / {wh.positions} позиций</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${occupancyColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Add warehouse dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Добавить склад
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Склад №4 — Южный" />
            </div>
            <div className="space-y-1.5">
              <Label>Адрес</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="г. Москва, ул. ..." />
            </div>
            <div className="space-y-1.5">
              <Label>Площадь (м²)</Label>
              <Input type="number" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="500" />
            </div>
            <div className="space-y-1.5">
              <Label>Ответственный</Label>
              <Input value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} placeholder="Фамилия Имя" />
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={!form.name}>Добавить склад</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
