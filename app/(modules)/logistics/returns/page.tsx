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
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RotateCcw, Plus } from "lucide-react"
import { toast } from "sonner"

type ReturnStatus = "new" | "processing" | "accepted" | "rejected"

interface ReturnItem {
  id: string
  number: string
  client: string
  orderNumber: string
  itemCount: number
  reason: string
  date: string
  notes: string
  status: ReturnStatus
}

const RETURN_REASONS = [
  "Бракованный товар",
  "Ошибка заказа",
  "Передумал",
  "Пересорт",
]

const INITIAL_RETURNS: ReturnItem[] = [
  { id: "1", number: "ВОЗ-0101", client: "ООО «Стройторг»",  orderNumber: "ЗАК-2280", itemCount: 3, reason: "Бракованный товар",  date: "27.03.2026", notes: "Крепёж — нарушена упаковка, коррозия", status: "new"        },
  { id: "2", number: "ВОЗ-0102", client: "ИП Иванова М.А.",  orderNumber: "ЗАК-2275", itemCount: 1, reason: "Ошибка заказа",     date: "26.03.2026", notes: "Прислали 32 мм вместо 25 мм",         status: "processing" },
  { id: "3", number: "ВОЗ-0103", client: "ИП Казаков В.В.", orderNumber: "ЗАК-2270", itemCount: 2, reason: "Передумал",          date: "25.03.2026", notes: "Клиент не использовал товар",          status: "accepted"   },
  { id: "4", number: "ВОЗ-0104", client: "АО «ТехноМаш»",   orderNumber: "ЗАК-2265", itemCount: 5, reason: "Пересорт",          date: "24.03.2026", notes: "Другой артикул в коробке",             status: "accepted"   },
  { id: "5", number: "ВОЗ-0105", client: "ООО «РемСервис»", orderNumber: "ЗАК-2260", itemCount: 1, reason: "Бракованный товар", date: "23.03.2026", notes: "Краска не той марки, несоответствие",  status: "rejected"   },
]

const STATUS_MAP: Record<ReturnStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new:        { label: "Новый",        variant: "default"     },
  processing: { label: "В обработке",  variant: "secondary"   },
  accepted:   { label: "Принят",       variant: "outline"     },
  rejected:   { label: "Отклонён",     variant: "destructive" },
}

const ORDERS_LIST = ["ЗАК-2301", "ЗАК-2300", "ЗАК-2299", "ЗАК-2298", "ЗАК-2297", "ЗАК-2296", "ЗАК-2295"]

export default function LogisticsReturnsPage() {
  const [returns, setReturns] = useState<ReturnItem[]>(INITIAL_RETURNS)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ client: "", order: ORDERS_LIST[0], itemCount: "1", reason: RETURN_REASONS[0], notes: "" })

  const handleAdd = () => {
    const newReturn: ReturnItem = {
      id: String(Date.now()),
      number: `ВОЗ-${106 + returns.length}`,
      client: form.client || "Клиент",
      orderNumber: form.order,
      itemCount: Number(form.itemCount) || 1,
      reason: form.reason,
      date: "29.03.2026",
      notes: form.notes,
      status: "new",
    }
    setReturns(prev => [newReturn, ...prev])
    setOpen(false)
    setForm({ client: "", order: ORDERS_LIST[0], itemCount: "1", reason: RETURN_REASONS[0], notes: "" })
    toast.success(`Возврат ${newReturn.number} оформлен`)
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
                  <RotateCcw className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Возвраты</h1>
                  <p className="text-sm text-muted-foreground">{returns.length} возвратов</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" /> Оформить возврат
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
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Клиент</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Заказ</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3">Товаров</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Причина</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Комментарий</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Дата</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returns.map(r => {
                        const st = STATUS_MAP[r.status]
                        return (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-xs font-mono font-semibold">{r.number}</td>
                            <td className="px-3 py-3 text-sm max-w-[140px] truncate">{r.client}</td>
                            <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{r.orderNumber}</td>
                            <td className="text-right px-3 py-3 text-sm">{r.itemCount}</td>
                            <td className="px-3 py-3 text-sm">{r.reason}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{r.notes}</td>
                            <td className="px-3 py-3 text-sm text-muted-foreground">{r.date}</td>
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

      {/* Add return dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Оформить возврат
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Клиент</Label>
              <Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="ООО «Название»" />
            </div>
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
              <Label>Количество позиций</Label>
              <Input type="number" min="1" value={form.itemCount} onChange={e => setForm(f => ({ ...f, itemCount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Причина возврата</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Комментарий</Label>
              <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Подробности..." />
            </div>
            <Button className="w-full" onClick={handleAdd}>Оформить возврат</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
