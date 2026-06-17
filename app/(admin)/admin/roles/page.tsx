"use client"

import { useEffect, useState } from "react"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell,
} from "@/components/ui/data-table"
import { Loader2, ShieldCheck, Users, Lock, Pencil, Shield, Eye, Briefcase, Handshake } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { AccessLevel, RolePermissions } from "@/app/api/admin/roles/route"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Feature {
  id: string
  label: string
  group: string
}

interface RoleData {
  id: string
  label: string
  description: string
  isPlatform: boolean
  isLocked: boolean
  isPartner?: boolean
  isManager?: boolean
  userCount: number
  permissions: RolePermissions
}

interface ManagerRate {
  role: string
  salePercent: string
  accompanimentPercent: string
}

interface ApiResponse {
  roles: RoleData[]
  features: Feature[]
  managerRates: ManagerRate[]
}

// ─── Access level config ──────────────────────────────────────────────────────

const LEVELS: { value: AccessLevel; label: string; cls: string }[] = [
  { value: "full", label: "Полный",   cls: "text-emerald-700 dark:text-emerald-400" },
  { value: "view", label: "Просмотр", cls: "text-blue-700 dark:text-blue-400" },
  { value: "none", label: "Нет",      cls: "text-muted-foreground" },
]

function AccessBadge({ level }: { level: AccessLevel }) {
  const cfg = LEVELS.find(l => l.value === level)!
  return <span className={cn("text-xs font-medium", cfg.cls)}>{cfg.label}</span>
}

// ─── Permission matrix dialog ─────────────────────────────────────────────────

function MatrixDialog({
  role,
  features,
  open,
  onClose,
  onSaved,
}: {
  role: RoleData
  features: Feature[]
  open: boolean
  onClose: () => void
  onSaved: (roleId: string, perms: RolePermissions) => void
}) {
  const [perms, setPerms] = useState<RolePermissions>({ ...role.permissions })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPerms({ ...role.permissions })
  }, [role])

  const groups = Array.from(new Set(features.map(f => f.group)))

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: role.id, permissions: perms }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? "Ошибка сохранения")
        return
      }
      onSaved(role.id, perms)
      toast.success("Права обновлены")
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Права роли: {role.label}
          </DialogTitle>
        </DialogHeader>

        {role.isLocked && (
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 shrink-0" />
            Права этой роли зафиксированы и не могут быть изменены
          </div>
        )}

        <div className="space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group}
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 w-1/2">
                        Функция
                      </th>
                      {LEVELS.map(l => (
                        <th key={l.value} className={cn("text-xs font-medium uppercase tracking-wider px-4 py-3 text-center w-[18%]", l.cls)}>
                          {l.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {features.filter(f => f.group === group).map((feature, i) => (
                      <tr key={feature.id} className={i % 2 === 1 ? "bg-muted/10" : ""}>
                        <td className="px-3 py-2.5 text-foreground">{feature.label}</td>
                        {LEVELS.map(l => (
                          <td key={l.value} className="px-3 py-2.5 text-center">
                            <input
                              type="radio"
                              name={`${role.id}-${feature.id}`}
                              value={l.value}
                              checked={perms[feature.id] === l.value}
                              disabled={role.isLocked}
                              onChange={() => setPerms(p => ({ ...p, [feature.id]: l.value }))}
                              className="accent-primary cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          {!role.isLocked && (
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Сохранить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Права-превью для клиентских ролей ───────────────────────────────────────

function PermissionsPreview({ role, features }: { role: RoleData; features: Feature[] }) {
  const preview = features.slice(0, 3)
  const rest = features.length - 3
  return (
    <div className="space-y-0.5">
      {preview.map(f => (
        <div key={f.id} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground truncate max-w-[160px]">{f.label}</span>
          <span className="shrink-0">—</span>
          <AccessBadge level={role.permissions[f.id] ?? "none"} />
        </div>
      ))}
      {rest > 0 && (
        <p className="text-[10px] text-muted-foreground/60 pt-0.5">+{rest} функций…</p>
      )}
    </div>
  )
}

// ─── Группа ролей (подзаголовок + таблица) ───────────────────────────────────

function RoleGroupSection({
  title,
  badge,
  roles,
  features,
  onEdit,
}: {
  title: string
  badge?: React.ReactNode
  roles: RoleData[]
  features: Feature[]
  onEdit: (role: RoleData) => void
}) {
  if (roles.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {badge}
      </div>
      <TableCard>
        <DataTable>
          <DataHead>
            <DataHeadCell>Роль</DataHeadCell>
            <DataHeadCell>Пользователей</DataHeadCell>
            <DataHeadCell>Права / Описание</DataHeadCell>
            <DataHeadCell align="right" width="160px" />
          </DataHead>
          <tbody>
            {roles.map(role => (
              <DataRow key={role.id}>
                {/* Роль */}
                <DataCell>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      {role.isPlatform ? (
                        <Shield className="w-3.5 h-3.5 text-primary" />
                      ) : role.isPartner ? (
                        <Handshake className="w-3.5 h-3.5 text-primary" />
                      ) : role.isManager ? (
                        <Briefcase className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm leading-tight">{role.label}</p>
                      {role.isLocked && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Lock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Зафиксировано</span>
                        </div>
                      )}
                    </div>
                  </div>
                </DataCell>

                {/* Пользователей */}
                <DataCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    {role.userCount}
                  </div>
                </DataCell>

                {/* Права / Описание */}
                <DataCell>
                  {(role.isPartner || role.isManager) ? (
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                      {role.description}
                    </p>
                  ) : (
                    <PermissionsPreview role={role} features={features} />
                  )}
                </DataCell>

                {/* Действие */}
                <DataCell align="right">
                  {!role.isPartner && !role.isManager && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => onEdit(role)}
                    >
                      {role.isLocked ? (
                        <><Eye className="w-3.5 h-3.5" />Просмотреть</>
                      ) : (
                        <><Pencil className="w-3.5 h-3.5" />Редактировать</>
                      )}
                    </Button>
                  )}
                </DataCell>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
    </section>
  )
}

// ─── Секция «Менеджеры и комиссии» ───────────────────────────────────────────

function ManagerRatesSection({ rates }: { rates: ManagerRate[] }) {
  const ROLE_LABELS: Record<string, string> = {
    sales_manager: "Менеджер продаж",
    account_manager: "Клиентский менеджер",
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Менеджеры и комиссии
        </h2>
      </div>
      <TableCard>
        <DataTable>
          <DataHead>
            <DataHeadCell>Роль</DataHeadCell>
            <DataHeadCell align="center">% при продаже</DataHeadCell>
            <DataHeadCell align="center">% сопровождения</DataHeadCell>
          </DataHead>
          <tbody>
            {rates.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-8 text-sm text-muted-foreground">
                  Ставки не настроены (миграция 0218 ещё не применена)
                </td>
              </tr>
            ) : rates.map(r => (
              <DataRow key={r.role}>
                <DataCell>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="font-medium text-sm">
                      {ROLE_LABELS[r.role] ?? r.role}
                    </span>
                  </div>
                </DataCell>
                <DataCell align="center">
                  <span className="text-sm font-medium">{r.salePercent}%</span>
                </DataCell>
                <DataCell align="center">
                  <span className="text-sm font-medium">{r.accompanimentPercent}%</span>
                </DataCell>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
      <p className="text-xs text-muted-foreground mt-2 px-1">
        Ставки настраиваются — редактор появится в этом разделе
      </p>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminRolesPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingRole, setEditingRole] = useState<RoleData | null>(null)

  useEffect(() => {
    fetch("/api/admin/roles")
      .then(r => r.json())
      .then((d: { data?: ApiResponse } | ApiResponse) => {
        setData((d as { data?: ApiResponse }).data ?? (d as ApiResponse))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function handleSaved(roleId: string, perms: RolePermissions) {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        roles: prev.roles.map(r =>
          r.id === roleId ? { ...r, permissions: perms } : r
        ),
      }
    })
  }

  const platformRoles = data?.roles.filter(r => r.isPlatform) ?? []
  const clientRoles   = data?.roles.filter(r => !r.isPlatform && !r.isPartner && !r.isManager) ?? []
  const partnerRoles  = data?.roles.filter(r => r.isPartner) ?? []
  const managerRoles  = data?.roles.filter(r => r.isManager) ?? []

  return (
    <AdminPageLayout>
      <div className="py-6 space-y-8 px-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 pt-3 pb-2">
            <Shield className="h-5 w-5 text-violet-600" />
            <h1 className="text-lg font-semibold">Роли и доступ</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Управление правами доступа по ролям для всех пользователей платформы
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <RoleGroupSection
              title="Платформенные роли"
              badge={
                <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 dark:text-violet-400">
                  Скрыты от клиентов
                </Badge>
              }
              roles={platformRoles}
              features={data?.features ?? []}
              onEdit={setEditingRole}
            />

            <RoleGroupSection
              title="Клиентские роли"
              roles={clientRoles}
              features={data?.features ?? []}
              onEdit={setEditingRole}
            />

            <RoleGroupSection
              title="Партнёрские роли"
              badge={
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">
                  Кабинет /partner
                </Badge>
              }
              roles={partnerRoles}
              features={data?.features ?? []}
              onEdit={setEditingRole}
            />

            <RoleGroupSection
              title="Менеджеры платформы"
              badge={
                <Badge variant="outline" className="text-[10px] border-sky-300 text-sky-700 dark:text-sky-400">
                  Комиссионные
                </Badge>
              }
              roles={managerRoles}
              features={data?.features ?? []}
              onEdit={setEditingRole}
            />

            <ManagerRatesSection rates={data?.managerRates ?? []} />
          </>
        )}
      </div>

      {editingRole && (
        <MatrixDialog
          role={editingRole}
          features={data?.features ?? []}
          open={!!editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={handleSaved}
        />
      )}
    </AdminPageLayout>
  )
}
