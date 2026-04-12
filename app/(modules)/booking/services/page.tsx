"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ListChecks, Plus, Pencil, Trash2, Clock, DollarSign } from "lucide-react"
import { toast } from "sonner"
import { SERVICE_COLORS } from "@/lib/booking/constants"

interface Service {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
  color: string
  isActive: boolean
}

const MOCK_SERVICES: Service[] = [
  { id: "s1", name: "Консультация", description: "Первичная консультация специалиста", duration: 60, price: 300000, color: "#3B82F6", isActive: true },
  { id: "s2", name: "Диагностика", description: "Комплексная диагностика", duration: 30, price: 150000, color: "#8B5CF6", isActive: true },
  { id: "s3", name: "Процедура", description: "Лечебная процедура", duration: 90, price: 500000, color: "#10B981", isActive: true },
]

function formatPrice(p: number | null) {
  if (!p) return "—"
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(p / 100)
}

export default function BookingServicesPage() {
  const [services, setServices] = useState<Service[]>(MOCK_SERVICES)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", description: "", duration: "60", price: "", color: "#3B82F6" })

  const openCreate = () => {
    setEditId(null)
    setForm({ name: "", description: "", duration: "60", price: "", color: "#3B82F6" })
    setModalOpen(true)
  }

  const openEdit = (s: Service) => {
    setEditId(s.id)
    setForm({
      name: s.name,
      description: s.description || "",
      duration: String(s.duration),
      price: s.price ? String(s.price / 100) : "",
      color: s.color,
    })
    setModalOpen(true)
  }

  const handleSubmit = () => {
    if (!form.name.trim()) return
    if (editId) {
      setServices((prev) =>
        prev.map((s) =>
          s.id === editId
            ? { ...s, name: form.name, description: form.description || null, duration: Number(form.duration), price: form.price ? Number(form.price) * 100 : null, color: form.color }
            : s,
        ),
      )
      toast.success("Услуга обновлена")
    } else {
      const newService: Service = {
        id: String(Date.now()),
        name: form.name,
        description: form.description || null,
        duration: Number(form.duration),
        price: form.price ? Number(form.price) * 100 : null,
        color: form.color,
        isActive: true,
      }
      setServices((prev) => [...prev, newService])
      toast.success("Услуга добавлена")
    }
    setModalOpen(false)
  }

  const toggleActive = (id: string) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)))
  }

  const handleDelete = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id))
    toast.success("Услуга удалена")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Услуги</h1>
                <p className="text-sm text-muted-foreground mt-1">Управление услугами для бронирования</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Добавить услугу
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl shadow-sm border border-border/60 bg-card p-6 hover:shadow-md transition-all duration-200 relative overflow-hidden"
                  style={{ borderLeft: `4px solid ${s.color}` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-base">{s.name}</h3>
                      {s.description && <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>}
                    </div>
                    <Switch checked={s.isActive} onCheckedChange={() => toggleActive(s.id)} />
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {s.duration} мин
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      {formatPrice(s.price)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.color }} />
                    <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                      {s.isActive ? "Активна" : "Выключена"}
                    </Badge>
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </SidebarInset>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5" />
              {editId ? "Редактировать услугу" : "Новая услуга"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Консультация" />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Краткое описание" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Длительность (мин)</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Цена (руб)</Label>
                <Input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} placeholder="3000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Цвет</Label>
              <div className="flex gap-2">
                {SERVICE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((p) => ({ ...p, color: c }))}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={!form.name.trim()}>{editId ? "Сохранить" : "Добавить"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
