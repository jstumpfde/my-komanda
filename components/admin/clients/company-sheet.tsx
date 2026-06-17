"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Building2, Ban, Unlock, CalendarPlus, Trash2, ExternalLink, Loader2,
  Phone, Mail, Globe, ChevronLeft, ChevronRight, ShieldCheck, User as UserIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { formatPrice, formatDate, ROLE_LABELS } from "@/components/admin/clients/shared"
import { toast } from "sonner"

// Строка списка — то, что есть мгновенно (без доп. запроса), для шапки.
export interface CompanySheetRow {
  id: string
  name: string
  inn: string | null
  subscriptionStatus: string | null
  trialEndsAt: string | null
  planName: string | null
  planPrice: number | null
  mrr: number
  userCount: number
  directorEmail: string | null
}

// Полные реквизиты — догружаются из /api/admin/clients/[id].
interface CompanyDetail {
  id: string
  name: string
  fullName: string | null
  brandName: string | null
  inn: string | null
  kpp: string | null
  ogrn: string | null
  legalAddress: string | null
  officeAddress: string | null
  postalAddress: string | null
  postalCode: string | null
  city: string | null
  industry: string | null
  director: string | null
  email: string | null
  phone: string | null
  website: string | null
  billingEmail: string | null
  subscriptionStatus: string | null
  trialEndsAt: string | null
}

interface CompanyUser {
  id: string
  name: string | null
  email: string
  role: string
  position: string | null
  isActive: boolean | null
  telegramChatId: string | null
  createdAt: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активен",  color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  trial:     { label: "Пробный",  color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  expired:   { label: "Истёк",    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  overdue:   { label: "Просрочен",color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  cancelled: { label: "Отменён",  color: "bg-muted text-muted-foreground border-border" },
  paused:    { label: "Пауза",    color: "bg-muted text-muted-foreground border-border" },
}

// Короткая форма названия: бренд → или схлопнутая орг.-форма (ИП/ООО/АО/…).
function shortCompanyName(detail: CompanyDetail | null, fallback: string): string {
  if (detail?.brandName?.trim()) return detail.brandName.trim()
  const src = (detail?.name ?? fallback) || ""
  return src
    .replace(/^Индивидуальный предприниматель\s+/i, "ИП ")
    .replace(/^Общество с ограниченной ответственностью\s+/i, "ООО ")
    .replace(/^Публичное акционерное общество\s+/i, "ПАО ")
    .replace(/^Закрытое акционерное общество\s+/i, "ЗАО ")
    .replace(/^Акционерное общество\s+/i, "АО ")
    .trim()
}

// Строка реквизита: показываем только если есть значение.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-foreground text-right break-words min-w-0">{children}</dd>
    </div>
  )
}

export function CompanySheet({
  client,
  open,
  onOpenChange,
  onChanged,
}: {
  client: CompanySheetRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | "block" | "extend" | "trash">(null)
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  // Под-панель пользователя (null = показываем компанию).
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null)
  const [userBusy, setUserBusy] = useState(false)

  const loadDetail = useCallback(async (companyId: string) => {
    setLoadingDetail(true)
    try {
      const [dRes, uRes] = await Promise.all([
        fetch(`/api/admin/clients/${companyId}`),
        fetch(`/api/admin/clients/${companyId}/users`),
      ])
      if (dRes.ok) setDetail(await dRes.json())
      if (uRes.ok) setUsers(await uRes.json())
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (open && client) {
      setDetail(null); setUsers([]); setSelectedUser(null)
      loadDetail(client.id)
    }
  }, [open, client, loadDetail])

  if (!client) return null

  const status = detail?.subscriptionStatus ?? client.subscriptionStatus
  const isBlocked = status === "paused"
  const isTrial = status === "trial"
  const statusCfg = STATUS_CONFIG[status ?? ""] ?? { label: status ?? "—", color: "" }
  const title = selectedUser
    ? (selectedUser.name ?? selectedUser.email)
    : shortCompanyName(detail, client.name)

  async function patchStatus(next: "paused" | "active") {
    setBusy("block")
    try {
      const res = await fetch(`/api/admin/clients/${client!.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: next }),
      })
      if (res.ok) { onChanged(); loadDetail(client!.id) }
    } finally { setBusy(null) }
  }

  async function extendTrial() {
    setBusy("extend")
    try {
      const base = (detail?.trialEndsAt ?? client!.trialEndsAt) ? new Date(detail?.trialEndsAt ?? client!.trialEndsAt!) : new Date()
      const newDate = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000)
      const res = await fetch(`/api/admin/clients/${client!.id}/subscription`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialEndsAt: newDate.toISOString() }),
      })
      if (res.ok) { onChanged(); loadDetail(client!.id) }
    } finally { setBusy(null) }
  }

  async function trash() {
    if (!confirm(`Переместить «${title}» в корзину?`)) return
    setBusy("trash")
    try {
      const res = await fetch(`/api/admin/clients/${client!.id}`, { method: "DELETE" })
      if (res.ok) { onChanged(); onOpenChange(false) }
    } finally { setBusy(null) }
  }

  async function toggleUserActive(u: CompanyUser) {
    setUserBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !(u.isActive ?? true) }),
      })
      if (res.ok) {
        toast.success(u.isActive ? "Пользователь заблокирован" : "Пользователь разблокирован")
        const updated = { ...u, isActive: !(u.isActive ?? true) }
        setSelectedUser(updated)
        setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось обновить")
      }
    } catch { toast.error("Ошибка сети") } finally { setUserBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-6">
            {selectedUser
              ? <UserIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              : <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />}
            <span className="break-words">{title}</span>
          </SheetTitle>
        </SheetHeader>

        {selectedUser ? (
          // ── Под-панель пользователя ──────────────────────────────────────
          <SheetBody className="space-y-5">
            <button onClick={() => setSelectedUser(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />Назад к компании
            </button>
            <dl className="divide-y divide-border/60">
              <Field label="Имя">{selectedUser.name ?? "—"}</Field>
              <Field label="Email"><a href={`mailto:${selectedUser.email}`} className="text-primary hover:underline">{selectedUser.email}</a></Field>
              <Field label="Роль"><Badge variant="outline" className="text-xs gap-1"><ShieldCheck className="h-3 w-3" />{ROLE_LABELS[selectedUser.role] ?? selectedUser.role}</Badge></Field>
              <Field label="Должность">{selectedUser.position ?? "—"}</Field>
              <Field label="Статус">
                <Badge variant="outline" className={cn("text-xs", (selectedUser.isActive ?? true) ? STATUS_CONFIG.active.color : STATUS_CONFIG.paused.color)}>
                  {(selectedUser.isActive ?? true) ? "Активен" : "Заблокирован"}
                </Badge>
              </Field>
              <Field label="Telegram">{selectedUser.telegramChatId ?? "—"}</Field>
              <Field label="Создан">{formatDate(selectedUser.createdAt)}</Field>
            </dl>
            <div className="space-y-2">
              <Button
                className={cn("w-full justify-start gap-2", (selectedUser.isActive ?? true) && "text-destructive hover:text-destructive")}
                variant="outline" disabled={userBusy} onClick={() => toggleUserActive(selectedUser)}
              >
                {userBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : (selectedUser.isActive ?? true) ? <Ban className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                {(selectedUser.isActive ?? true) ? "Заблокировать" : "Разблокировать"}
              </Button>
            </div>
          </SheetBody>
        ) : (
          // ── Карточка компании ────────────────────────────────────────────
          <SheetBody className="space-y-5">
            {/* Подписка / тариф */}
            <dl className="divide-y divide-border/60">
              <Field label="Статус"><Badge variant="outline" className={cn("text-xs", statusCfg.color)}>{statusCfg.label}</Badge></Field>
              <Field label="Тариф">
                {client.planName
                  ? <span>{client.planName}{client.planPrice != null && <span className="text-muted-foreground"> · {formatPrice(client.planPrice)}</span>}</span>
                  : "—"}
              </Field>
              <Field label="MRR">{client.mrr > 0 ? formatPrice(client.mrr) : "—"}</Field>
              {isTrial && <Field label="Триал до">{formatDate(detail?.trialEndsAt ?? client.trialEndsAt)}</Field>}
            </dl>

            {/* Реквизиты */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Реквизиты</div>
              <dl className="divide-y divide-border/60">
                <Field label="Полное наименование">{detail?.fullName}</Field>
                <Field label="ИНН">{detail?.inn ?? client.inn}</Field>
                <Field label="КПП">{detail?.kpp}</Field>
                <Field label="ОГРН">{detail?.ogrn}</Field>
                <Field label="Директор">{detail?.director}</Field>
                <Field label="Город">{detail?.city}</Field>
                <Field label="Юр. адрес">{detail?.legalAddress}</Field>
                <Field label="Факт. адрес">{detail?.officeAddress}</Field>
                <Field label="Почт. адрес">{detail?.postalAddress}</Field>
                <Field label="Индекс">{detail?.postalCode}</Field>
                <Field label="Отрасль">{detail?.industry}</Field>
                {loadingDetail && !detail && (
                  <div className="py-2 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загрузка реквизитов…</div>
                )}
              </dl>
            </div>

            {/* Контакты (кликабельные — звонок/письмо/сайт) */}
            {(detail?.phone || detail?.email || detail?.billingEmail || detail?.website || client.directorEmail) && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Контакты</div>
                <div className="space-y-1.5">
                  {detail?.phone && (
                    <a href={`tel:${detail.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Phone className="h-3.5 w-3.5 shrink-0" />{detail.phone}
                    </a>
                  )}
                  {(detail?.email || client.directorEmail) && (
                    <a href={`mailto:${detail?.email ?? client.directorEmail}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Mail className="h-3.5 w-3.5 shrink-0" />{detail?.email ?? client.directorEmail}
                    </a>
                  )}
                  {detail?.billingEmail && detail.billingEmail !== detail.email && (
                    <a href={`mailto:${detail.billingEmail}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Mail className="h-3.5 w-3.5 shrink-0" />{detail.billingEmail} <span className="text-muted-foreground">(биллинг)</span>
                    </a>
                  )}
                  {detail?.website && (
                    <a href={detail.website.startsWith("http") ? detail.website : `https://${detail.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Globe className="h-3.5 w-3.5 shrink-0" />{detail.website}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Пользователи (клик → под-панель) */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                Пользователи {users.length > 0 && <span className="tabular-nums">· {users.length}</span>}
              </div>
              {loadingDetail && users.length === 0 ? (
                <div className="py-2 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Загрузка…</div>
              ) : users.length === 0 ? (
                <div className="text-sm text-muted-foreground">—</div>
              ) : (
                <div className="rounded-md border border-border divide-y divide-border/60">
                  {users.map(u => (
                    <button key={u.id} onClick={() => setSelectedUser(u)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors">
                      <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate">{u.name ?? u.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{ROLE_LABELS[u.role] ?? u.role}{(u.isActive ?? true) ? "" : " · заблокирован"}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Действия над компанией */}
            <div className="space-y-2 pt-1">
              <Button className="w-full justify-start gap-2" variant="outline" onClick={() => router.push(`/admin/clients/${client.id}`)}>
                <ExternalLink className="h-4 w-4" />Открыть полную карточку
              </Button>
              {isTrial && (
                <Button className="w-full justify-start gap-2" variant="outline" disabled={busy === "extend"} onClick={extendTrial}>
                  {busy === "extend" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}Продлить trial на 14 дней
                </Button>
              )}
              <Button className={cn("w-full justify-start gap-2", !isBlocked && "text-destructive hover:text-destructive")} variant="outline" disabled={busy === "block"} onClick={() => patchStatus(isBlocked ? "active" : "paused")}>
                {busy === "block" ? <Loader2 className="h-4 w-4 animate-spin" /> : isBlocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {isBlocked ? "Разблокировать" : "Заблокировать"}
              </Button>
              <Button className="w-full justify-start gap-2 text-destructive hover:text-destructive" variant="outline" disabled={busy === "trash"} onClick={trash}>
                {busy === "trash" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}В корзину
              </Button>
            </div>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  )
}
