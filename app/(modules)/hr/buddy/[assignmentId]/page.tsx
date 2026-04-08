"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, ChevronLeft, Check, Clock, Eye, SkipForward, BookOpen, CheckSquare,
  Video, ClipboardList, Users, Plus, Calendar, Star, MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Step {
  id: string; dayNumber: number; sortOrder: number; title: string; type: string
  durationMin: number | null; isRequired: boolean; isApproved: boolean
}
interface Completion { id: string; stepId: string; status: string; completedAt: string | null; score: number | null }
interface Task { id: string; title: string; description: string | null; dayNumber: number | null; status: string; completedAt: string | null; note: string | null }
interface Meeting { id: string; title: string; scheduledAt: string | null; status: string; notes: string | null; rating: number | null; feedback: string | null }

interface Assignment {
  id: string; employeeId: string | null; status: string; currentDay: number
  completionPct: number; totalSteps: number | null; completedSteps: number
  startDate: string | null; planTitle?: string
  steps: Step[]; completions: Completion[]; tasks: Task[]; meetings: Meeting[]
}

const STEP_STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pending:   { label: "Ожидает",    icon: Clock,       color: "text-muted-foreground",  bg: "bg-muted/40" },
  sent:      { label: "Отправлен",  icon: Clock,       color: "text-blue-600",           bg: "bg-blue-50 dark:bg-blue-950/30" },
  viewed:    { label: "Просмотрен", icon: Eye,         color: "text-amber-600",          bg: "bg-amber-50 dark:bg-amber-950/30" },
  completed: { label: "Выполнен",   icon: Check,       color: "text-emerald-600",        bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  skipped:   { label: "Пропущен",   icon: SkipForward, color: "text-muted-foreground",  bg: "bg-muted/20" },
}
const STEP_TYPE_ICONS: Record<string, React.ElementType> = {
  lesson: BookOpen, task: CheckSquare, quiz: ClipboardList, video: Video, checklist: CheckSquare, meeting: Users,
}
const TASK_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "text-muted-foreground" },
  done:    { label: "Выполнена", color: "text-emerald-600" },
  skipped: { label: "Пропущена", color: "text-muted-foreground" },
}
const MEETING_STATUS: Record<string, { label: string; color: string }> = {
  scheduled:   { label: "Запланирована",  color: "text-blue-600" },
  completed:   { label: "Проведена",      color: "text-emerald-600" },
  cancelled:   { label: "Отменена",       color: "text-muted-foreground" },
  rescheduled: { label: "Перенесена",     color: "text-amber-600" },
}

export default function BuddyAssignmentPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const router = useRouter()
  const [data, setData] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [taskOpen, setTaskOpen] = useState(false)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dayNumber: "" })
  const [meetingForm, setMeetingForm] = useState({ title: "", scheduledAt: "", notes: "" })

  const fetch_ = useCallback(async () => {
    const res = await fetch(`/api/modules/hr/buddy/assignments/${assignmentId}`)
    if (!res.ok) { toast.error("Назначение не найдено"); return }
    setData(await res.json() as Assignment)
  }, [assignmentId])

  useEffect(() => { fetch_().finally(() => setLoading(false)) }, [fetch_])

  async function addTask() {
    if (!taskForm.title) { toast.error("Введите название задачи"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/buddy/assignments/${assignmentId}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskForm.title, description: taskForm.description || null, dayNumber: taskForm.dayNumber ? Number(taskForm.dayNumber) : null }),
      })
      if (!res.ok) { toast.error("Ошибка создания задачи"); return }
      await fetch_()
      setTaskOpen(false)
      setTaskForm({ title: "", description: "", dayNumber: "" })
      toast.success("Задача добавлена")
    } finally { setSaving(false) }
  }

  async function updateTask(taskId: string, status: string) {
    await fetch(`/api/modules/hr/buddy/tasks/${taskId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await fetch_()
  }

  async function addMeeting() {
    if (!meetingForm.title) { toast.error("Введите тему встречи"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/buddy/assignments/${assignmentId}/meetings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingForm.title, scheduledAt: meetingForm.scheduledAt || null, notes: meetingForm.notes || null }),
      })
      if (!res.ok) { toast.error("Ошибка создания встречи"); return }
      await fetch_()
      setMeetingOpen(false)
      setMeetingForm({ title: "", scheduledAt: "", notes: "" })
      toast.success("Встреча запланирована")
    } finally { setSaving(false) }
  }

  async function updateMeeting(meetingId: string, status: string) {
    await fetch(`/api/modules/hr/buddy/meetings/${meetingId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await fetch_()
  }

  if (loading) return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar /><SidebarInset><DashboardHeader />
      <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </SidebarInset>
    </SidebarProvider>
  )
  if (!data) return null

  const completionMap = new Map(data.completions.map(c => [c.stepId, c]))
  const days = Array.from(new Set(data.steps.map(s => s.dayNumber))).sort((a, b) => a - b)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/hr/buddy")}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">
                  {data.employeeId ? `Сотрудник ${data.employeeId.slice(0, 8)}` : "Назначение"}
                </h1>
                <p className="text-sm text-muted-foreground">{data.planTitle ?? "—"}</p>
              </div>
            </div>

            {/* Progress card */}
            <div className="rounded-xl border bg-card p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Прогресс адаптации</span>
                <span className="text-sm font-bold text-primary">{data.completionPct}%</span>
              </div>
              <Progress value={data.completionPct} className="h-2" />
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>{data.completedSteps} из {data.totalSteps ?? "?"} шагов</span>
                <span>День {data.currentDay}</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="progress">
              <TabsList className="mb-4">
                <TabsTrigger value="progress">Прогресс</TabsTrigger>
                <TabsTrigger value="tasks">Задачи ({data.tasks.length})</TabsTrigger>
                <TabsTrigger value="meetings">Встречи ({data.meetings.length})</TabsTrigger>
                <TabsTrigger value="feedback">Обратная связь</TabsTrigger>
              </TabsList>

              {/* Tab: Progress */}
              <TabsContent value="progress">
                <div className="space-y-4">
                  {days.map(day => {
                    const daySteps = data.steps.filter(s => s.dayNumber === day).sort((a, b) => a.sortOrder - b.sortOrder)
                    const isCurrent = day === data.currentDay
                    const isPast = day < data.currentDay
                    return (
                      <div key={day} className="flex gap-3">
                        <div className="flex flex-col items-center w-14 shrink-0">
                          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2",
                            isCurrent ? "border-primary bg-primary text-primary-foreground"
                            : isPast ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950"
                            : "border-border bg-muted text-muted-foreground"
                          )}>{day}</div>
                          {day !== days[days.length - 1] && (
                            <div className={cn("w-0.5 flex-1 mt-1 min-h-[12px]", isPast ? "bg-emerald-300" : "bg-border")} />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className={cn("text-xs font-semibold mb-2", isCurrent ? "text-primary" : "text-muted-foreground")}>
                            День {day}{isCurrent && " ← Текущий"}
                          </p>
                          <div className="space-y-2">
                            {daySteps.map(step => {
                              const completion = completionMap.get(step.id)
                              const status = completion?.status ?? "pending"
                              const sc = STEP_STATUS_CONFIG[status] ?? STEP_STATUS_CONFIG.pending
                              const StatusIcon = sc.icon
                              const TypeIcon = STEP_TYPE_ICONS[step.type] ?? BookOpen
                              return (
                                <div key={step.id} className={cn("rounded-lg border p-3", sc.bg)}>
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-background/60 text-primary">
                                      <TypeIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className={cn("text-sm font-medium", (status === "completed" || status === "skipped") && "line-through text-muted-foreground")}>
                                          {step.title}
                                        </p>
                                        {!step.isApproved && (
                                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700 bg-amber-50">
                                            На модерации
                                          </Badge>
                                        )}
                                      </div>
                                      <span className={cn("text-[10px] flex items-center gap-1 mt-0.5", sc.color)}>
                                        <StatusIcon className="w-3 h-3" />{sc.label}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {days.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Нет шагов в плане</p>
                  )}
                </div>
              </TabsContent>

              {/* Tab: Tasks */}
              <TabsContent value="tasks">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm text-muted-foreground">Задачи от наставника</p>
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => setTaskOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Добавить
                  </Button>
                </div>
                {data.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Задач нет</p>
                ) : (
                  <div className="space-y-2">
                    {data.tasks.map(task => {
                      const ts = TASK_STATUS[task.status] ?? TASK_STATUS.pending
                      return (
                        <div key={task.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
                          <button
                            className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                              task.status === "done" ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/40"
                            )}
                            onClick={() => updateTask(task.id, task.status === "done" ? "pending" : "done")}
                          >
                            {task.status === "done" && <Check className="w-3 h-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium", task.status === "done" && "line-through text-muted-foreground")}>
                              {task.title}
                            </p>
                            {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                            {task.dayNumber && <p className="text-[10px] text-muted-foreground">День {task.dayNumber}</p>}
                          </div>
                          <span className={cn("text-xs shrink-0", ts.color)}>{ts.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tab: Meetings */}
              <TabsContent value="meetings">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm text-muted-foreground">Встречи с подопечным</p>
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => setMeetingOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Запланировать
                  </Button>
                </div>
                {data.meetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Встреч нет</p>
                ) : (
                  <div className="space-y-2">
                    {data.meetings.map(m => {
                      const ms = MEETING_STATUS[m.status] ?? MEETING_STATUS.scheduled
                      const date = m.scheduledAt
                        ? new Date(m.scheduledAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })
                        : "—"
                      return (
                        <div key={m.id} className="rounded-lg border bg-card p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{m.title}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Calendar className="w-3 h-3" /> {date}
                              </p>
                              {m.notes && <p className="text-xs text-muted-foreground mt-1">{m.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.rating && (
                                <span className="flex items-center gap-0.5 text-xs text-amber-600">
                                  <Star className="w-3 h-3 fill-amber-500" />{m.rating}
                                </span>
                              )}
                              <span className={cn("text-xs", ms.color)}>{ms.label}</span>
                            </div>
                          </div>
                          {m.status === "scheduled" && (
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => updateMeeting(m.id, "completed")}>
                                Проведена
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground" onClick={() => updateMeeting(m.id, "cancelled")}>
                                Отменить
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tab: Feedback */}
              <TabsContent value="feedback">
                <div className="space-y-4">
                  {data.meetings.filter(m => m.status === "completed" && (m.rating || m.feedback)).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Обратная связь по завершённым встречам появится здесь</p>
                  ) : (
                    data.meetings.filter(m => m.status === "completed").map(m => (
                      <div key={m.id} className="rounded-xl border bg-card p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{m.title}</p>
                          {m.rating && (
                            <div className="flex items-center gap-0.5">
                              {[1,2,3,4,5].map(i => (
                                <Star key={i} className={cn("w-3.5 h-3.5", i <= (m.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20")} />
                              ))}
                            </div>
                          )}
                        </div>
                        {m.feedback && (
                          <p className="text-sm text-muted-foreground flex items-start gap-2">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />{m.feedback}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>

      {/* Add task dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckSquare className="w-4 h-4 text-primary" /> Добавить задачу</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Ознакомиться с регламентом..." />
            </div>
            <div className="space-y-1.5">
              <Label>Описание (необязательно)</Label>
              <Textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Подробности..." />
            </div>
            <div className="space-y-1.5">
              <Label>День адаптации</Label>
              <Input type="number" min={1} value={taskForm.dayNumber} onChange={e => setTaskForm(f => ({ ...f, dayNumber: e.target.value }))} placeholder="1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Отмена</Button>
            <Button onClick={addTask} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add meeting dialog */}
      <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Запланировать встречу</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Тема встречи</Label>
              <Input value={meetingForm.title} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} placeholder="Check-in неделя 1..." />
            </div>
            <div className="space-y-1.5">
              <Label>Дата и время</Label>
              <Input type="datetime-local" value={meetingForm.scheduledAt} onChange={e => setMeetingForm(f => ({ ...f, scheduledAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Заметки (необязательно)</Label>
              <Textarea value={meetingForm.notes} onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Повестка встречи..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingOpen(false)}>Отмена</Button>
            <Button onClick={addMeeting} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Запланировать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
