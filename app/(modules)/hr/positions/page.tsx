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
import { Briefcase, Plus, Pencil, Trash2 } from "lucide-react"

// ─── Types ───────────────────────────────────────────────
interface Position {
  id: string
  name: string
  description: string | null
  departmentId: string | null
  departmentName: string | null
  grade: string | null
  salaryMin: number | null
  salaryMax: number | null
  createdAt: string
}

interface Department {
  id: string
  name: string
}

interface PosForm {
  name: string
  departmentId: string
  description: string
  grade: string
  salaryMin: string
  salaryMax: string
}

const emptyForm: PosForm = {
  name: "", departmentId: "", description: "", grade: "", salaryMin: "", salaryMax: "",
}

function formatRubles(kopecks: number | null): string {
  if (kopecks == null) return "—"
  return (kopecks / 100).toLocaleString("ru-RU") + " \u20BD"
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PosForm>(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [filterDept, setFilterDept] = useState<string>("all")

  const fetchData = useCallback(async () => {
    try {
      const [posRes, deptRes] = await Promise.all([
        fetch("/api/modules/hr/org/positions"),
        fetch("/api/modules/hr/departments"),
      ])
      if (!posRes.ok || !deptRes.ok) throw new Error()
      setPositions(await posRes.json())
      setDepartments(await deptRes.json())
    } catch {
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredPositions = filterDept === "all"
    ? positions
    : filterDept === "none"
      ? positions.filter((p) => !p.departmentId)
      : positions.filter((p) => p.departmentId === filterDept)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (pos: Position) => {
    setEditingId(pos.id)
    setForm({
      name: pos.name,
      departmentId: pos.departmentId ?? "",
      description: pos.description ?? "",
      grade: pos.grade ?? "",
      salaryMin: pos.salaryMin != null ? String(pos.salaryMin / 100) : "",
      salaryMax: pos.salaryMax != null ? String(pos.salaryMax / 100) : "",
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Введите название должности")
      return
    }

    const payload = {
      name: form.name.trim(),
      departmentId: form.departmentId || null,
      description: form.description.trim() || null,
      grade: form.grade.trim() || null,
      salaryMin: form.salaryMin ? Math.round(parseFloat(form.salaryMin) * 100) : null,
      salaryMax: form.salaryMax ? Math.round(parseFloat(form.salaryMax) * 100) : null,
    }

    try {
      const url = editingId
        ? `/api/modules/hr/org/positions/${editingId}`
        : "/api/modules/hr/org/positions"
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(editingId ? "Должность обновлена" : "Должность создана")
      setDialogOpen(false)
      fetchData()
    } catch {
      toast.error("Ошибка сохранения")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${deleteId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Должность удалена")
      setDeleteId(null)
      fetchData()
    } catch {
      toast.error("Ошибка удаления")
    }
  }

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
                  <Briefcase className="h-6 w-6 text-primary" />
                  Должности
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Штатное расписание и грейды
                </p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить должность
              </Button>
            </div>

            {/* Filter */}
            <div className="mb-4 flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Отдел:</Label>
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все отделы</SelectItem>
                  <SelectItem value="none">Без отдела</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Card className="rounded-xl border border-border shadow-sm bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Название</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Отдел</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Грейд</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-left">Зарплата</th>
                    <th className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Загрузка...</td></tr>
                  ) : filteredPositions.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Нет должностей</td></tr>
                  ) : (
                    filteredPositions.map((pos) => (
                      <tr key={pos.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium text-sm">{pos.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">
                          {pos.departmentName ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          {pos.grade ? (
                            <Badge variant="outline">{pos.grade}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm">
                          {pos.salaryMin != null || pos.salaryMax != null ? (
                            <span>
                              {formatRubles(pos.salaryMin)} — {formatRubles(pos.salaryMax)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(pos)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(pos.id)}>
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
                  <DialogTitle>{editingId ? "Редактировать должность" : "Новая должность"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Название *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Например: Менеджер по продажам"
                    />
                  </div>
                  <div>
                    <Label>Отдел</Label>
                    <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите отдел" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без отдела</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Описание</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Краткое описание должности"
                    />
                  </div>
                  <div>
                    <Label>Грейд</Label>
                    <Input
                      value={form.grade}
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                      placeholder="Например: Senior, Middle, Junior"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Зарплата мин (руб.)</Label>
                      <Input
                        type="number"
                        value={form.salaryMin}
                        onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Зарплата макс (руб.)</Label>
                      <Input
                        type="number"
                        value={form.salaryMax}
                        onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                        placeholder="0"
                      />
                    </div>
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
                  <DialogTitle>Удалить должность?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground py-2">
                  Это действие нельзя отменить.
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
