"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from "@/components/ui/sheet"
import { Loader2, Users, Wallet, Percent, Building2, Plus, UserPlus, CheckCircle2, Copy, LogIn } from "lucide-react"
import { toast } from "sonner"
import { useSession } from "next-auth/react"
import { enterClientImpersonation } from "./impersonation-actions"

interface Overview {
  kind: string
  billingMode: string
  commissionPercent: number
  isOverride: boolean
  totalClients: number
  activeClients: number
  totalMrrRub: number
  totalEarningsRub: number
}
interface ClientRow {
  companyId: string
  name: string
  status: string | null
  subscriptionStatus: string | null
  planName: string | null
  mrrRub: number
  modules: { slug: string; name: string }[]
  commissionPercent: number
  earningsRub: number
}

const KIND_LABEL: Record<string, string> = {
  partner: "Партнёр",
  sub_partner: "Суб-партнёр",
  referral: "Реферал",
}
const SUB_LABEL: Record<string, string> = {
  active: "Активна",
  trial: "Триал",
  paused: "Пауза",
  cancelled: "Отменена",
  expired: "Истекла",
}

function rub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽"
}

interface Product { slug: string; name: string }

export default function PartnerDashboardPage() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // Онбординг клиента
  const [products, setProducts] = useState<Product[]>([])
  const [onbOpen, setOnbOpen] = useState(false)
  const [manageId, setManageId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([
        fetch("/api/partner/overview").then((r) => r.ok ? r.json() : Promise.reject(r)),
        fetch("/api/partner/clients").then((r) => r.ok ? r.json() : Promise.reject(r)),
      ])
      setOv(o); setClients(c.clients ?? [])
    } catch { setError("Не удалось загрузить данные кабинета") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    fetch("/api/partner/products").then((r) => r.ok ? r.json() : null).then((d) => { if (d) setProducts(d.products ?? []) }).catch(() => {})
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Партнёрский кабинет</h1>
          <p className="text-sm text-muted-foreground">Ваши клиенты и доход с платформы</p>
        </div>
        <div className="flex items-center gap-2">
          {ov && (
            <Badge variant="outline" className="text-xs">
              {KIND_LABEL[ov.kind] ?? ov.kind} · комиссия {ov.commissionPercent}% {ov.isOverride ? "(фикс)" : "(по объёму)"}
            </Badge>
          )}
          {ov?.kind !== "referral" && (
            <Button size="sm" className="gap-1.5" onClick={() => setOnbOpen(true)}>
              <Plus className="size-4" /> Подключить клиента
            </Button>
          )}
        </div>
      </div>

      <OnboardSheet open={onbOpen} onOpenChange={setOnbOpen} products={products} onDone={load} />
      <ClientManageSheet companyId={manageId} onOpenChange={(o) => { if (!o) setManageId(null) }} onChanged={load} />

      {/* Сводка */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="size-4" />} label="Клиентов" value={`${ov?.totalClients ?? 0}`} hint={`активных: ${ov?.activeClients ?? 0}`} />
        <StatCard icon={<Wallet className="size-4" />} label="Оборот клиентов / мес" value={rub(ov?.totalMrrRub ?? 0)} />
        <StatCard icon={<Percent className="size-4" />} label="Моя комиссия" value={`${ov?.commissionPercent ?? 0}%`} />
        <StatCard icon={<Wallet className="size-4" />} label="Мой доход / мес" value={rub(ov?.totalEarningsRub ?? 0)} accent />
      </div>

      {/* Мои клиенты */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="size-4" /> Мои клиенты
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Пока нет клиентов. Нажмите «Подключить клиента» — заведёте компанию, логин директора и продукты.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Клиент</th>
                    <th className="px-4 py-2 font-medium">Подписка</th>
                    <th className="px-4 py-2 font-medium">Продукты</th>
                    <th className="px-4 py-2 font-medium text-right">Платит / мес</th>
                    <th className="px-4 py-2 font-medium text-right">Мой доход / мес</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.companyId} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setManageId(c.companyId)} title="Настроить продукты клиента">
                      <td className="px-4 py-2.5 font-medium">{c.name || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[11px]">
                          {SUB_LABEL[c.subscriptionStatus ?? ""] ?? (c.subscriptionStatus || "—")}
                        </Badge>
                        {c.planName && <span className="ml-1.5 text-xs text-muted-foreground">{c.planName}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.modules.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.modules.map((m) => (
                              <Badge key={m.slug} variant="secondary" className="text-[10px]">{m.name}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{rub(c.mrrRub)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{rub(c.earningsRub)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OnboardSheet({ open, onOpenChange, products, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; products: Product[]; onDone: () => void
}) {
  const [companyName, setCompanyName] = useState("")
  const [directorEmail, setDirectorEmail] = useState("")
  const [directorName, setDirectorName] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ directorEmail: string; tempPassword: string } | null>(null)

  const reset = () => {
    setCompanyName(""); setDirectorEmail(""); setDirectorName(""); setSelected(new Set()); setResult(null)
  }
  const toggle = (slug: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n })
  }

  const submit = async () => {
    if (!companyName.trim()) { toast.error("Укажите название компании"); return }
    if (!directorEmail.trim().includes("@")) { toast.error("Укажите email директора"); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/partner/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(), directorEmail: directorEmail.trim(),
          directorName: directorName.trim() || undefined, moduleSlugs: [...selected],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setResult({ directorEmail: data.directorEmail, tempPassword: data.tempPassword }); onDone() }
      else toast.error(data.error || "Ошибка")
    } finally { setSubmitting(false) }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><UserPlus className="size-4" />Подключить клиента</SheetTitle>
        </SheetHeader>

        {result ? (
          <SheetBody className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5" /><span className="font-medium">Клиент создан</span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
              <p className="text-xs text-muted-foreground">Передайте директору для входа:</p>
              <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Логин</span><code className="font-mono">{result.directorEmail}</code></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Пароль</span>
                <span className="flex items-center gap-1.5">
                  <code className="font-mono">{result.tempPassword}</code>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => { void navigator.clipboard.writeText(result.tempPassword); toast.success("Скопировано") }}>
                    <Copy className="size-3.5" />
                  </Button>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">Пароль показывается один раз — клиент сменит его после входа.</p>
            </div>
            <Button className="w-full" onClick={() => { onOpenChange(false); reset() }}>Готово</Button>
            <Button variant="outline" className="w-full" onClick={reset}>Подключить ещё клиента</Button>
          </SheetBody>
        ) : (
          <SheetBody className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Название компании-клиента *</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="ООО «Ромашка»" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email директора (логин) *</Label>
              <Input type="email" value={directorEmail} onChange={(e) => setDirectorEmail(e.target.value)} placeholder="director@romashka.ru" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Имя директора</Label>
              <Input value={directorName} onChange={(e) => setDirectorName(e.target.value)} placeholder="Иван Петров" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Подключить продукты</Label>
              <div className="grid grid-cols-1 gap-1.5 rounded-lg border p-2 max-h-56 overflow-y-auto">
                {products.length === 0 ? (
                  <span className="text-xs text-muted-foreground px-1 py-1">Список продуктов недоступен</span>
                ) : products.map((p) => (
                  <label key={p.slug} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                    <input type="checkbox" checked={selected.has(p.slug)} onChange={() => toggle(p.slug)} className="accent-primary size-4" />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full gap-1.5" onClick={() => void submit()} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Создать клиента
            </Button>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ClientManageSheet({ companyId, onOpenChange, onChanged }: {
  companyId: string | null; onOpenChange: (o: boolean) => void; onChanged: () => void
}) {
  const { update: updateSession } = useSession()
  const [name, setName] = useState("")
  const [products, setProducts] = useState<{ slug: string; name: string; enabled: boolean }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    fetch(`/api/partner/clients/${companyId}`).then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => { setName(d.name || ""); setProducts(d.products ?? []); setSelected(new Set((d.products ?? []).filter((p: { enabled: boolean }) => p.enabled).map((p: { slug: string }) => p.slug))) })
      .catch(() => toast.error("Не удалось загрузить клиента"))
      .finally(() => setLoading(false))
  }, [companyId])

  const toggle = (slug: string) => setSelected((prev) => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n })

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/partner/clients/${companyId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleSlugs: [...selected] }),
      })
      if (res.ok) { toast.success("Продукты сохранены"); onChanged() } else toast.error("Ошибка")
    } finally { setSaving(false) }
  }

  const unassign = async () => {
    if (!companyId || !window.confirm("Отвязать клиента от вас? Компания клиента останется, но пропадёт из вашего списка.")) return
    const res = await fetch(`/api/partner/clients/${companyId}`, { method: "DELETE" })
    if (res.ok) { toast.success("Клиент отвязан"); onChanged(); onOpenChange(false) } else toast.error("Ошибка")
  }

  // «Войти как клиент»: server-action ставит подписанную куку + аудит и
  // редиректит на «/». updateSession() — чтобы клиентская сессия перечитала
  // session callback (эффективный companyId/effectiveRole) до навигации.
  const enter = async () => {
    if (!companyId || entering) return
    setEntering(true)
    try {
      await enterClientImpersonation(companyId)
      // redirect() в action прерывает выполнение — код ниже не достигается при
      // успехе. updateSession ставим перед на случай, если навигация мягкая.
      await updateSession({})
    } catch (e) {
      // NEXT_REDIRECT — штатный сигнал редиректа из server-action, не ошибка.
      const digest = (e as { digest?: string } | null)?.digest
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        await updateSession({}).catch(() => {})
        throw e
      }
      setEntering(false)
      toast.error("Не удалось войти как клиент")
    }
  }

  return (
    <Sheet open={!!companyId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Building2 className="size-4" />{name || "Клиент"}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4 pt-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">Подключённые продукты</Label>
                <div className="grid grid-cols-1 gap-1.5 rounded-lg border p-2">
                  {products.map((p) => (
                    <label key={p.slug} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <input type="checkbox" checked={selected.has(p.slug)} onChange={() => toggle(p.slug)} className="accent-primary size-4" />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <Button className="w-full gap-1.5" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Сохранить продукты
              </Button>
              <Button variant="outline" className="w-full gap-1.5" onClick={() => void enter()} disabled={entering} title="Войти в кабинет клиента с полным доступом (директор). Действие фиксируется в аудите.">
                {entering ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                Войти как клиент
              </Button>
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => void unassign()}>
                Отвязать клиента
              </Button>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function StatCard({ icon, label, value, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={"text-lg font-bold " + (accent ? "text-emerald-600 dark:text-emerald-400" : "")}>{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
