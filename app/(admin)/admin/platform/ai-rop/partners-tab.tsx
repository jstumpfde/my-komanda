"use client"

// AI-РОП → Партнёры и рефералы: простые списки + создание (без глубокой
// логики начисления комиссий — как в оригинале call-agent).

import { useEffect, useState } from "react"
import { Loader2, Handshake, UserPlus, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface PartnerRow {
  id: string
  name: string
  email: string | null
  contact: string | null
  commissionPct: number | null
  refCode: string | null
  clientsCount: number | null
  revenueTotal: number | null
  status: string | null
}

interface ReferralRow {
  id: string
  code: string
  name: string | null
  tenantName: string | null
  usesCount: number | null
  maxUses: number | null
  discountPct: number | null
  expiresAt: string | null
}

function fmtDate(s: string | null): string {
  if (!s) return "—"
  try { return new Date(s).toLocaleDateString("ru-RU") } catch { return s }
}

export function PartnersTab() {
  return (
    <div className="space-y-4">
      <PartnersCard />
      <ReferralsCard />
    </div>
  )
}

function PartnersCard() {
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    fetch("/api/platform/ai-rop/partners")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPartners(j.partners ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Handshake className="w-4 h-4" /> Партнёры</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Новый партнёр</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Имя</DataHeadCell>
                  <DataHeadCell>Контакт</DataHeadCell>
                  <DataHeadCell align="right">Комиссия</DataHeadCell>
                  <DataHeadCell>Реф-код</DataHeadCell>
                  <DataHeadCell align="right">Клиентов</DataHeadCell>
                  <DataHeadCell align="right">Выручка</DataHeadCell>
                  <DataHeadCell>Статус</DataHeadCell>
                </DataHead>
                <tbody>
                  {partners.map((p) => (
                    <DataRow key={p.id}>
                      <DataCell className="font-medium">{p.name}</DataCell>
                      <DataCell className="text-xs text-muted-foreground">{p.email ?? p.contact ?? "—"}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.commissionPct ?? 0}%</DataCell>
                      <DataCell className="font-mono text-xs">{p.refCode ?? "—"}</DataCell>
                      <DataCell align="right" className="tabular-nums">{p.clientsCount ?? 0}</DataCell>
                      <DataCell align="right" className="tabular-nums">{(p.revenueTotal ?? 0).toLocaleString("ru-RU")} ₽</DataCell>
                      <DataCell>
                        <Badge variant="outline" className={p.status === "paused" ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-700 border-emerald-200"}>
                          {p.status === "paused" ? "на паузе" : "активен"}
                        </Badge>
                      </DataCell>
                    </DataRow>
                  ))}
                  {partners.length === 0 && (
                    <DataRow><DataCell colSpan={7}><span className="text-muted-foreground">Партнёров пока нет</span></DataCell></DataRow>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          )}
        </CardContent>
      </Card>
      <CreatePartnerDialog open={creating} onOpenChange={setCreating} onSaved={load} />
    </>
  )
}

function CreatePartnerDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [contact, setContact] = useState("")
  const [commissionPct, setCommissionPct] = useState("10")
  const [refCode, setRefCode] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setName(""); setEmail(""); setContact(""); setCommissionPct("10"); setRefCode(""); setError(null) }

  async function submit() {
    setError(null)
    if (!name.trim()) { setError("Введите имя/название"); return }
    setPending(true)
    try {
      const res = await fetch("/api/platform/ai-rop/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          contact: contact.trim() || null,
          commissionPct: Number(commissionPct) || 0,
          refCode: refCode.trim() || null,
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новый партнёр</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-sm">Имя / название</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-sm">Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-sm">Контакт</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="телефон/телеграм" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-sm">Комиссия, %</Label><Input type="number" min={0} max={100} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-sm">Реф-код</Label><Input value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="необязательно" /></div>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={pending}>Отмена</Button>
          <Button onClick={submit} disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReferralsCard() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    fetch("/api/platform/ai-rop/referrals")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setReferrals(j.referrals ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Рефералы</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Новый реферал</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Код</DataHeadCell>
                  <DataHeadCell>Название</DataHeadCell>
                  <DataHeadCell>Компания-источник</DataHeadCell>
                  <DataHeadCell align="right">Скидка</DataHeadCell>
                  <DataHeadCell align="right">Использован</DataHeadCell>
                  <DataHeadCell>Истекает</DataHeadCell>
                </DataHead>
                <tbody>
                  {referrals.map((r) => (
                    <DataRow key={r.id}>
                      <DataCell className="font-mono font-medium">{r.code}</DataCell>
                      <DataCell className="text-xs text-muted-foreground">{r.name ?? "—"}</DataCell>
                      <DataCell className="text-xs">{r.tenantName ?? "—"}</DataCell>
                      <DataCell align="right" className="tabular-nums">{r.discountPct ?? 0}%</DataCell>
                      <DataCell align="right" className="tabular-nums">{r.usesCount ?? 0}{r.maxUses != null ? ` / ${r.maxUses}` : ""}</DataCell>
                      <DataCell className="text-xs">{fmtDate(r.expiresAt)}</DataCell>
                    </DataRow>
                  ))}
                  {referrals.length === 0 && (
                    <DataRow><DataCell colSpan={6}><span className="text-muted-foreground">Рефералов пока нет</span></DataCell></DataRow>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          )}
        </CardContent>
      </Card>
      <CreateReferralDialog open={creating} onOpenChange={setCreating} onSaved={load} />
    </>
  )
}

function CreateReferralDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [discountPct, setDiscountPct] = useState("0")
  const [maxUses, setMaxUses] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setCode(""); setName(""); setDiscountPct("0"); setMaxUses(""); setError(null) }

  async function submit() {
    setError(null)
    if (!code.trim()) { setError("Введите код"); return }
    setPending(true)
    try {
      const res = await fetch("/api/platform/ai-rop/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim() || null,
          discountPct: Number(discountPct) || 0,
          maxUses: maxUses ? Number(maxUses) : null,
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новый реферальный код</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-sm">Код</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" /></div>
          <div className="space-y-1"><Label className="text-sm">Название</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="необязательно" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-sm">Скидка, %</Label><Input type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-sm">Лимит использований</Label><Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="без лимита" /></div>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={pending}>Отмена</Button>
          <Button onClick={submit} disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
