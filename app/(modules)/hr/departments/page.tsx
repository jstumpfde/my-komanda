"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Building2, Plus, Pencil, Trash2, ChevronRight, Users } from "lucide-react"

// ─── Types ───────────────────────────────────────────────
interface Department {
  id: string
  name: string
  description: string | null
  parentId: string | null
  parentName: string | null
  headUserId: string | null
  headUserName: string | null
  createdAt: string
}

interface DeptForm {
  name: string
  description: string
  parentId: string
  headUserId: string
}

const emptyForm: DeptForm = { name: "", description: "", parentId: "", headUserId: "" }

// ─── Helpers ─────────────────────────────────────────────
type DeptNode = Department & { children: DeptNode[]; depth: number }

function buildTree(depts: Department[]): DeptNode[] {
  const map = new Map<string, DeptNode>()
  depts.forEach((d) => map.set(d.id, { ...d, children: [], depth: 0 }))

  const roots: DeptNode[] = []
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  // Flatten tree with depth
  const flat: DeptNode[] = []
  function walk(nodes: DeptNode[], depth: number) {
    for (const n of nodes) {
      n.depth = depth
      flat.push(n)
      walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return flat
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DeptForm>(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/departments")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDepartments(data)
    } catch {
      toast.error("Ошибка загрузки отделов")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDepartments() }, [fetchDepartments])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (dept: Department) => {
    setEditingId(dept.id)
    setForm({
      name: dept.name,
      description: dept.description ?? "",
      parentId: dept.parentId ?? "",
      headUserId: dept.headUserId ?? "",
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Введите название отдела")
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      parentId: form.parentId || null,
      headUserId: form.headUserId || null,
    }

    try {
      const url = editingId
        ? `/api/modules/hr/departments/${editingId}`
        : "/api/modules/hr/departments"
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(editingId ? "Отдел обновлён" : "Отдел создан")
      setDialogOpen(false)
      fetchDepartments()
    } catch {
      toast.error("Ошибка сохранения")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/modules/hr/departments/${deleteId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Отдел удалён")
      setDeleteId(null)
      fetchDepartments()
    } catch {
      toast.error("Ошибка удаления")
    }
  }

  const tree = buildTree(departments)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-primary" />
                  Отделы
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Управление организационной структурой компании
                </p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить отдел
              </Button>
            </div>

            {/* Table */}
            <Card className="rounded-xl border border-border shadow-sm bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Название</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Описание</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Руководитель</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Родительский отдел</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Загрузка...</td></tr>
                  ) : tree.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Нет отделов</td></tr>
                  ) : (
                    tree.map((dept) => (
                      <tr key={dept.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center" style={{ marginLeft: dept.depth * 24 }}>
                            {dept.depth > 0 && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground mr-1.5 shrink-0" />
                            )}
                            <Building2 className="h-4 w-4 text-primary mr-2 shrink-0" />
                            <span className="font-medium text-sm">{dept.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{dept.description ?? "—"}</td>
                        <td className="px-5 py-3">
                          {dept.headUserName ? (
                            <Badge variant="secondary" className="gap-1">
                              <Users className="h-3 w-3" />
                              {dept.headUserName}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{dept.parentName ?? "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(dept)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(dept.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Редактировать отдел" : "Новый отдел"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Название *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Например: Отдел продаж"
                    />
                  </div>
                  <div>
                    <Label>Описание</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Краткое описание отдела"
                    />
                  </div>
                  <div>
                    <Label>Родительский отдел</Label>
                    <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Без родителя" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без родителя</SelectItem>
                        {departments
                          .filter((d) => d.id !== editingId)
                          .map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
                  <Button onClick={handleSave}>{editingId ? "Сохранить" : "Создать"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Удалить отдел?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground py-2">
                  Это действие нельзя отменить. Все дочерние отделы потеряют связь с родительским.
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteId(null)}>Отмена</Button>
                  <Button variant="destructive" onClick={handleDelete}>Удалить</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
