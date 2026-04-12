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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Users, Plus, Pencil, Trash2, User, DoorOpen, Wrench } from "lucide-react"
import { toast } from "sonner"
import { RESOURCE_TYPES, DEFAULT_SCHEDULE, DEFAULT_BREAKS, DAY_LABELS } from "@/lib/booking/constants"

interface Resource {
  id: string
  name: string
  type: string
  description: string | null
  isActive: boolean
  schedule: Record<string, { start: string; end: string; active: boolean }>
  breaks: { start: string; end: string }[]
}

const MOCK_RESOURCES: Resource[] = [
  { id: "r1", name: "Кабинет 1", type: "room", description: "Основной кабинет приёма", isActive: true, schedule: DEFAULT_SCHEDULE, breaks: [] },
  { id: "r2", name: "Доктор Иванова", type: "specialist", description: "Терапевт, 10 лет стажа", isActive: true, schedule: DEFAULT_SCHEDULE, breaks: DEFAULT_BREAKS },
]

const TYPE_ICONS: Record<string, typeof User> = {
  specialist: User,
  room: DoorOpen,
  equipment: Wrench,
}

export default function BookingResourcesPage() {
  const [resources, setResources] = useState<Resource[]>(MOCK_RESOURCES)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", type: "specialist", description: "" })

  const openCreate = () => {
    setEditId(null)
    setForm({ name: "", type: "specialist", description: "" })
    setModalOpen(true)
  }

  const openEdit = (r: Resource) => {
    setEditId(r.id)
    setForm({ name: r.name, type: r.type, description: r.description || "" })
    setModalOpen(true)
  }

  const handleSubmit = () => {
    if (!form.name.trim()) return
    if (editId) {
      setResources((prev) =>
        prev.map((r) => (r.id === editId ? { ...r, name: form.name, type: form.type, description: form.description || null } : r)),
      )
      toast.success("Ресурс обновлён")
    } else {
      const newRes: Resource = {
        id: String(Date.now()),
        name: form.name,
        type: form.type,
        description: form.description || null,
        isActive: true,
        schedule: DEFAULT_SCHEDULE,
        breaks: form.type === "specialist" ? DEFAULT_BREAKS : [],
      }
      setResources((prev) => [...prev, newRes])
      toast.success("Ресурс добавлен")
    }
    setModalOpen(false)
  }

  const handleDelete = (id: string) => {
    setResources((prev) => prev.filter((r) => r.id !== id))
    toast.success("Ресурс удалён")
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
                <h1 className="text-2xl font-bold tracking-tight">Ресурсы</h1>
                <p className="text-sm text-muted-foreground mt-1">Специалисты, кабинеты и оборудование</p>
              </div>
              <Button className="rounded-xl shadow-sm hover:shadow-md gap-1.5" onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Добавить ресурс
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resources.map((r) => {
                const TypeIcon = TYPE_ICONS[r.type] || User
                const typeLabel = RESOURCE_TYPES.find((t) => t.id === r.type)?.label || r.type
                const activeDays = Object.entries(r.schedule)
                  .filter(([, v]) => v.active)
                  .map(([k, v]) => `${DAY_LABELS[k]} ${v.start}-${v.end}`)

                return (
                  <div key={r.id} className="rounded-xl shadow-sm border border-border/60 bg-card p-6 hover:shadow-md transition-all duration-200">
                    <div className="flex items-start gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <TypeIcon className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-base">{r.name}</h3>
                          <Badge variant="secondary" className="text-xs">{typeLabel}</Badge>
                        </div>
                        {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {activeDays.map((d) => (
                            <span key={d} className="text-[11px] bg-muted rounded-md px-2 py-0.5">{d}</span>
                          ))}
                        </div>
                        {r.breaks.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Перерыв: {r.breaks.map((b) => `${b.start}–${b.end}`).join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/50">
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                        Редактировать
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {editId ? "Редактировать ресурс" : "Новый ресурс"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Доктор Иванова" />
            </div>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Терапевт, 10 лет стажа" />
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
