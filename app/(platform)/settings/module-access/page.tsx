"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Shield, Save } from "lucide-react"
import { toast } from "sonner"

const MODULES = [
  { id: "hr", label: "HR" },
  { id: "crm", label: "CRM" },
  { id: "marketing", label: "Маркетинг" },
  { id: "knowledge", label: "База знаний" },
  { id: "learning", label: "Обучение" },
  { id: "tasks", label: "Задачи" },
  { id: "booking", label: "Бронирование" },
  { id: "logistics", label: "Логистика" },
  { id: "warehouse", label: "Склад" },
]

const ROLES = [
  { value: "admin", label: "Админ", color: "bg-red-100 text-red-700" },
  { value: "manager", label: "Менеджер", color: "bg-blue-100 text-blue-700" },
  { value: "viewer", label: "Просмотр", color: "bg-gray-100 text-gray-700" },
  { value: "none", label: "Нет доступа", color: "bg-muted text-muted-foreground" },
]

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
}

interface ModuleRoleEntry {
  userId: string
  moduleId: string
  role: string
}

export default function ModuleAccessPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [roles, setRoles] = useState<Map<string, string>>(new Map()) // key: `${userId}:${moduleId}`
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/team").then(r => r.json()),
      fetch("/api/modules/hr/module-roles").then(r => r.ok ? r.json() : []),
    ]).then(([teamData, rolesData]) => {
      setMembers(Array.isArray(teamData) ? teamData : teamData.members || [])
      const map = new Map<string, string>()
      if (Array.isArray(rolesData)) {
        for (const r of rolesData as ModuleRoleEntry[]) {
          map.set(`${r.userId}:${r.moduleId}`, r.role)
        }
      }
      setRoles(map)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const getRole = (userId: string, moduleId: string) => roles.get(`${userId}:${moduleId}`) || "none"

  const setRole = (userId: string, moduleId: string, role: string) => {
    setRoles(prev => {
      const next = new Map(prev)
      next.set(`${userId}:${moduleId}`, role)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries: ModuleRoleEntry[] = []
      for (const [key, role] of roles) {
        const [userId, moduleId] = key.split(":")
        entries.push({ userId, moduleId, role })
      }
      await fetch("/api/modules/hr/module-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: entries }),
      })
      toast.success("Доступ к модулям сохранён")
    } catch {
      toast.error("Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 mb-5">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <h1 className="text-xl font-bold">Доступ к модулям</h1>
                <p className="text-sm text-muted-foreground">Настройте роли сотрудников в каждом модуле</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
              <Card>
                <CardContent className="py-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground w-48">Сотрудник</th>
                          {MODULES.map(m => (
                            <th key={m.id} className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">{m.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {members.map(member => (
                          <tr key={member.id} className="border-b last:border-0">
                            <td className="py-2 px-3">
                              <p className="font-medium text-sm">{member.name}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </td>
                            {MODULES.map(m => (
                              <td key={m.id} className="py-2 px-1 text-center">
                                <Select value={getRole(member.id, m.id)} onValueChange={v => setRole(member.id, m.id, v)}>
                                  <SelectTrigger className="h-7 text-[11px] w-[100px] mx-auto"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {ROLES.map(r => (
                                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Сохранить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
