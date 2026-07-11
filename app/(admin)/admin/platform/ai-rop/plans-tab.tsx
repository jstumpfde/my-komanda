"use client"

// AI-РОП → Тарифы: CRUD rop_plans.

import { useEffect, useState } from "react"
import { Loader2, Package, Plus, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface PlanRow {
  id: string
  name: string
  priceMonthly: number
  priceAnnual: number | null
  callsLimit: number
  managersLimit: number | null
  tokensIncluded: number | null
  active: boolean | null
}

type FormState = {
  name: string
  priceMonthly: string
  priceAnnual: string
  callsLimit: string
  managersLimit: string
  tokensIncluded: string
  active: boolean
}

const EMPTY_FORM: FormState = { name: "", priceMonthly: "", priceAnnual: "", callsLimit: "", managersLimit: "", tokensIncluded: "", active: true }

export function PlansTab() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    fetch("/api/platform/ai-rop/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPlans(j.plans ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function toggleActive(p: PlanRow) {
    await fetch(`/api/platform/ai-rop/plans/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !(p.active !== false) }),
    })
    load()
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Package className="w-4 h-4" /> Тарифы</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Новый тариф</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Название</DataHeadCell>
                  <DataHeadCell align="right">₽/мес</DataHeadCell>
                  <DataHeadCell align="right">₽/год</DataHeadCell>
                  <DataHeadCell align="right">Лимит звонков</DataHeadCell>
                  <DataHeadCell align="right">Лимит менеджеров</DataHeadCell>
                  <DataHeadCell align="right">Токенов</DataHeadCell>
                  <DataHeadCell align="center">Активен</DataHeadCell>
                  <DataHeadCell align="right" width="60px"></DataHeadCell>
                </DataHead>
                <tbody>
                  {plans.map((p) => (
                    <DataRow key={p.id}>
                      <DataCell className="font-medium">{p.name}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.priceMonthly.toLocaleString("ru-RU")}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.priceAnnual != null ? p.priceAnnual.toLocaleString("ru-RU") : "—"}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.callsLimit.toLocaleString("ru-RU")}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.managersLimit ?? "—"}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.tokensIncluded ?? "—"}</DataCell>
                      <DataCell align="center">
                        <Switch checked={p.active !== false} onCheckedChange={() => toggleActive(p)} />
                      </DataCell>
                      <DataCell align="right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Pencil className="w-4 h-4" /></Button>
                      </DataCell>
                    </DataRow>
                  ))}
                  {plans.length === 0 && (
                    <DataRow><DataCell colSpan={8}><span className="text-muted-foreground">Тарифов пока нет</span></DataCell></DataRow>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          )}
        </CardContent>
      </Card>

      <PlanDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={load}
      />
      <EditPlanDialog plan={editing} onClose={() => setEditing(null)} onSaved={load} />
    </>
  )
}

function PlanDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setForm(EMPTY_FORM); setError(null) }

  async function submit() {
    setError(null)
    if (!form.name.trim()) { setError("Введите название"); return }
    if (!form.priceMonthly) { setError("Укажите цену в месяц"); return }
    if (!form.callsLimit) { setError("Укажите лимит звонков"); return }
    setPending(true)
    try {
      const res = await fetch("/api/platform/ai-rop/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          priceMonthly: Number(form.priceMonthly),
          priceAnnual: form.priceAnnual ? Number(form.priceAnnual) : null,
          callsLimit: Number(form.callsLimit),
          managersLimit: form.managersLimit ? Number(form.managersLimit) : null,
          tokensIncluded: form.tokensIncluded ? Number(form.tokensIncluded) : null,
          active: form.active,
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
          <DialogTitle>Новый тариф</DialogTitle>
          <DialogDescription>Появится в списке тарифов для начисления токенов и привязки к биллингу компании.</DialogDescription>
        </DialogHeader>
        <PlanForm form={form} setForm={setForm} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={pending}>Отмена</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditPlanDialog({ plan, onClose, onSaved }: { plan: PlanRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!plan) return
    setForm({
      name: plan.name,
      priceMonthly: String(plan.priceMonthly),
      priceAnnual: plan.priceAnnual != null ? String(plan.priceAnnual) : "",
      callsLimit: String(plan.callsLimit),
      managersLimit: plan.managersLimit != null ? String(plan.managersLimit) : "",
      tokensIncluded: plan.tokensIncluded != null ? String(plan.tokensIncluded) : "",
      active: plan.active !== false,
    })
    setError(null)
  }, [plan?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) return null

  async function submit() {
    if (!plan) return
    setError(null)
    if (!form.name.trim()) { setError("Введите название"); return }
    setPending(true)
    try {
      const res = await fetch(`/api/platform/ai-rop/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          priceMonthly: Number(form.priceMonthly),
          priceAnnual: form.priceAnnual ? Number(form.priceAnnual) : null,
          callsLimit: Number(form.callsLimit),
          managersLimit: form.managersLimit ? Number(form.managersLimit) : null,
          tokensIncluded: form.tokensIncluded ? Number(form.tokensIncluded) : null,
          active: form.active,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Ошибка")
      onClose()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Редактировать тариф</DialogTitle></DialogHeader>
        <PlanForm form={form} setForm={setForm} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Отмена</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm">Название</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="напр. «Старт»" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-sm">Цена в месяц, ₽</Label>
          <Input type="number" min={0} value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Цена в год, ₽</Label>
          <Input type="number" min={0} value={form.priceAnnual} onChange={(e) => setForm({ ...form, priceAnnual: e.target.value })} placeholder="необязательно" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-sm">Лимит звонков</Label>
          <Input type="number" min={0} value={form.callsLimit} onChange={(e) => setForm({ ...form, callsLimit: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Лимит менеджеров</Label>
          <Input type="number" min={0} value={form.managersLimit} onChange={(e) => setForm({ ...form, managersLimit: e.target.value })} placeholder="без лимита" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Токенов включено</Label>
        <Input type="number" min={0} value={form.tokensIncluded} onChange={(e) => setForm({ ...form, tokensIncluded: e.target.value })} placeholder="напр. 500" />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="text-sm font-medium">Активен</div>
        <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
      </div>
    </div>
  )
}
