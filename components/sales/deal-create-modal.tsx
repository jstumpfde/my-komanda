"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Handshake } from "lucide-react"
import { DEAL_STAGES, DEAL_SOURCES } from "@/lib/crm/deal-stages"

interface DealCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: Record<string, unknown>) => void
}

export function DealCreateModal({ open, onOpenChange, onSubmit }: DealCreateModalProps) {
  const [form, setForm] = useState({
    title: "",
    amount: "",
    stage: "new",
    source: "",
    expectedCloseDate: "",
  })

  const handleSubmit = () => {
    if (!form.title.trim()) return
    onSubmit({
      title: form.title.trim(),
      amount: form.amount ? Number(form.amount.replace(/\s/g, "")) : undefined,
      stage: form.stage,
      source: form.source || undefined,
      expectedCloseDate: form.expectedCloseDate || undefined,
    })
    setForm({ title: "", amount: "", stage: "new", source: "", expectedCloseDate: "" })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5" />
            Новая сделка
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Название сделки *</Label>
            <Input
              placeholder="Поставка оборудования для ООО..."
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Сумма (руб.)</Label>
            <Input
              placeholder="500 000"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Этап</Label>
              <Select value={form.stage} onValueChange={(v) => setForm((p) => ({ ...p, stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.filter((s) => s.id !== "won" && s.id !== "lost").map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Источник</Label>
              <Select value={form.source} onValueChange={(v) => setForm((p) => ({ ...p, source: v }))}>
                <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
                <SelectContent>
                  {DEAL_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Ожидаемая дата закрытия</Label>
            <Input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm((p) => ({ ...p, expectedCloseDate: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={!form.title.trim()}>Создать</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
