"use client"

// AI-РОП → Платежи: журнал rop_payments + ручное добавление (шлюза нет).

import { useEffect, useState } from "react"
import { Loader2, Receipt, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface PaymentRow {
  id: string
  tenantId: string | null
  tenantName: string | null
  companyName: string | null
  amount: number
  currency: string | null
  plan: string | null
  status: string | null
  paymentMethod: string | null
  periodFrom: string | null
  periodTo: string | null
  notes: string | null
  createdAt: string | null
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "ожидает", cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
  paid: { label: "оплачен", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  failed: { label: "ошибка", cls: "bg-red-500/10 text-red-700 border-red-200" },
  refunded: { label: "возврат", cls: "bg-muted text-muted-foreground border-border" },
}

function fmtDate(s: string | null): string {
  if (!s) return "—"
  try { return new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) } catch { return s }
}
function fmtDay(s: string | null): string {
  if (!s) return "—"
  try { return new Date(s + "T00:00:00").toLocaleDateString("ru-RU") } catch { return s }
}

export function PaymentsTab() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    fetch("/api/platform/ai-rop/payments")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPayments(j.payments ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Receipt className="w-4 h-4" /> Платежи</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Добавить платёж</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Дата</DataHeadCell>
                  <DataHeadCell>Компания</DataHeadCell>
                  <DataHeadCell align="right">Сумма</DataHeadCell>
                  <DataHeadCell>Тариф</DataHeadCell>
                  <DataHeadCell>Статус</DataHeadCell>
                  <DataHeadCell>Способ</DataHeadCell>
                  <DataHeadCell>Период</DataHeadCell>
                </DataHead>
                <tbody>
                  {payments.map((p) => {
                    const s = STATUS_LABEL[p.status ?? "pending"] ?? { label: p.status ?? "—", cls: "bg-muted text-muted-foreground border-border" }
                    return (
                      <DataRow key={p.id}>
                        <DataCell className="text-xs whitespace-nowrap">{fmtDate(p.createdAt)}</DataCell>
                        <DataCell>{p.companyName ?? p.tenantName ?? "—"}</DataCell>
                        <DataCell align="right" className="tabular-nums font-medium">
                          {p.amount.toLocaleString("ru-RU")} {p.currency ?? "RUB"}
                        </DataCell>
                        <DataCell className="text-xs">{p.plan ?? "—"}</DataCell>
                        <DataCell><Badge variant="outline" className={s.cls}>{s.label}</Badge></DataCell>
                        <DataCell className="text-xs text-muted-foreground">{p.paymentMethod ?? "—"}</DataCell>
                        <DataCell className="text-xs whitespace-nowrap">
                          {p.periodFrom || p.periodTo ? `${fmtDay(p.periodFrom)} — ${fmtDay(p.periodTo)}` : "—"}
                        </DataCell>
                      </DataRow>
                    )
                  })}
                  {payments.length === 0 && (
                    <DataRow><DataCell colSpan={7}><span className="text-muted-foreground">Платежей пока нет</span></DataCell></DataRow>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          )}
        </CardContent>
      </Card>

      <CreatePaymentDialog open={creating} onOpenChange={setCreating} onSaved={load} />
    </>
  )
}

function CreatePaymentDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [plan, setPlan] = useState("")
  const [status, setStatus] = useState("pending")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [periodFrom, setPeriodFrom] = useState("")
  const [periodTo, setPeriodTo] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setAmount(""); setTenantName(""); setPlan(""); setStatus("pending")
    setPaymentMethod(""); setPeriodFrom(""); setPeriodTo(""); setNotes(""); setError(null)
  }

  async function submit() {
    setError(null)
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) { setError("Укажите сумму больше 0"); return }
    setPending(true)
    try {
      const res = await fetch("/api/platform/ai-rop/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: n,
          tenantName: tenantName.trim() || null,
          plan: plan.trim() || null,
          status,
          paymentMethod: paymentMethod.trim() || null,
          periodFrom: periodFrom || null,
          periodTo: periodTo || null,
          notes: notes.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Ошибка")
      reset()
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Добавить платёж</DialogTitle>
          <DialogDescription>Ручной учёт — платёжного шлюза нет. Токены компании начисляются отдельно (вкладка «Токены»).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Сумма</Label>
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Статус</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ожидает</SelectItem>
                  <SelectItem value="paid">Оплачен</SelectItem>
                  <SelectItem value="failed">Ошибка</SelectItem>
                  <SelectItem value="refunded">Возврат</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Компания (свободный текст — не привязка к тенанту)</Label>
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="напр. ИП Штумпф" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Тариф</Label>
              <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="напр. Старт" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Способ оплаты</Label>
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="напр. счёт, карта" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Период с</Label>
              <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Период по</Label>
              <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Заметка</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={pending}>Отмена</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
