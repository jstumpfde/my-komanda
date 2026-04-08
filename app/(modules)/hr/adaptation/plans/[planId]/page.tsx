"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Loader2, Plus, ChevronLeft, GripVertical, Pencil, Trash2, BookOpen, CheckSquare, Video, ClipboardList, Users, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface AdaptationStep {
  id: string
  planId: string
  dayNumber: number
  sortOrder: number
  title: string
  type: string
  content: unknown
  channel: string
  durationMin: number | null
  isRequired: boolean
  isApproved: boolean
  createdByRole: string
}

interface AdaptationPlan {
  id: string
  title: string
  planType: string
  durationDays: number
  isTemplate: boolean
  steps: AdaptationStep[]
}

const STEP_TYPES = [
  { value: "lesson",    label: "Урок",       icon: BookOpen,     color: "text-blue-600" },
  { value: "task",      label: "Задача",      icon: CheckSquare,  color: "text-emerald-600" },
  { value: "quiz",      label: "Тест",        icon: ClipboardList,color: "text-violet-600" },
  { value: "video",     label: "Видео",       icon: Video,        color: "text-rose-600" },
  { value: "checklist", label: "Чеклист",     icon: CheckSquare,  color: "text-amber-600" },
  { value: "meeting",   label: "Встреча",     icon: Users,        color: "text-cyan-600" },
]

const CHANNELS = [
  { value: "auto",    label: "Авто" },
  { value: "bot",     label: "Бот" },
  { value: "email",   label: "Email" },
  { value: "manual",  label: "Вручную" },
]

function stepTypeInfo(type: string) {
  return STEP_TYPES.find(t => t.value === type) ?? STEP_TYPES[0]
}

function StepCard({
  step,
  onEdit,
  onDelete,
}: {
  step: AdaptationStep
  onEdit: (step: AdaptationStep) => void
  onDelete: (id: string) => void
}) {
  const info = stepTypeInfo(step.type)
  const Icon = info.icon
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-card transition-colors group">
      <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />
      <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-muted/50", info.color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium truncate">{step.title}</p>
          {step.isApproved === false && (
            <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 shrink-0">
              На модерации
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{info.label}</span>
          {step.durationMin && <span className="text-[10px] text-muted-foreground">{step.durationMin} мин</span>}
          {!step.isRequired && <span className="text-[10px] text-muted-foreground/60">необяз.</span>}
          <span className="text-[10px] text-muted-foreground/60">{CHANNELS.find(c => c.value === step.channel)?.label}</span>
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(step)}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onDelete(step.id)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

const EMPTY_FORM = { title: "", type: "lesson", channel: "auto", durationMin: "", isRequired: true, contentText: "", dayNumber: "1" }

export default function AdaptationPlanPage() {
  const { planId } = useParams<{ planId: string }>()
  const router = useRouter()
  const [plan, setPlan] = useState<AdaptationPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<AdaptationStep | null>(null)
  const [addDay, setAddDay] = useState<number>(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const fetchPlan = useCallback(async () => {
    const res = await fetch(`/api/modules/hr/adaptation/plans/${planId}`)
    if (!res.ok) { toast.error("План не найден"); return }
    const data = await res.json() as AdaptationPlan
    setPlan(data)
  }, [planId])

  useEffect(() => {
    fetchPlan().finally(() => setLoading(false))
  }, [fetchPlan])

  // Build day list: negatives for preboarding, 1..durationDays
  const days = plan ? (
    plan.planType === "preboarding"
      ? [-3, -1, 0, ...Array.from({ length: plan.durationDays }, (_, i) => i + 1)]
      : Array.from({ length: plan.durationDays }, (_, i) => i + 1)
  ) : []

  const stepsByDay = (day: number) =>
    (plan?.steps ?? [])
      .filter(s => s.dayNumber === day)
      .sort((a, b) => a.sortOrder - b.sortOrder)

  function openAdd(day: number) {
    setEditingStep(null)
    setAddDay(day)
    setForm({ ...EMPTY_FORM, dayNumber: String(day) })
    setDialogOpen(true)
  }

  function openEdit(step: AdaptationStep) {
    setEditingStep(step)
    setForm({
      title: step.title,
      type: step.type,
      channel: step.channel,
      durationMin: step.durationMin ? String(step.durationMin) : "",
      isRequired: step.isRequired,
      contentText: typeof step.content === "object" && step.content !== null
        ? ((step.content as Record<string, unknown>).body as string ?? "")
        : "",
      dayNumber: String(step.dayNumber),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Введите название шага"); return }
    setSaving(true)
    try {
      const payload = {
        dayNumber:   Number(form.dayNumber),
        title:       form.title,
        type:        form.type,
        channel:     form.channel,
        durationMin: form.durationMin ? Number(form.durationMin) : null,
        isRequired:  form.isRequired,
        content:     form.contentText ? { body: form.contentText } : null,
      }

      let res: Response
      if (editingStep) {
        res = await fetch(`/api/modules/hr/adaptation/steps/${editingStep.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/modules/hr/adaptation/plans/${planId}/steps`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      }

      if (!res.ok) { toast.error("Ошибка сохранения"); return }
      await fetchPlan()
      setDialogOpen(false)
      toast.success(editingStep ? "Шаг обновлён" : "Шаг добавлен")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(stepId: string) {
    const res = await fetch(`/api/modules/hr/adaptation/steps/${stepId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Ошибка удаления"); return }
    setPlan(prev => prev ? { ...prev, steps: prev.steps.filter(s => s.id !== stepId) } : prev)
    toast.success("Шаг удалён")
  }

  const planTypeLabel: Record<string, string> = { onboarding: "Онбординг", preboarding: "Пребординг", reboarding: "Ребординг" }

  if (loading) return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar /><SidebarInset><DashboardHeader />
      <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </SidebarInset>
    </SidebarProvider>
  )

  if (!plan) return null

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/hr/adaptation/plans")}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold truncate">{plan.title}</h1>
                  <Badge variant="outline" className="text-[10px]">{planTypeLabel[plan.planType] ?? plan.planType}</Badge>
                  <Badge variant="outline" className="text-[10px]">{plan.durationDays} дней</Badge>
                  {plan.isTemplate && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Шаблон</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{plan.steps.length} шагов · Перетащите шаги для изменения порядка</p>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              {days.map(day => {
                const daySteps = stepsByDay(day)
                const dayLabel = day < 0 ? `День ${day}` : day === 0 ? "День 0 (выход)" : `День ${day}`
                return (
                  <div key={day} className="flex gap-3">
                    {/* Day marker */}
                    <div className="flex flex-col items-center w-16 shrink-0">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2",
                        day < 0
                          ? "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : day === 0
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground"
                      )}>
                        {day < 0 ? day : day === 0 ? "0" : day}
                      </div>
                      {day !== days[days.length - 1] && (
                        <div className="w-0.5 flex-1 bg-border mt-1 min-h-[8px]" />
                      )}
                    </div>

                    {/* Steps */}
                    <div className="flex-1 pb-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">{dayLabel}</p>
                      <div className="space-y-1.5">
                        {daySteps.map(step => (
                          <StepCard key={step.id} step={step} onEdit={openEdit} onDelete={handleDelete} />
                        ))}
                        <button
                          onClick={() => openAdd(day)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-primary/40 hover:text-primary transition-colors text-sm"
                        >
                          <Plus className="w-3.5 h-3.5" /> Добавить шаг
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Step dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStep ? "Редактировать шаг" : `Добавить шаг — День ${addDay}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Название шага" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STEP_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Канал</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>День</Label>
                <Input type="number" value={form.dayNumber} onChange={e => setForm(f => ({ ...f, dayNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Длительность (мин)</Label>
                <Input type="number" value={form.durationMin} onChange={e => setForm(f => ({ ...f, durationMin: e.target.value }))} placeholder="—" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Описание / контент</Label>
              <Textarea value={form.contentText} onChange={e => setForm(f => ({ ...f, contentText: e.target.value }))} rows={3} placeholder="Текст задания, ссылки, инструкции..." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isRequired} onCheckedChange={v => setForm(f => ({ ...f, isRequired: v }))} />
              <Label>Обязательный шаг</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editingStep ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
