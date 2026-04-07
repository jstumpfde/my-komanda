"use client"

import { useEffect, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Loader2, ShieldCheck, Users, Lock, Pencil } from "lucide-react"
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
  userCount: number
  permissions: RolePermissions
}

interface ApiResponse {
  roles: RoleData[]
  features: Feature[]
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

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  features,
  onEdit,
}: {
  role: RoleData
  features: Feature[]
  onEdit: () => void
}) {
  // Show top-3 permissions as a preview
  const preview = features.slice(0, 3)

  return (
    <Card className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{role.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {role.isPlatform && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-700 dark:text-violet-400">
                    Платформа
                  </Badge>
                )}
                {role.isLocked && (
                  <Lock className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Users className="w-3.5 h-3.5" />
            {role.userCount}
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
          {role.description}
        </p>

        <div className="space-y-1 border-t pt-3">
          {preview.map(f => (
            <div key={f.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate mr-2">{f.label}</span>
              <AccessBadge level={role.permissions[f.id] ?? "none"} />
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/60 pt-0.5">
            +{features.length - 3} функций…
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 mt-auto"
          onClick={onEdit}
        >
          <Pencil className="w-3.5 h-3.5" />
          {role.isLocked ? "Просмотреть права" : "Редактировать"}
        </Button>
      </CardContent>
    </Card>
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
  const clientRoles = data?.roles.filter(r => !r.isPlatform) ?? []

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />

        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl space-y-8">

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Роли и доступ</h1>
                <p className="text-sm text-muted-foreground">
                  Управление правами доступа по ролям для всех пользователей платформы
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Platform roles */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Платформенные роли
                    </h2>
                    <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 dark:text-violet-400">
                      Скрыты от клиентов
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {platformRoles.map(role => (
                      <RoleCard
                        key={role.id}
                        role={role}
                        features={data?.features ?? []}
                        onEdit={() => setEditingRole(role)}
                      />
                    ))}
                  </div>
                </section>

                {/* Client roles */}
                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    Клиентские роли
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clientRoles.map(role => (
                      <RoleCard
                        key={role.id}
                        role={role}
                        features={data?.features ?? []}
                        onEdit={() => setEditingRole(role)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      </SidebarInset>

      {editingRole && (
        <MatrixDialog
          role={editingRole}
          features={data?.features ?? []}
          open={!!editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={handleSaved}
        />
      )}
    </SidebarProvider>
  )
}
