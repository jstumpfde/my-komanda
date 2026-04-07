"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, Users, ArrowRight, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Assignment {
  id: string
  planId: string
  planTitle?: string
  planType?: string
  employeeId: string | null
  buddyId: string | null
  startDate: string | null
  status: string
  currentDay: number
  completionPct: number
  totalSteps: number | null
  completedSteps: number
  completedAt: string | null
  createdAt: string
}

interface Plan {
  id: string
  title: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Активна",    color: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400" },
  paused:    { label: "Пауза",      color: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400" },
  cancelled: { label: "Отменена",   color: "bg-muted text-muted-foreground border-border" },
  completed: { label: "Завершена",  color: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400" },
}

export default function AdaptationAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPlan, setFilterPlan] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ planId: "", employeeId: "", buddyId: "", startDate: "" })

  useEffect(() => {
    Promise.all([
      fetch("/api/modules/hr/adaptation/assignments").then(r => r.json()),
      fetch("/api/modules/hr/adaptation/plans").then(r => r.json()),
    ]).then(([a, p]: [Assignment[], Plan[]]) => {
      setAssignments(a)
      setPlans(p)
    }).catch(() => toast.error("Ошибка загрузки")).finally(() => setLoading(false))
  }, [])

  const filtered = assignments.filter(a => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false
    if (filterPlan !== "all" && a.planId !== filterPlan) return false
    return true
  })

  async function handleCreate() {
    if (!form.planId) { toast.error("Выберите план"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/adaptation/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId:     form.planId,
          employeeId: form.employeeId || null,
          buddyId:    form.buddyId || null,
          startDate:  form.startDate || undefined,
        }),
      })
      if (!res.ok) { toast.error("Ошибка назначения"); return }
      const created = await res.json() as Assignment
      const plan = plans.find(p => p.id === form.planId)
      setAssignments(prev => [{ ...created, planTitle: plan?.title }, ...prev])
      setCreateOpen(false)
      setForm({ planId: "", employeeId: "", buddyId: "", startDate: "" })
      toast.success("Назначение создано")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Назначения</h1>
                  <p className="text-sm text-muted-foreground">Сотрудники на программах адаптации</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" /> Назначить
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Все статусы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPlan} onValueChange={setFilterPlan}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Все планы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все планы</SelectItem>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-14 text-muted-foreground/25 mb-4" />
                <p className="text-muted-foreground font-medium">Назначений нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Назначьте план адаптации сотруднику</p>
                <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Назначить
                </Button>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Сотрудник</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">План</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">День</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 w-36">Прогресс</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата старта</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a => {
                        const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.active
                        const startDate = a.startDate
                          ? new Date(a.startDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })
                          : "—"
                        return (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                  {a.employeeId ? a.employeeId.slice(0, 2).toUpperCase() : "—"}
                                </div>
                                <span className="font-medium text-foreground">
                                  {a.employeeId ? `Сотрудник ${a.employeeId.slice(0, 6)}` : "Не назначен"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{a.planTitle ?? "—"}</td>
                            <td className="px-4 py-3 font-medium">День {a.currentDay}</td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <Progress value={a.completionPct} className="h-1.5 w-28" />
                                <span className="text-[10px] text-muted-foreground">
                                  {a.completedSteps}/{a.totalSteps ?? "?"} шагов · {a.completionPct}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn("text-[10px]", sc.color)}>{sc.label}</Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />{startDate}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Link href={`/hr/adaptation/assignments/${a.id}`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Create assignment dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Назначить план
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>План адаптации</Label>
              <Select value={form.planId} onValueChange={v => setForm(f => ({ ...f, planId: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите план..." /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ID сотрудника (необязательно)</Label>
              <Input value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} placeholder="uuid или внешний ID" />
            </div>
            <div className="space-y-1.5">
              <Label>ID наставника (необязательно)</Label>
              <Input value={form.buddyId} onChange={e => setForm(f => ({ ...f, buddyId: e.target.value }))} placeholder="uuid или внешний ID" />
            </div>
            <div className="space-y-1.5">
              <Label>Дата старта</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
