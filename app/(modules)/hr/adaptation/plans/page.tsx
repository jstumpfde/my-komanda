"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, Plus, ClipboardList, BookOpen, ArrowRight, Star, Calendar } from "lucide-react"
import { toast } from "sonner"

interface AdaptationPlan {
  id: string
  title: string
  description: string | null
  planType: string
  durationDays: number
  isTemplate: boolean
  isActive: boolean
  stepsCount?: number
}

const PLAN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  onboarding:  { label: "Онбординг",   color: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800" },
  preboarding: { label: "Пребординг",  color: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800" },
  reboarding:  { label: "Ребординг",   color: "bg-violet-500/10 text-violet-700 border-violet-200 dark:text-violet-400 dark:border-violet-800" },
}

const STEP_TYPE_ICONS: Record<string, string> = {
  lesson: "📖", quiz: "✅", task: "📋", video: "🎬", checklist: "☑️", meeting: "🤝",
}

export default function AdaptationPlansPage() {
  const [plans, setPlans] = useState<AdaptationPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", planType: "onboarding", durationDays: "14" })

  useEffect(() => {
    fetch("/api/modules/hr/adaptation/plans")
      .then(r => r.json())
      .then((data: AdaptationPlan[]) => setPlans(data))
      .catch(() => toast.error("Ошибка загрузки планов"))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!form.title.trim()) { toast.error("Введите название"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/adaptation/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          planType: form.planType,
          durationDays: Number(form.durationDays) || 14,
        }),
      })
      if (!res.ok) { toast.error("Ошибка создания плана"); return }
      const plan = await res.json() as AdaptationPlan
      setPlans(prev => [plan, ...prev])
      setCreateOpen(false)
      setForm({ title: "", description: "", planType: "onboarding", durationDays: "14" })
      toast.success("План создан")
    } finally {
      setSaving(false)
    }
  }

  const typeInfo = (type: string) => PLAN_TYPE_LABELS[type] ?? PLAN_TYPE_LABELS.onboarding

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
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Планы адаптации</h1>
                  <p className="text-sm text-muted-foreground">Шаблоны онбординга, пребординга и ребординга</p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" /> Создать план
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <ClipboardList className="size-14 text-muted-foreground/25 mb-4" />
                <p className="text-muted-foreground font-medium">Планов нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Создайте первый план адаптации</p>
                <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Создать план
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map(plan => {
                  const { label, color } = typeInfo(plan.planType)
                  return (
                    <Card key={plan.id} className="flex flex-col">
                      <CardContent className="p-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${color}`}>{label}</Badge>
                            {plan.isTemplate && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-400">
                                <Star className="w-2.5 h-2.5 mr-0.5" />Шаблон
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex-1">
                          <p className="font-semibold text-sm leading-tight">{plan.title}</p>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />{plan.durationDays} дн.
                          </span>
                          {plan.stepsCount !== undefined && (
                            <span className="flex items-center gap-1">
                              <ClipboardList className="w-3.5 h-3.5" />{plan.stepsCount} шагов
                            </span>
                          )}
                        </div>

                        <Link href={`/hr/adaptation/plans/${plan.id}`}>
                          <Button size="sm" variant="outline" className="w-full gap-1.5 mt-auto">
                            Открыть конструктор <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" /> Новый план адаптации
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Адаптация менеджера по продажам" />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Краткое описание программы..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={form.planType} onValueChange={v => setForm(f => ({ ...f, planType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onboarding">Онбординг</SelectItem>
                    <SelectItem value="preboarding">Пребординг</SelectItem>
                    <SelectItem value="reboarding">Ребординг</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Длительность (дней)</Label>
                <Input type="number" min={1} max={365} value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
