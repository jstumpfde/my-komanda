"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from "@/components/ui/sheet"
import { toast } from "sonner"
import { Link2, Plus, Loader2, Copy, Check, ToggleLeft, ToggleRight, Trash2, Tag } from "lucide-react"
import { ACCESS_TYPE_OPTIONS, ACCESS_TYPE_LABELS } from "@/components/admin/clients/shared"
import { PARTNER_ACCESS_TYPES } from "@/lib/admin/access-types"
import { PARTNER_KIND_LABELS, PARTNER_KIND_OPTIONS } from "@/lib/partner-kinds"

// ─── Типы ────────────────────────────────────────────────────────────────────

interface InviteRow {
  id: string
  token: string
  role: string
  kind: string | null
  label: string | null
  maxUses: number
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  createdAt: string
  creatorEmail: string | null
}

interface PromoRow {
  id: string
  code: string
  kind: string
  value: string
  maxUses: number
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

// ─── Хелперы ─────────────────────────────────────────────────────────────────

const PROMO_KIND_LABELS: Record<string, string> = {
  discount_percent: "Скидка %",
  trial_days:       "Пробный период (дней)",
  plan:             "Тариф",
}

function formatDate(s: string | null): string {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("ru-RU")
}

function usesLabel(used: number, max: number): string {
  if (max === 0) return `${used} / ∞`
  return `${used} / ${max}`
}

function roleLabel(role: string, kind: string | null): string {
  if (kind && PARTNER_KIND_LABELS[kind as keyof typeof PARTNER_KIND_LABELS]) {
    return PARTNER_KIND_LABELS[kind as keyof typeof PARTNER_KIND_LABELS]
  }
  return ACCESS_TYPE_LABELS[role] ?? role
}

// ─── Компонент страницы ───────────────────────────────────────────────────────

export default function AdminInvitesPage() {
  // — Ссылки-приглашения —
  const [invites, setInvites]           = useState<InviteRow[]>([])
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [inviteSheet, setInviteSheet]   = useState(false)
  const [savingInvite, setSavingInvite] = useState(false)
  const [copiedId, setCopiedId]         = useState<string | null>(null)

  const [iRole, setIRole]         = useState("")
  const [iKind, setIKind]         = useState("")
  const [iLabel, setILabel]       = useState("")
  const [iMaxUses, setIMaxUses]   = useState("")
  const [iExpires, setIExpires]   = useState("")

  // — Промокоды —
  const [promos, setPromos]             = useState<PromoRow[]>([])
  const [loadingPromos, setLoadingPromos] = useState(true)
  const [promoSheet, setPromoSheet]     = useState(false)
  const [savingPromo, setSavingPromo]   = useState(false)

  const [pCode, setPCode]         = useState("")
  const [pKind, setPKind]         = useState("discount_percent")
  const [pValue, setPValue]       = useState("")
  const [pMaxUses, setPMaxUses]   = useState("")
  const [pExpires, setPExpires]   = useState("")

  // ─── Загрузка данных ────────────────────────────────────────────────────────

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true)
    try {
      const res = await fetch("/api/admin/invites")
      const data = await res.json()
      setInvites(data.invites ?? [])
    } catch {
      toast.error("Ошибка загрузки ссылок")
    } finally {
      setLoadingInvites(false)
    }
  }, [])

  const loadPromos = useCallback(async () => {
    setLoadingPromos(true)
    try {
      const res = await fetch("/api/admin/promo-codes")
      const data = await res.json()
      setPromos(data.promoCodes ?? [])
    } catch {
      toast.error("Ошибка загрузки промокодов")
    } finally {
      setLoadingPromos(false)
    }
  }, [])

  useEffect(() => { loadInvites() }, [loadInvites])
  useEffect(() => { loadPromos() }, [loadPromos])

  // ─── Origin для ссылок ─────────────────────────────────────────────────────
  const [origin, setOrigin] = useState("")
  useEffect(() => { setOrigin(window.location.origin) }, [])

  // ─── Создание ссылки ────────────────────────────────────────────────────────

  function resetInviteForm() {
    setIRole(""); setIKind(""); setILabel(""); setIMaxUses(""); setIExpires("")
  }

  async function handleCreateInvite() {
    if (!iRole) { toast.error("Выберите роль"); return }
    if ((PARTNER_ACCESS_TYPES as string[]).includes(iRole) && !iKind) {
      toast.error("Для партнёрской роли выберите вид")
      return
    }
    setSavingInvite(true)
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role:     iRole,
          kind:     iKind || undefined,
          label:    iLabel.trim() || undefined,
          maxUses:  iMaxUses ? parseInt(iMaxUses, 10) : 0,
          expiresAt: iExpires || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка"); return }
      toast.success("Ссылка создана")
      setInviteSheet(false)
      resetInviteForm()
      loadInvites()
    } catch {
      toast.error("Ошибка создания ссылки")
    } finally {
      setSavingInvite(false)
    }
  }

  // ─── Копирование ссылки ─────────────────────────────────────────────────────

  async function copyLink(invite: InviteRow) {
    const url = `${origin}/invite/${invite.token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(invite.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ─── Переключение isActive ──────────────────────────────────────────────────

  async function toggleInvite(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/invites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
    if (!res.ok) { toast.error("Ошибка"); return }
    toast.success(isActive ? "Ссылка деактивирована" : "Ссылка активирована")
    loadInvites()
  }

  async function deleteInvite(id: string) {
    if (!confirm("Удалить ссылку-приглашение?")) return
    const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Ошибка"); return }
    toast.success("Ссылка удалена")
    loadInvites()
  }

  // ─── Создание промокода ─────────────────────────────────────────────────────

  function resetPromoForm() {
    setPCode(""); setPKind("discount_percent"); setPValue(""); setPMaxUses(""); setPExpires("")
  }

  async function handleCreatePromo() {
    if (!pCode.trim()) { toast.error("Введите промокод"); return }
    if (!pValue.trim()) { toast.error("Введите значение"); return }
    setSavingPromo(true)
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code:     pCode,
          kind:     pKind,
          value:    pValue.trim(),
          maxUses:  pMaxUses ? parseInt(pMaxUses, 10) : 0,
          expiresAt: pExpires || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка"); return }
      toast.success("Промокод создан")
      setPromoSheet(false)
      resetPromoForm()
      loadPromos()
    } catch {
      toast.error("Ошибка создания промокода")
    } finally {
      setSavingPromo(false)
    }
  }

  async function togglePromo(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/promo-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
    if (!res.ok) { toast.error("Ошибка"); return }
    toast.success(isActive ? "Промокод деактивирован" : "Промокод активирован")
    loadPromos()
  }

  async function deletePromo(id: string) {
    if (!confirm("Удалить промокод?")) return
    const res = await fetch(`/api/admin/promo-codes/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Ошибка"); return }
    toast.success("Промокод удалён")
    loadPromos()
  }

  // ─── Рендер ─────────────────────────────────────────────────────────────────

  const isPartnerRole = (PARTNER_ACCESS_TYPES as string[]).includes(iRole)

  return (
    <AdminPageLayout>
      <div className="p-6 space-y-8 max-w-6xl">

        {/* Заголовок */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Приглашения и промокоды</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Погашение ссылок и применение промокодов при регистрации — на подключении (v2)
          </p>
        </div>

        {/* ── Секция 1: Ссылки-приглашения ──────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="size-5 text-primary" />
              <h2 className="text-lg font-medium">Ссылки-приглашения</h2>
            </div>
            <Button size="sm" onClick={() => setInviteSheet(true)}>
              <Plus className="size-4 mr-1" /> Создать ссылку
            </Button>
          </div>

          <TableCard>
            {loadingInvites ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Загрузка...
              </div>
            ) : invites.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Ссылок пока нет</div>
            ) : (
              <DataTable>
                <DataHead>
                  <DataHeadCell>Лейбл / Роль</DataHeadCell>
                  <DataHeadCell>Ссылка</DataHeadCell>
                  <DataHeadCell>Использования</DataHeadCell>
                  <DataHeadCell>Истекает</DataHeadCell>
                  <DataHeadCell>Статус</DataHeadCell>
                  <DataHeadCell className="w-28">Действия</DataHeadCell>
                </DataHead>
                <tbody>
                  {invites.map((inv) => (
                    <DataRow key={inv.id}>
                      <DataCell>
                        <div className="font-medium">{inv.label ?? roleLabel(inv.role, inv.kind)}</div>
                        {inv.label && (
                          <div className="text-xs text-muted-foreground">
                            {roleLabel(inv.role, inv.kind)}
                          </div>
                        )}
                      </DataCell>
                      <DataCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[220px]">
                            {origin}/invite/{inv.token}
                          </span>
                          <Button
                            variant="ghost" size="icon"
                            className="size-7 shrink-0"
                            onClick={() => copyLink(inv)}
                            title="Копировать ссылку"
                          >
                            {copiedId === inv.id
                              ? <Check className="size-3.5 text-emerald-600" />
                              : <Copy className="size-3.5" />
                            }
                          </Button>
                        </div>
                      </DataCell>
                      <DataCell>{usesLabel(inv.usedCount, inv.maxUses)}</DataCell>
                      <DataCell>{formatDate(inv.expiresAt)}</DataCell>
                      <DataCell>
                        {inv.isActive
                          ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Активна</Badge>
                          : <Badge variant="outline" className="bg-gray-100 text-gray-500">Отключена</Badge>
                        }
                      </DataCell>
                      <DataCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="size-7"
                            onClick={() => toggleInvite(inv.id, inv.isActive)}
                            title={inv.isActive ? "Деактивировать" : "Активировать"}
                          >
                            {inv.isActive
                              ? <ToggleRight className="size-4 text-emerald-600" />
                              : <ToggleLeft className="size-4 text-gray-400" />
                            }
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                            onClick={() => deleteInvite(inv.id)}
                            title="Удалить"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </DataCell>
                    </DataRow>
                  ))}
                </tbody>
              </DataTable>
            )}
          </TableCard>
        </section>

        {/* ── Секция 2: Промокоды ───────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="size-5 text-primary" />
              <h2 className="text-lg font-medium">Промокоды</h2>
            </div>
            <Button size="sm" onClick={() => setPromoSheet(true)}>
              <Plus className="size-4 mr-1" /> Создать промокод
            </Button>
          </div>

          <TableCard>
            {loadingPromos ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Загрузка...
              </div>
            ) : promos.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Промокодов пока нет</div>
            ) : (
              <DataTable>
                <DataHead>
                  <DataHeadCell>Код</DataHeadCell>
                  <DataHeadCell>Тип</DataHeadCell>
                  <DataHeadCell>Значение</DataHeadCell>
                  <DataHeadCell>Использования</DataHeadCell>
                  <DataHeadCell>Истекает</DataHeadCell>
                  <DataHeadCell>Статус</DataHeadCell>
                  <DataHeadCell className="w-28">Действия</DataHeadCell>
                </DataHead>
                <tbody>
                  {promos.map((promo) => (
                    <DataRow key={promo.id}>
                      <DataCell>
                        <span className="font-mono font-semibold text-sm">{promo.code}</span>
                      </DataCell>
                      <DataCell>{PROMO_KIND_LABELS[promo.kind] ?? promo.kind}</DataCell>
                      <DataCell>
                        {promo.kind === "discount_percent" && `${promo.value}%`}
                        {promo.kind === "trial_days"       && `${promo.value} дн.`}
                        {promo.kind === "plan"             && promo.value}
                      </DataCell>
                      <DataCell>{usesLabel(promo.usedCount, promo.maxUses)}</DataCell>
                      <DataCell>{formatDate(promo.expiresAt)}</DataCell>
                      <DataCell>
                        {promo.isActive
                          ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Активен</Badge>
                          : <Badge variant="outline" className="bg-gray-100 text-gray-500">Отключён</Badge>
                        }
                      </DataCell>
                      <DataCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="size-7"
                            onClick={() => togglePromo(promo.id, promo.isActive)}
                            title={promo.isActive ? "Деактивировать" : "Активировать"}
                          >
                            {promo.isActive
                              ? <ToggleRight className="size-4 text-emerald-600" />
                              : <ToggleLeft className="size-4 text-gray-400" />
                            }
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                            onClick={() => deletePromo(promo.id)}
                            title="Удалить"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </DataCell>
                    </DataRow>
                  ))}
                </tbody>
              </DataTable>
            )}
          </TableCard>
        </section>
      </div>

      {/* ── Sheet: создание ссылки ─────────────────────────────────────────── */}
      <Sheet open={inviteSheet} onOpenChange={(o) => { setInviteSheet(o); if (!o) resetInviteForm() }}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>Создать ссылку-приглашение</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-5 mt-4">

            <div className="space-y-1.5">
              <Label>Роль <span className="text-destructive">*</span></Label>
              <Select value={iRole} onValueChange={(v) => { setIRole(v); setIKind("") }}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Клиентские роли</div>
                  {ACCESS_TYPE_OPTIONS.filter(o => o.group === "client").map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">Партнёры</div>
                  {ACCESS_TYPE_OPTIONS.filter(o => o.group === "partner").map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isPartnerRole && (
              <div className="space-y-1.5">
                <Label>Вид партнёра <span className="text-destructive">*</span></Label>
                <Select value={iKind} onValueChange={setIKind}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите вид" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTNER_KIND_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <div>
                          <div>{o.label}</div>
                          <div className="text-xs text-muted-foreground">{o.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Название ссылки (необязательно)</Label>
              <Input
                placeholder="Например: Партнёры из Телеграм"
                value={iLabel}
                onChange={e => setILabel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Отображается только в этой таблице</p>
            </div>

            <div className="space-y-1.5">
              <Label>Лимит использований</Label>
              <Input
                type="number" min="0" placeholder="0 = безлимит"
                value={iMaxUses}
                onChange={e => setIMaxUses(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Срок действия (до)</Label>
              <Input
                type="date"
                value={iExpires}
                onChange={e => setIExpires(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Оставьте пустым — ссылка бессрочная</p>
            </div>

            <Button className="w-full" onClick={handleCreateInvite} disabled={savingInvite}>
              {savingInvite ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Создать ссылку
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* ── Sheet: создание промокода ──────────────────────────────────────── */}
      <Sheet open={promoSheet} onOpenChange={(o) => { setPromoSheet(o); if (!o) resetPromoForm() }}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>Создать промокод</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-5 mt-4">

            <div className="space-y-1.5">
              <Label>Код <span className="text-destructive">*</span></Label>
              <Input
                placeholder="SUMMER2026"
                value={pCode}
                onChange={e => setPCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-muted-foreground">Латиница, цифры, дефис, нижнее подчёркивание (2–32 символа)</p>
            </div>

            <div className="space-y-1.5">
              <Label>Тип скидки <span className="text-destructive">*</span></Label>
              <Select value={pKind} onValueChange={setPKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount_percent">Скидка %</SelectItem>
                  <SelectItem value="trial_days">Пробный период (дней)</SelectItem>
                  <SelectItem value="plan">Тариф (slug)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {pKind === "discount_percent" && "Процент скидки"}
                {pKind === "trial_days"       && "Количество дней"}
                {pKind === "plan"             && "Slug тарифа"}
                <span className="text-destructive"> *</span>
              </Label>
              <Input
                placeholder={
                  pKind === "discount_percent" ? "20" :
                  pKind === "trial_days"       ? "30" : "pro-monthly"
                }
                value={pValue}
                onChange={e => setPValue(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Лимит использований</Label>
              <Input
                type="number" min="0" placeholder="0 = безлимит"
                value={pMaxUses}
                onChange={e => setPMaxUses(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Срок действия (до)</Label>
              <Input
                type="date"
                value={pExpires}
                onChange={e => setPExpires(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Оставьте пустым — промокод бессрочный</p>
            </div>

            <Button className="w-full" onClick={handleCreatePromo} disabled={savingPromo}>
              {savingPromo ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Создать промокод
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </AdminPageLayout>
  )
}
