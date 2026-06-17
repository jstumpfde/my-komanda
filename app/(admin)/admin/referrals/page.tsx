"use client"

import { useState, useEffect } from "react"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from "@/components/ui/sheet"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { toast } from "sonner"
import { UserPlus, Plus, Loader2, ExternalLink, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { PARTNER_KIND_OPTIONS, partnerKindLabel } from "@/lib/partner-kinds"

// Только реферальная ветка (партнёры — на /admin/integrators)
const REFERRAL_KINDS_HERE = ["referral", "sub_referral"]
const REFERRAL_KIND_OPTIONS_HERE = PARTNER_KIND_OPTIONS.filter(o => REFERRAL_KINDS_HERE.includes(o.value))

interface Integrator {
  id: string
  companyName: string | null
  kind: string | null
  levelName: string | null
  status: string | null
  joinedAt: string | null
  contactName: string | null
  contactEmail: string | null
  companyId: string
}

const KIND_COLORS: Record<string, string> = {
  referral:     "bg-teal-100 text-teal-700 border-teal-200",
  sub_referral: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

const LEVEL_COLORS: Record<string, string> = {
  Bronze:   "bg-amber-100 text-amber-700 border-amber-200",
  Silver:   "bg-gray-100 text-gray-700 border-gray-200",
  Gold:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  Platinum: "bg-violet-100 text-violet-700 border-violet-200",
  VIP:      "bg-red-100 text-red-700 border-red-200",
}

const STATUS_LABELS: Record<string, string> = {
  active:     "Активен",
  suspended:  "Приостановлен",
  terminated: "Завершён",
}

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-700",
  suspended:  "bg-amber-100 text-amber-700",
  terminated: "bg-red-100 text-red-700",
}

export default function AdminReferralsPage() {
  const router = useRouter()
  const [referrals, setReferrals] = useState<Integrator[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCompanyId, setNewCompanyId] = useState("")
  const [newKind, setNewKind] = useState("referral")
  const [newPct, setNewPct] = useState("")
  const [newBilling, setNewBilling] = useState("platform")
  const [newContactName, setNewContactName] = useState("")
  const [newContactEmail, setNewContactEmail] = useState("")
  const [newContactPhone, setNewContactPhone] = useState("")

  useEffect(() => {
    fetch("/api/admin/integrators")
      .then(r => r.json())
      .then(data => {
        const all: Integrator[] = data.integrators ?? []
        // Показываем только реферальную ветку; партнёры — на /admin/integrators
        setReferrals(all.filter(x => REFERRAL_KINDS_HERE.includes(x.kind ?? "")))
      })
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!newCompanyId.trim()) { toast.error("Укажите ID компании"); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/integrators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId:    newCompanyId.trim(),
          kind:         newKind,
          commissionPercent: newPct,
          billingMode:  newBilling,
          contactName:  newContactName || undefined,
          contactEmail: newContactEmail || undefined,
          contactPhone: newContactPhone || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      const { integrator } = await res.json()
      toast.success("Реферал добавлен")
      setSheetOpen(false)
      setNewCompanyId(""); setNewContactName(""); setNewContactEmail(""); setNewContactPhone("")
      setReferrals(prev => [...prev, { ...integrator, companyName: null, levelName: null }])
    } catch {
      toast.error("Ошибка при создании")
    } finally {
      setCreating(false)
    }
  }

  // Изменить фикс-комиссию реферала. Пусто = по объёму продаж.
  const editCommission = async (integratorId: string) => {
    const v = window.prompt("Фикс-комиссия реферала, % (пусто = считать по объёму продаж):")
    if (v === null) return
    try {
      const res = await fetch(`/api/admin/integrators/${integratorId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPercent: v.trim() }),
      })
      if (res.ok) { toast.success("Комиссия обновлена"); setReferrals(prev => prev.map(x => x.id === integratorId ? { ...x } : x)) }
      else toast.error((await res.json().catch(() => ({}))).error || "Ошибка")
    } catch { toast.error("Ошибка сети") }
  }

  // Выдать пользователю реферальный доступ: роль 'partner' + привязка к компании-рефералу.
  const grantAccess = async (integratorId: string) => {
    const email = window.prompt("Email пользователя, которому выдать реферальный доступ к этому кабинету:")
    if (!email || !email.trim()) return
    try {
      const res = await fetch(`/api/admin/integrators/${integratorId}/grant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) toast.success("Пользователь теперь реферал — может войти в /partner")
      else toast.error((await res.json().catch(() => ({}))).error || "Ошибка")
    } catch { toast.error("Ошибка сети") }
  }

  return (
    <AdminPageLayout>
      <div className="py-6 px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 pt-3 pb-2">
              <UserPlus className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Рефералы</h1>
            </div>
            <p className="text-muted-foreground text-sm">Реферальная программа: Ген. Рефералы и Рефералы</p>
          </div>
          <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TableCard>
            <DataTable>
              <DataHead>
                <DataHeadCell>Компания</DataHeadCell>
                <DataHeadCell>Тип</DataHeadCell>
                <DataHeadCell>Уровень</DataHeadCell>
                <DataHeadCell>Контакт</DataHeadCell>
                <DataHeadCell align="center">Статус</DataHeadCell>
                <DataHeadCell>Дата вступления</DataHeadCell>
                <DataHeadCell align="right" />
              </DataHead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                      Нет рефералов
                    </td>
                  </tr>
                ) : referrals.map(ref => (
                  <DataRow
                    key={ref.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/integrators/${ref.id}`)}
                  >
                    <DataCell>
                      <span className="font-medium text-foreground">{ref.companyName || ref.companyId}</span>
                    </DataCell>
                    <DataCell>
                      <Badge className={cn("text-xs border", KIND_COLORS[ref.kind ?? "referral"] ?? "bg-muted text-muted-foreground")}>
                        {partnerKindLabel(ref.kind ?? "referral")}
                      </Badge>
                    </DataCell>
                    <DataCell>
                      {ref.levelName ? (
                        <Badge className={cn("text-xs border", LEVEL_COLORS[ref.levelName] ?? "bg-muted text-muted-foreground")}>
                          {ref.levelName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </DataCell>
                    <DataCell>
                      <div>
                        <p className="text-xs font-medium text-foreground">{ref.contactName || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{ref.contactEmail || ""}</p>
                      </div>
                    </DataCell>
                    <DataCell align="center">
                      <Badge className={cn("text-xs", STATUS_COLORS[ref.status ?? "active"] ?? "bg-muted")}>
                        {STATUS_LABELS[ref.status ?? "active"] ?? ref.status}
                      </Badge>
                    </DataCell>
                    <DataCell className="text-xs text-muted-foreground">
                      {ref.joinedAt ? new Date(ref.joinedAt).toLocaleDateString("ru-RU") : "—"}
                    </DataCell>
                    <DataCell align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" title="Изменить фикс-комиссию (пусто = по объёму)"
                          onClick={e => { e.stopPropagation(); void editCommission(ref.id) }}>
                          % комиссия
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" title="Выдать пользователю реферальный доступ"
                          onClick={e => { e.stopPropagation(); void grantAccess(ref.id) }}>
                          <Users className="w-3.5 h-3.5" />Доступ
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); router.push(`/admin/integrators/${ref.id}`) }}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </DataCell>
                  </DataRow>
                ))}
              </tbody>
            </DataTable>
          </TableCard>
        )}
      </div>

      {/* Sheet добавления */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Добавить реферала</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">ID компании *</Label>
              <Input value={newCompanyId} onChange={e => setNewCompanyId(e.target.value)} placeholder="uuid..." />
              <p className="text-[11px] text-muted-foreground">UUID компании из списка клиентов</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Тип</Label>
              <select value={newKind} onChange={e => setNewKind(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {REFERRAL_KIND_OPTIONS_HERE.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Комиссия % (фикс)</Label>
              <Input type="number" min={0} max={100} value={newPct} onChange={e => setNewPct(e.target.value)} placeholder="по объёму продаж" />
              <p className="text-[11px] text-muted-foreground">Пусто = ступени по обороту. Заполнить = фикс-% (напр. 10).</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Биллинг</Label>
              <select value={newBilling} onChange={e => setNewBilling(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="platform">Платформа биллит, рефералу %</option>
                <option value="partner">Реферал сам биллит, платит нам нетто</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Контактное имя</Label>
              <Input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Иван Петров" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="ivan@referral.ru" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Телефон</Label>
              <Input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="+7 999 123-45-67" />
            </div>
            <Button className="w-full gap-1.5" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? "Добавление..." : "Добавить"}
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </AdminPageLayout>
  )
}
