"use client"

// AI-РОП → Промокоды: список + создание rop_promos, счётчик использований.

import { useEffect, useState } from "react"
import { Loader2, Ticket, Plus, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface PromoRow {
  id: string
  code: string
  description: string | null
  discountPct: number | null
  bonusCalls: number | null
  bonusTokens: number | null
  usesCount: number | null
  maxUses: number | null
  active: boolean | null
  expiresAt: string | null
  createdAt: string | null
}

type FormState = {
  code: string
  description: string
  discountPct: string
  bonusCalls: string
  bonusTokens: string
  maxUses: string
  expiresAt: string
  active: boolean
}

const EMPTY_FORM: FormState = { code: "", description: "", discountPct: "0", bonusCalls: "0", bonusTokens: "0", maxUses: "", expiresAt: "", active: true }

function fmtDate(s: string | null): string {
  if (!s) return "—"
  try { return new Date(s).toLocaleDateString("ru-RU") } catch { return s }
}

export function PromosTab() {
  const [promos, setPromos] = useState<PromoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PromoRow | null>(null)

  function load() {
    setLoading(true)
    fetch("/api/platform/ai-rop/promos")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPromos(j.promos ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function toggleActive(p: PromoRow) {
    await fetch(`/api/platform/ai-rop/promos/${p.id}`, {
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
          <CardTitle className="flex items-center gap-2"><Ticket className="w-4 h-4" /> Промокоды</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Новый промокод</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Код</DataHeadCell>
                  <DataHeadCell>Описание</DataHeadCell>
                  <DataHeadCell align="right">Скидка</DataHeadCell>
                  <DataHeadCell align="right">Бонус токенов</DataHeadCell>
                  <DataHeadCell align="right">Использован</DataHeadCell>
                  <DataHeadCell>Истекает</DataHeadCell>
                  <DataHeadCell align="center">Активен</DataHeadCell>
                  <DataHeadCell align="right" width="60px"></DataHeadCell>
                </DataHead>
                <tbody>
                  {promos.map((p) => (
                    <DataRow key={p.id}>
                      <DataCell className="font-mono font-medium">{p.code}</DataCell>
                      <DataCell className="text-xs text-muted-foreground max-w-[240px] truncate">{p.description ?? "—"}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.discountPct ?? 0}%</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.bonusTokens ?? 0}</DataCell>
                      <DataCell align="right" className="tabular-nums">
                        {p.usesCount ?? 0}{p.maxUses != null ? ` / ${p.maxUses}` : ""}
                      </DataCell>
                      <DataCell className="text-xs">{fmtDate(p.expiresAt)}</DataCell>
                      <DataCell align="center">
                        <Switch checked={p.active !== false} onCheckedChange={() => toggleActive(p)} />
                      </DataCell>
                      <DataCell align="right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Pencil className="w-4 h-4" /></Button>
                      </DataCell>
                    </DataRow>
                  ))}
                  {promos.length === 0 && (
                    <DataRow><DataCell colSpan={8}><span className="text-muted-foreground">Промокодов пока нет</span></DataCell></DataRow>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          )}
        </CardContent>
      </Card>

      <CreatePromoDialog open={creating} onOpenChange={setCreating} onSaved={load} />
      <EditPromoDialog promo={editing} onClose={() => setEditing(null)} onSaved={load} />
    </>
  )
}

function CreatePromoDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setForm(EMPTY_FORM); setError(null) }

  async function submit() {
    setError(null)
    if (!form.code.trim()) { setError("Введите код"); return }
    setPending(true)
    try {
      const res = await fetch("/api/platform/ai-rop/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          description: form.description.trim() || null,
          discountPct: Number(form.discountPct) || 0,
          bonusCalls: Number(form.bonusCalls) || 0,
          bonusTokens: Number(form.bonusTokens) || 0,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
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
          <DialogTitle>Новый промокод</DialogTitle>
          <DialogDescription>Компания сможет применить его в своей карточке биллинга — начисляются токены (bonusTokens).</DialogDescription>
        </DialogHeader>
        <PromoForm form={form} setForm={setForm} />
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

function EditPromoDialog({ promo, onClose, onSaved }: { promo: PromoRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!promo) return
    setForm({
      code: promo.code,
      description: promo.description ?? "",
      discountPct: String(promo.discountPct ?? 0),
      bonusCalls: String(promo.bonusCalls ?? 0),
      bonusTokens: String(promo.bonusTokens ?? 0),
      maxUses: promo.maxUses != null ? String(promo.maxUses) : "",
      expiresAt: promo.expiresAt ? promo.expiresAt.slice(0, 10) : "",
      active: promo.active !== false,
    })
    setError(null)
  }, [promo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!promo) return null

  async function submit() {
    if (!promo) return
    setError(null)
    setPending(true)
    try {
      const res = await fetch(`/api/platform/ai-rop/promos/${promo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim() || null,
          discountPct: Number(form.discountPct) || 0,
          bonusCalls: Number(form.bonusCalls) || 0,
          bonusTokens: Number(form.bonusTokens) || 0,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Редактировать промокод <Badge variant="outline" className="font-mono">{promo.code}</Badge>
          </DialogTitle>
          <DialogDescription>Код изменить нельзя — только параметры бонуса.</DialogDescription>
        </DialogHeader>
        <PromoForm form={form} setForm={setForm} codeReadOnly />
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

function PromoForm({ form, setForm, codeReadOnly }: { form: FormState; setForm: (f: FormState) => void; codeReadOnly?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm">Код</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="ЛЕТО2026"
          disabled={codeReadOnly}
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Описание</Label>
        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Для кого и зачем этот промокод" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-sm">Скидка, %</Label>
          <Input type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Бонус токенов</Label>
          <Input type="number" min={0} value={form.bonusTokens} onChange={(e) => setForm({ ...form, bonusTokens: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Бонус звонков</Label>
          <Input type="number" min={0} value={form.bonusCalls} onChange={(e) => setForm({ ...form, bonusCalls: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-sm">Лимит использований</Label>
          <Input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="без лимита" />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Истекает</Label>
          <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="text-sm font-medium">Активен</div>
        <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
      </div>
    </div>
  )
}
