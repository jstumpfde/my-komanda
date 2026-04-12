"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarCheck } from "lucide-react"

interface Service {
  id: string
  name: string
  duration: number
  price: number | null
  color: string
}

interface Resource {
  id: string
  name: string
  type: string
}

interface BookingCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    serviceId: string
    resourceId: string
    date: string
    startTime: string
    endTime: string
    clientName: string
    clientPhone: string
    clientEmail: string
    notes: string
    price: number | null
  }) => void
  services: Service[]
  resources: Resource[]
  preselectedDate?: string
  preselectedTime?: string
  availableSlots?: string[]
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

export function BookingCreateModal({
  open, onOpenChange, onSubmit,
  services, resources,
  preselectedDate, preselectedTime,
  availableSlots,
}: BookingCreateModalProps) {
  const [serviceId, setServiceId] = useState(services[0]?.id || "")
  const [resourceId, setResourceId] = useState(resources[0]?.id || "")
  const [date, setDate] = useState(preselectedDate || new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState(preselectedTime || "")
  const [clientName, setClientName] = useState("")
  const [clientPhone, setClientPhone] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [notes, setNotes] = useState("")

  const selectedService = services.find((s) => s.id === serviceId)

  const handleSubmit = () => {
    if (!serviceId || !time || !clientName.trim()) return
    const endTime = addMinutes(time, selectedService?.duration || 60)
    onSubmit({
      serviceId,
      resourceId,
      date,
      startTime: time,
      endTime,
      clientName: clientName.trim(),
      clientPhone,
      clientEmail,
      notes,
      price: selectedService?.price ?? null,
    })
    // Reset
    setClientName("")
    setClientPhone("")
    setClientEmail("")
    setNotes("")
    setTime("")
  }

  // Генерация слотов если не переданы
  const slots = availableSlots || (() => {
    const result: string[] = []
    for (let h = 9; h < 18; h++) {
      result.push(`${String(h).padStart(2, "0")}:00`)
      result.push(`${String(h).padStart(2, "0")}:30`)
    }
    return result
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5" />
            Новая запись
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Услуга */}
          <div className="space-y-1.5">
            <Label>Услуга *</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Выберите услугу" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name} ({s.duration} мин)
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ресурс */}
          {resources.length > 0 && (
            <div className="space-y-1.5">
              <Label>Специалист / кабинет</Label>
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Дата */}
          <div className="space-y-1.5">
            <Label>Дата *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Время — слоты-чипы */}
          <div className="space-y-1.5">
            <Label>Время *</Label>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setTime(s)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    time === s
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border hover:bg-primary/10 hover:border-primary/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Клиент */}
          <div className="space-y-1.5">
            <Label>Имя клиента *</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Иванов Иван" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+7 (999) 123-45-67" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@mail.ru" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Заметки</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Дополнительная информация..." rows={2} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={!serviceId || !time || !clientName.trim()}>Записать</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
