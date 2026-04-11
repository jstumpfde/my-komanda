"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Plus, Loader2, GraduationCap, Users, CheckCircle2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface PlanMaterialRef {
  materialId: string
  materialType: "demo" | "article"
  order: number
  required: boolean
}

interface Plan {
  id: string
  title: string
  description: string | null
  materials: PlanMaterialRef[]
  materialsCount: number
  assignedCount: number
  completedCount: number
  createdAt: string
}

interface LibraryMaterial {
  id: string
  title: string
  type: "demo" | "article"
}

interface TeamMember {
  id: string
  name: string
  email: string
  position?: string | null
  role?: string
}

export default function LearningPlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [loading, setLoading] = useState(true)

  // Create dialog state
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [library, setLibrary] = useState<LibraryMaterial[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [selectedMaterials, setSelectedMaterials] = useState<PlanMaterialRef[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [deadline, setDeadline] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch("/api/modules/knowledge/learning-plans")
      .then((r) => r.json())
      .then((data) => {
        setPlans(data.plans ?? [])
        setLoading(false)
      })
      .catch(() => {
        setPlans([])
        setLoading(false)
      })
  }, [])

  const openCreateDialog = async () => {
    setOpen(true)
    setTitle("")
    setDescription("")
    setSelectedMaterials([])
    setSelectedUsers([])
    setDeadline("")

    if (library.length === 0) {
      setLibraryLoading(true)
      try {
        const [demosRes, articlesRes, teamRes] = await Promise.all([
          fetch("/api/demo-templates").then((r) => r.ok ? r.json() : []),
          fetch("/api/modules/knowledge/articles").then((r) => r.ok ? r.json() : { articles: [] }),
          fetch("/api/team").then((r) => r.ok ? r.json() : []),
        ])
        const demos: LibraryMaterial[] = (Array.isArray(demosRes) ? demosRes : (demosRes.data ?? []))
          .map((d: { id: string; name: string }) => ({ id: d.id, title: d.name, type: "demo" as const }))
        const articles: LibraryMaterial[] = (articlesRes.articles ?? [])
          .map((a: { id: string; title: string }) => ({ id: a.id, title: a.title, type: "article" as const }))
        setLibrary([...demos, ...articles])
        setTeam(Array.isArray(teamRes) ? teamRes : [])
      } catch {
        toast.error("Не удалось загрузить библиотеку")
      } finally {
        setLibraryLoading(false)
      }
    }
  }

  const toggleMaterial = (m: LibraryMaterial) => {
    setSelectedMaterials((prev) => {
      const exists = prev.find((x) => x.materialId === m.id)
      if (exists) return prev.filter((x) => x.materialId !== m.id)
      return [...prev, { materialId: m.id, materialType: m.type, order: prev.length, required: true }]
    })
  }

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const moveMaterial = (index: number, dir: -1 | 1) => {
    setSelectedMaterials((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((m, i) => ({ ...m, order: i }))
    })
  }

  const selectedIds = useMemo(() => new Set(selectedMaterials.map((m) => m.materialId)), [selectedMaterials])

  const handleCreate = async () => {
    const name = title.trim()
    if (name.length < 3) {
      toast.error("Название — минимум 3 символа")
      return
    }

    setSubmitting(true)
    try {
      const createRes = await fetch("/api/modules/knowledge/learning-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: name,
          description: description.trim() || undefined,
          materials: selectedMaterials,
        }),
      })
      const payload = await createRes.json().catch(() => ({}))
      if (!createRes.ok) {
        const msg = payload?.error || `Ошибка ${createRes.status}`
        toast.error(msg)
        return
      }

      const planId: string | undefined = payload?.data?.id ?? payload?.id
      if (!planId) {
        toast.error("Сервер не вернул id плана")
        return
      }

      if (selectedUsers.length > 0) {
        const assignRes = await fetch(`/api/modules/knowledge/learning-plans/${planId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: selectedUsers,
            deadline: deadline || null,
          }),
        })
        if (!assignRes.ok) {
          const errPayload = await assignRes.json().catch(() => ({}))
          toast.error(errPayload?.error || "План создан, но не удалось назначить сотрудников")
        }
      }

      toast.success("План создан")
      setOpen(false)
      const refreshed = await fetch("/api/modules/knowledge/learning-plans").then((r) => r.json())
      setPlans(refreshed.plans ?? [])
    } catch (err) {
      console.error("[create plan]", err)
      toast.error("Ошибка сети")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">Планы обучения</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Индивидуальные траектории для сотрудников
                  </p>
                </div>
                <Button onClick={openCreateDialog} className="h-10 gap-2">
                  <Plus className="w-4 h-4" />
                  Создать план
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Загрузка планов...
                </div>
              ) : (plans ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-16 text-center">
                  <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">Пока нет планов обучения</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Создайте первый план — например, онбординг для нового сотрудника
                  </p>
                  <Button onClick={openCreateDialog} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Создать план
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Название</th>
                        <th className="px-4 py-3 text-center">Материалов</th>
                        <th className="px-4 py-3 text-center">Назначено</th>
                        <th className="px-4 py-3 text-center">Завершили</th>
                        <th className="px-4 py-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(plans ?? []).map((plan) => (
                        <tr key={plan.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              href={`/knowledge-v2/plans/${plan.id}`}
                              className="font-medium hover:text-primary transition-colors"
                            >
                              {plan.title}
                            </Link>
                            {plan.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-md">{plan.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{plan.materialsCount}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              {plan.assignedCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {plan.completedCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/knowledge-v2/plans/${plan.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              Открыть
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] min-h-[600px] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <DialogTitle>Новый план обучения</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* ── Название + описание ── */}
            <section className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  Название *
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Онбординг менеджера продаж"
                  maxLength={500}
                  className="h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  Описание
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Что будут изучать, какие цели"
                  rows={3}
                />
              </div>
            </section>

            {/* ── Материалы ── */}
            <section className="pt-5 border-t border-border">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Материалы
                </label>
                <span className="text-xs text-muted-foreground">
                  Выбрано: <b className="text-foreground">{selectedMaterials.length}</b>
                </span>
              </div>
              {libraryLoading ? (
                <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground text-xs border border-border rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin" />Загрузка библиотеки...
                </div>
              ) : library.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border border-dashed border-border rounded-md">
                  Нет доступных материалов
                </div>
              ) : (
                <div className="border border-border rounded-md max-h-64 overflow-y-auto divide-y divide-border">
                  {library.map((m) => {
                    const checked = selectedIds.has(m.id)
                    return (
                      <label
                        key={`${m.type}-${m.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/40"
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleMaterial(m)} />
                        <span className="flex-1 truncate">{m.title}</span>
                        <span className={cn(
                          "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                          m.type === "demo"
                            ? "border-purple-500/40 text-purple-600 bg-purple-500/10 dark:text-purple-300"
                            : "border-blue-500/40 text-blue-600 bg-blue-500/10 dark:text-blue-300",
                        )}>
                          {m.type === "demo" ? "Демо" : "Статья"}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              {selectedMaterials.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted-foreground mb-1.5">Порядок изучения:</p>
                  {selectedMaterials.map((sm, i) => {
                    const lib = library.find((l) => l.id === sm.materialId)
                    return (
                      <div key={sm.materialId} className="flex items-center gap-2 text-xs px-2.5 py-2 rounded bg-muted/40">
                        <span className="font-mono text-muted-foreground w-5">{i + 1}.</span>
                        <span className="truncate flex-1">{lib?.title ?? sm.materialId}</span>
                        <button
                          type="button"
                          onClick={() => moveMaterial(i, -1)}
                          disabled={i === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMaterial(i, 1)}
                          disabled={i === selectedMaterials.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMaterial({ id: sm.materialId, title: "", type: sm.materialType })}
                          className="text-muted-foreground hover:text-destructive px-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── Сотрудники ── */}
            <section className="pt-5 border-t border-border">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Назначить сотрудникам
                </label>
                <span className="text-xs text-muted-foreground">
                  Выбрано: <b className="text-foreground">{selectedUsers.length}</b>
                </span>
              </div>
              {team.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-xs text-muted-foreground border border-dashed border-border rounded-md">
                  Нет участников команды
                </div>
              ) : (
                <div className="border border-border rounded-md max-h-56 overflow-y-auto divide-y divide-border">
                  {team.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selectedUsers.includes(u.id)}
                        onCheckedChange={() => toggleUser(u.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{u.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {u.position || u.email}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* ── Дедлайн ── */}
            <section className="pt-5 border-t border-border">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Дедлайн
              </label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-10 max-w-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Необязательно. Будет применён к каждому назначению.
              </p>
            </section>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Отмена
            </Button>
            <Button onClick={handleCreate} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Создать план
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
