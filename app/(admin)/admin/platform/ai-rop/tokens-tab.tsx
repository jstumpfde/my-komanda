"use client"

// AI-РОП → Токены: список компаний с балансом + карточка компании (Sheet):
// история операций, сводка периода, действия (пополнить/корректировка/промо/
// тариф), настройки биллинга (enforce/порог/период/тариф/автопродление/уведомления).

import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from "@/components/ui/sheet"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface CompanyRow {
  id: string
  name: string
  aiRopEnabled: boolean
  balance: number
}

interface PlanRow {
  id: string
  name: string
  priceMonthly: number
  tokensIncluded: number | null
  active: boolean | null
}

interface LedgerRow {
  id: string
  delta: number
  reason: string
  note: string | null
  createdAt: string | null
  refCallId: string | null
}

interface SummaryData {
  granted: number
  topup: number
  promo: number
  spent: number
  net: number
  byReason: Record<string, number>
}

interface SettingsData {
  enforce: boolean
  lowThreshold: number
  periodEnd: string | null
  notifyEnabled: boolean
  notifyEmails: string[]
  planId: string | null
  autoRenew: boolean
}

const REASON_LABEL: Record<string, { label: string; cls: string }> = {
  plan_grant: { label: "тариф", cls: "bg-blue-500/10 text-blue-700 border-blue-200" },
  topup: { label: "пополнение", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  promo_bonus: { label: "промокод", cls: "bg-violet-500/10 text-violet-700 border-violet-200" },
  call: { label: "разбор звонка", cls: "bg-muted text-muted-foreground border-border" },
  manual: { label: "ручная правка", cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
  adjust: { label: "ручная правка", cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
}

function fmtDate(s: string | null): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return s
  }
}

export function TokensTab() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch("/api/platform/ai-rop/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setCompanies(j.companies ?? [])
          setPlans(j.plans ?? [])
        }
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return query ? companies.filter((c) => c.name.toLowerCase().includes(query)) : companies
  }, [companies, q])

  function onBalanceChange(companyId: string, balance: number) {
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, balance } : c)))
  }

  const selected = companies.find((c) => c.id === openId) ?? null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="w-4 h-4" /> Баланс токенов по компаниям</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">1 токен списывается за каждый разобранный звонок.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Поиск по компании…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-64" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <TableCard>
              <DataTable>
                <DataHead>
                  <DataHeadCell>Компания</DataHeadCell>
                  <DataHeadCell align="center">AI-РОП</DataHeadCell>
                  <DataHeadCell align="right">Баланс</DataHeadCell>
                  <DataHeadCell align="right" width="120px">Действия</DataHeadCell>
                </DataHead>
                <tbody>
                  {filtered.map((c) => (
                    <DataRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                      <DataCell className="font-medium">{c.name}</DataCell>
                      <DataCell align="center">
                        {c.aiRopEnabled
                          ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200">вкл</Badge>
                          : <Badge variant="outline" className="bg-muted text-muted-foreground">выкл</Badge>}
                      </DataCell>
                      <DataCell align="right" className={c.balance <= 0 ? "text-red-600 font-medium tabular-nums" : "tabular-nums"}>
                        {c.balance}
                      </DataCell>
                      <DataCell align="right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(c.id) }}>Открыть</Button>
                      </DataCell>
                    </DataRow>
                  ))}
                  {filtered.length === 0 && (
                    <DataRow><DataCell colSpan={4}><span className="text-muted-foreground">Нет компаний</span></DataCell></DataRow>
                  )}
                </tbody>
              </DataTable>
            </TableCard>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> {selected?.name ?? "Компания"}</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex-1 overflow-y-auto px-5 py-4">
            {selected && (
              <CompanyDetail
                companyId={selected.id}
                plans={plans}
                onBalanceChange={(balance) => onBalanceChange(selected.id, balance)}
              />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function CompanyDetail({
  companyId, plans, onBalanceChange,
}: {
  companyId: string
  plans: PlanRow[]
  onBalanceChange: (balance: number) => void
}) {
  const [balance, setBalance] = useState<number | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    fetch(`/api/platform/ai-rop/companies/${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return
        setBalance(j.balance)
        setLedger(j.ledger ?? [])
        setSummary(j.summary ?? null)
        setSettings(j.settings ?? null)
        onBalanceChange(j.balance)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Текущий баланс</div>
          <div className={`text-3xl font-bold ${((balance ?? 0) <= 0) ? "text-red-600" : ""}`}>{balance ?? 0}</div>
        </div>
        {summary && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div>Начислено (тариф): <b className="text-foreground">{summary.granted}</b></div>
            <div>Пополнено: <b className="text-foreground">{summary.topup}</b></div>
            <div>Промо-бонус: <b className="text-foreground">{summary.promo}</b></div>
            <div>Списано: <b className="text-foreground">{summary.spent}</b></div>
          </div>
        )}
      </div>

      <TokenActions companyId={companyId} plans={plans} onDone={load} />

      {settings && (
        <BillingSettingsCard companyId={companyId} plans={plans} initial={settings} onSaved={load} />
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">История операций</CardTitle></CardHeader>
        <CardContent>
          <TableCard>
            <DataTable maxHeight="360px">
              <DataHead sticky>
                <DataHeadCell>Дата</DataHeadCell>
                <DataHeadCell>Причина</DataHeadCell>
                <DataHeadCell align="right">Δ</DataHeadCell>
                <DataHeadCell>Комментарий</DataHeadCell>
              </DataHead>
              <tbody>
                {ledger.map((l) => {
                  const r = REASON_LABEL[l.reason] ?? { label: l.reason, cls: "bg-muted text-muted-foreground border-border" }
                  return (
                    <DataRow key={l.id}>
                      <DataCell className="text-xs whitespace-nowrap">{fmtDate(l.createdAt)}</DataCell>
                      <DataCell><Badge variant="outline" className={r.cls}>{r.label}</Badge></DataCell>
                      <DataCell align="right" className={`tabular-nums font-medium ${l.delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                      </DataCell>
                      <DataCell className="text-xs text-muted-foreground">{l.note ?? "—"}</DataCell>
                    </DataRow>
                  )
                })}
                {ledger.length === 0 && (
                  <DataRow><DataCell colSpan={4}><span className="text-muted-foreground">Операций пока нет</span></DataCell></DataRow>
                )}
              </tbody>
            </DataTable>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}

function TokenActions({
  companyId, plans, onDone,
}: {
  companyId: string
  plans: PlanRow[]
  onDone: () => void
}) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [delta, setDelta] = useState("")
  const [code, setCode] = useState("")
  const [planId, setPlanId] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: string, body: Record<string, unknown>) {
    setPending(action)
    setError(null)
    try {
      const res = await fetch(`/api/platform/ai-rop/companies/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Ошибка")
      setAmount(""); setNote(""); setDelta(""); setCode("")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(null)
    }
  }

  const activePlans = plans.filter((p) => p.active !== false)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Действия с балансом</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Пополнить (кол-во)</Label>
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" placeholder="100" />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label className="text-xs">Комментарий</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" />
          </div>
          <Button
            size="sm"
            disabled={!amount || pending !== null}
            onClick={() => run("topup", { amount: Number(amount), note })}
          >
            {pending === "topup" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Пополнить
          </Button>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Корректировка (± кол-во)</Label>
            <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="w-28" placeholder="-10" />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!delta || pending !== null}
            onClick={() => run("adjust", { delta: Number(delta), note })}
          >
            {pending === "adjust" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Скорректировать
          </Button>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Промокод</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} className="w-40" placeholder="ПРОМО2026" />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!code.trim() || pending !== null}
            onClick={() => run("promo", { code })}
          >
            {pending === "promo" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Применить промо
          </Button>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1 min-w-[220px]">
            <Label className="text-xs">Начислить токены тарифа</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Выберите тариф…" /></SelectTrigger>
              <SelectContent>
                {activePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} — {p.tokensIncluded ?? 0} токенов</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!planId || pending !== null}
            onClick={() => run("grant_plan", { planId })}
          >
            {pending === "grant_plan" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Начислить
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

function BillingSettingsCard({
  companyId, plans, initial, onSaved,
}: {
  companyId: string
  plans: PlanRow[]
  initial: SettingsData
  onSaved: () => void
}) {
  const [enforce, setEnforce] = useState(initial.enforce)
  const [lowThreshold, setLowThreshold] = useState(String(initial.lowThreshold))
  const [periodEnd, setPeriodEnd] = useState(initial.periodEnd ?? "")
  const [planId, setPlanId] = useState(initial.planId ?? "")
  const [autoRenew, setAutoRenew] = useState(initial.autoRenew)
  const [notifyEnabled, setNotifyEnabled] = useState(initial.notifyEnabled)
  const [notifyEmails, setNotifyEmails] = useState(initial.notifyEmails.join(", "))
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    setPending(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/platform/ai-rop/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enforce,
          lowThreshold: Number(lowThreshold) || 0,
          periodEnd: periodEnd || null,
          planId: planId || null,
          autoRenew,
          notifyEnabled,
          notifyEmails: notifyEmails.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "Ошибка")
      setMsg("Сохранено")
      onSaved()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Биллинг компании</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="text-sm">
            <div className="font-medium">Жёсткий блок (enforce)</div>
            <div className="text-muted-foreground text-xs">Блокировать разбор звонков при балансе ≤ 0</div>
          </div>
          <Switch checked={enforce} onCheckedChange={setEnforce} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Порог низкого баланса</Label>
            <Input type="number" min={0} value={lowThreshold} onChange={(e) => setLowThreshold(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Конец оплаченного периода</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Тариф компании</Label>
          <Select value={planId || "none"} onValueChange={(v) => setPlanId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Не выбран</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="text-sm">
            <div className="font-medium">Автопродление</div>
            <div className="text-muted-foreground text-xs">Крон сам начислит токены тарифа по истечении периода и сдвинет дату на месяц</div>
          </div>
          <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="text-sm">
            <div className="font-medium">Уведомления клиенту</div>
            <div className="text-muted-foreground text-xs">О низком балансе и конце периода</div>
          </div>
          <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Получатели (через запятую, пусто = директора компании)</Label>
          <Textarea rows={2} value={notifyEmails} onChange={(e) => setNotifyEmails(e.target.value)} placeholder="ivan@example.com, hr@example.com" />
        </div>

        <div className="flex items-center justify-between pt-1">
          {msg && <span className={`text-sm ${msg === "Сохранено" ? "text-emerald-600" : "text-destructive"}`}>{msg}</span>}
          <div className="ml-auto">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Сохранить биллинг
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
