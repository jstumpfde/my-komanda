"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus, LayoutGrid, List, Calendar, X, Trash2, Save, Send,
  AlertTriangle, ArrowUp, Minus, ArrowDown, Sparkles, Clock,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskItem {
  id: string
  title: string
  description: string
  status: "todo" | "in_progress" | "review" | "done"
  priority: "urgent" | "high" | "medium" | "low"
  projectId: string | null
  projectName: string | null
  projectColor: string
  assigneeId: string | null
  assigneeName: string
  assigneeInitials: string
  assigneeColor: string
  source: "manual" | "ai" | "crm" | "hr" | "knowledge"
  deadline: string | null
  progress: number
  tags: string[]
  subtasks: { id: string; title: string; done: boolean }[]
  comments: { id: string; author: string; initials: string; color: string; text: string; date: string }[]
  activity: { id: string; user: string; action: string; date: string }[]
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_PROJECTS = [
  { id: "p1", name: "Маркетинг",  color: "#a855f7" },
  { id: "p2", name: "Разработка", color: "#3b82f6" },
  { id: "p3", name: "Продажи",    color: "#10b981" },
  { id: "p4", name: "HR",         color: "#f59e0b" },
]

const MOCK_USERS = [
  { id: "u1", name: "Анна И.",    initials: "АИ", color: "#8b5cf6" },
  { id: "u2", name: "Макс П.",    initials: "МП", color: "#3b82f6" },
  { id: "u3", name: "Мария С.",   initials: "МС", color: "#ef4444" },
  { id: "u4", name: "Дмитрий К.", initials: "ДК", color: "#10b981" },
  { id: "u5", name: "Елена С.",   initials: "ЕС", color: "#f59e0b" },
]

const MOCK_TASKS: TaskItem[] = [
  { id: "t1", title: "Подготовить отчёт Q1", description: "Собрать данные по всем каналам и подготовить сводный отчёт", status: "todo", priority: "urgent", projectId: "p1", projectName: "Маркетинг", projectColor: "#a855f7", assigneeId: "u1", assigneeName: "Анна И.", assigneeInitials: "АИ", assigneeColor: "#8b5cf6", source: "manual", deadline: "2026-04-07", progress: 0, tags: ["отчёт", "Q1"], subtasks: [{ id: "st1", title: "Собрать данные GA", done: false }, { id: "st2", title: "Сделать графики", done: false }], comments: [], activity: [{ id: "a1", user: "Анна И.", action: "создала задачу", date: "5 апр" }] },
  { id: "t2", title: "Обновить лендинг", description: "Заменить баннер и обновить CTA", status: "todo", priority: "medium", projectId: "p2", projectName: "Разработка", projectColor: "#3b82f6", assigneeId: "u2", assigneeName: "Макс П.", assigneeInitials: "МП", assigneeColor: "#3b82f6", source: "manual", deadline: "2026-04-10", progress: 0, tags: ["лендинг"], subtasks: [], comments: [], activity: [] },
  { id: "t3", title: "Провести интервью с кандидатом", description: "Техническое интервью на позицию Frontend", status: "todo", priority: "high", projectId: null, projectName: null, projectColor: "", assigneeId: "u3", assigneeName: "Мария С.", assigneeInitials: "МС", assigneeColor: "#ef4444", source: "hr", deadline: "2026-04-08", progress: 0, tags: ["интервью"], subtasks: [], comments: [], activity: [] },
  { id: "t4", title: "Настроить email-рассылку", description: "Создать шаблон и настроить триггеры", status: "in_progress", priority: "medium", projectId: "p1", projectName: "Маркетинг", projectColor: "#a855f7", assigneeId: "u1", assigneeName: "Анна И.", assigneeInitials: "АИ", assigneeColor: "#8b5cf6", source: "manual", deadline: "2026-04-12", progress: 40, tags: ["email"], subtasks: [{ id: "st3", title: "Дизайн шаблона", done: true }, { id: "st4", title: "Настроить триггеры", done: false }], comments: [{ id: "c1", author: "Анна И.", initials: "АИ", color: "#8b5cf6", text: "Шаблон готов, осталось настроить автоматизацию", date: "5 апр" }], activity: [] },
  { id: "t5", title: "Разработать API авторизации", description: "JWT + refresh tokens", status: "in_progress", priority: "high", projectId: "p2", projectName: "Разработка", projectColor: "#3b82f6", assigneeId: "u2", assigneeName: "Макс П.", assigneeInitials: "МП", assigneeColor: "#3b82f6", source: "manual", deadline: "2026-04-09", progress: 70, tags: ["API", "auth"], subtasks: [], comments: [], activity: [] },
  { id: "t6", title: "Обновить базу знаний по продукту", description: "Актуализировать статьи после релиза v2.0", status: "in_progress", priority: "medium", projectId: null, projectName: null, projectColor: "", assigneeId: "u5", assigneeName: "Елена С.", assigneeInitials: "ЕС", assigneeColor: "#f59e0b", source: "ai", deadline: "2026-04-15", progress: 25, tags: ["docs"], subtasks: [], comments: [], activity: [] },
  { id: "t7", title: "Подготовить КП для клиента", description: "Коммерческое предложение для ООО Рассвет", status: "review", priority: "high", projectId: "p3", projectName: "Продажи", projectColor: "#10b981", assigneeId: "u4", assigneeName: "Дмитрий К.", assigneeInitials: "ДК", assigneeColor: "#10b981", source: "crm", deadline: "2026-04-08", progress: 90, tags: ["КП"], subtasks: [], comments: [], activity: [] },
  { id: "t8", title: "Ревью дизайна нового раздела", description: "Проверить макеты от дизайнера", status: "review", priority: "medium", projectId: "p2", projectName: "Разработка", projectColor: "#3b82f6", assigneeId: "u2", assigneeName: "Макс П.", assigneeInitials: "МП", assigneeColor: "#3b82f6", source: "manual", deadline: "2026-04-11", progress: 80, tags: [], subtasks: [], comments: [], activity: [] },
  { id: "t9", title: "Провести вебинар для клиентов", description: "Подготовить презентацию и провести", status: "done", priority: "high", projectId: "p3", projectName: "Продажи", projectColor: "#10b981", assigneeId: "u4", assigneeName: "Дмитрий К.", assigneeInitials: "ДК", assigneeColor: "#10b981", source: "manual", deadline: "2026-04-03", progress: 100, tags: ["вебинар"], subtasks: [], comments: [], activity: [] },
  { id: "t10", title: "Написать скрипт холодного звонка", description: "Новый скрипт для отдела продаж", status: "done", priority: "medium", projectId: "p3", projectName: "Продажи", projectColor: "#10b981", assigneeId: "u3", assigneeName: "Мария С.", assigneeInitials: "МС", assigneeColor: "#ef4444", source: "ai", deadline: "2026-04-01", progress: 100, tags: ["скрипт"], subtasks: [], comments: [], activity: [] },
  { id: "t11", title: "Оформить вакансию дизайнера", description: "", status: "todo", priority: "low", projectId: "p4", projectName: "HR", projectColor: "#f59e0b", assigneeId: "u3", assigneeName: "Мария С.", assigneeInitials: "МС", assigneeColor: "#ef4444", source: "hr", deadline: "2026-04-14", progress: 0, tags: [], subtasks: [], comments: [], activity: [] },
  { id: "t12", title: "Создать курс по безопасности", description: "AI-генерация курса из материалов", status: "done", priority: "medium", projectId: null, projectName: null, projectColor: "", assigneeId: "u5", assigneeName: "Елена С.", assigneeInitials: "ЕС", assigneeColor: "#f59e0b", source: "knowledge", deadline: "2026-03-28", progress: 100, tags: ["курс", "ТБ"], subtasks: [], comments: [], activity: [] },
]

// ─── Constants ───────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskItem["status"]; label: string; color: string }[] = [
  { key: "todo",        label: "К выполнению", color: "border-l-slate-400" },
  { key: "in_progress", label: "В работе",     color: "border-l-blue-500" },
  { key: "review",      label: "На проверке",  color: "border-l-amber-500" },
  { key: "done",        label: "Готово",        color: "border-l-emerald-500" },
]

const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  urgent: { label: "Срочно",  icon: <AlertTriangle className="size-3" />, className: "bg-red-500/15 text-red-700" },
  high:   { label: "Высокий", icon: <ArrowUp className="size-3" />,       className: "bg-orange-500/15 text-orange-700" },
  medium: { label: "Средний", icon: <Minus className="size-3" />,         className: "" },
  low:    { label: "Низкий",  icon: <ArrowDown className="size-3" />,     className: "bg-muted text-muted-foreground" },
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  ai:        { label: "AI",    className: "bg-emerald-500/15 text-emerald-700" },
  crm:       { label: "CRM",   className: "bg-blue-500/15 text-blue-700" },
  hr:        { label: "HR",    className: "bg-amber-500/15 text-amber-700" },
  knowledge: { label: "БЗ",    className: "bg-violet-500/15 text-violet-700" },
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === "done" || status === "cancelled") return false
  return new Date(deadline) < new Date()
}

function formatDeadline(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TasksKanbanPage() {
  const [taskList, setTaskList] = useState(MOCK_TASKS)
  const [filterProject, setFilterProject] = useState("all")
  const [filterAssignee, setFilterAssignee] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [filterSource, setFilterSource] = useState("all")
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskColumn, setNewTaskColumn] = useState<TaskItem["status"]>("todo")

  // Filtered tasks
  const filtered = taskList.filter((t) => {
    if (filterProject !== "all" && t.projectId !== filterProject) return false
    if (filterAssignee !== "all" && t.assigneeId !== filterAssignee) return false
    if (filterPriority !== "all" && t.priority !== filterPriority) return false
    if (filterSource !== "all" && t.source !== filterSource) return false
    return true
  })

  const getColumnTasks = (status: TaskItem["status"]) =>
    filtered
      .filter((t) => t.status === status)
      .sort((a, b) => {
        const pr = ["urgent", "high", "medium", "low"]
        return pr.indexOf(a.priority) - pr.indexOf(b.priority)
      })

  // Quick add task
  const handleQuickAdd = () => {
    if (!newTaskTitle.trim()) return
    const task: TaskItem = {
      id: `t-${Date.now()}`,
      title: newTaskTitle.trim(),
      description: "",
      status: newTaskColumn,
      priority: "medium",
      projectId: null, projectName: null, projectColor: "",
      assigneeId: null, assigneeName: "", assigneeInitials: "", assigneeColor: "#94a3b8",
      source: "manual",
      deadline: null, progress: 0, tags: [],
      subtasks: [], comments: [], activity: [],
    }
    setTaskList((prev) => [...prev, task])
    setNewTaskTitle("")
    setShowNewTask(false)
    toast.success("Задача создана")
  }

  // Update task in list
  const updateTask = (updated: TaskItem) => {
    setTaskList((prev) => prev.map((t) => t.id === updated.id ? updated : t))
    setSelectedTask(updated)
  }

  const deleteTask = (id: string) => {
    setTaskList((prev) => prev.filter((t) => t.id !== id))
    setSelectedTask(null)
    toast.success("Задача удалена")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-hidden bg-background min-w-0 flex flex-col">
          {/* Top bar */}
          <div className="border-b px-6 py-3 flex items-center gap-4 shrink-0" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <h1 className="text-lg font-semibold shrink-0">Задачи</h1>

            {/* Filters */}
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Проект" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все проекты</SelectItem>
                {MOCK_PROJECTS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Исполнитель" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {MOCK_USERS.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Приоритет" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="urgent">Срочно</SelectItem>
                <SelectItem value="high">Высокий</SelectItem>
                <SelectItem value="medium">Средний</SelectItem>
                <SelectItem value="low">Низкий</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Источник" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="manual">Ручные</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            {/* View toggle */}
            <div className="flex items-center gap-0.5 p-0.5 bg-muted rounded-lg">
              <button className="px-2 py-1 text-xs rounded-md bg-background shadow-sm font-medium">
                <LayoutGrid className="size-3.5" />
              </button>
              <button className="px-2 py-1 text-xs rounded-md text-muted-foreground">
                <List className="size-3.5" />
              </button>
              <button className="px-2 py-1 text-xs rounded-md text-muted-foreground">
                <Calendar className="size-3.5" />
              </button>
            </div>

            <Button size="sm" className="gap-1 text-xs" onClick={() => { setNewTaskColumn("todo"); setShowNewTask(true) }}>
              <Plus className="size-3.5" />
              Новая задача
            </Button>
          </div>

          {/* Kanban board */}
          <div className="flex-1 overflow-x-auto p-4" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex gap-4 h-full min-w-max">
              {COLUMNS.map((col) => {
                const colTasks = getColumnTasks(col.key)
                return (
                  <div key={col.key} className="w-[300px] shrink-0 flex flex-col">
                    {/* Column header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", col.key === "todo" ? "bg-slate-400" : col.key === "in_progress" ? "bg-blue-500" : col.key === "review" ? "bg-amber-500" : "bg-emerald-500")} />
                        <h3 className="text-sm font-semibold">{col.label}</h3>
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{colTasks.length}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="size-6" onClick={() => { setNewTaskColumn(col.key); setShowNewTask(true) }}>
                        <Plus className="size-3.5" />
                      </Button>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {colTasks.map((task) => {
                        const pri = PRIORITY_CONFIG[task.priority]
                        const overdue = isOverdue(task.deadline, task.status)
                        const srcBadge = SOURCE_BADGE[task.source]

                        return (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className={cn(
                              "border rounded-lg p-3 bg-card cursor-pointer hover:shadow-md transition-all border-l-[3px]",
                              col.key === "todo" ? "border-l-slate-300" : col.key === "in_progress" ? "border-l-blue-500" : col.key === "review" ? "border-l-amber-500" : "border-l-emerald-500",
                              task.status === "done" && "opacity-70",
                            )}
                          >
                            {/* Title */}
                            <p className={cn("text-[13px] font-medium mb-2 leading-tight", task.status === "done" && "line-through text-muted-foreground")}>
                              {task.title}
                            </p>

                            {/* Badges row */}
                            <div className="flex items-center gap-1 flex-wrap mb-2">
                              {task.projectName && (
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5" style={{ backgroundColor: task.projectColor + "20", color: task.projectColor }}>
                                  {task.projectName}
                                </Badge>
                              )}
                              {task.priority !== "medium" && (
                                <Badge variant="secondary" className={cn("text-[10px] h-5 px-1.5 gap-0.5", pri.className)}>
                                  {pri.icon}{pri.label}
                                </Badge>
                              )}
                              {srcBadge && (
                                <Badge variant="secondary" className={cn("text-[10px] h-5 px-1.5", srcBadge.className)}>
                                  {task.source === "ai" && <Sparkles className="size-2.5 mr-0.5" />}
                                  {srcBadge.label}
                                </Badge>
                              )}
                            </div>

                            {/* Progress bar */}
                            {task.status === "in_progress" && task.progress > 0 && (
                              <div className="h-1.5 rounded-full bg-muted mb-2 overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${task.progress}%` }} />
                              </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {task.assigneeInitials && (
                                  <Avatar className="size-5">
                                    <AvatarFallback style={{ backgroundColor: task.assigneeColor }} className="text-white text-[8px] font-semibold">
                                      {task.assigneeInitials}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                {task.deadline && (
                                  <span className={cn("text-[10px] flex items-center gap-0.5", overdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                                    <Clock className="size-2.5" />
                                    {formatDeadline(task.deadline)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* ═══ Task detail dialog ═══ */}
      <Dialog open={!!selectedTask} onOpenChange={(v) => { if (!v) setSelectedTask(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle className="sr-only">Задача</DialogTitle>
                <Input
                  value={selectedTask.title}
                  onChange={(e) => updateTask({ ...selectedTask, title: e.target.value })}
                  className="text-lg font-semibold border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                />
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Description */}
                <Textarea
                  placeholder="Описание задачи..."
                  value={selectedTask.description}
                  onChange={(e) => updateTask({ ...selectedTask, description: e.target.value })}
                  rows={2}
                  className="text-sm"
                />

                {/* Fields grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Статус</Label>
                    <Select value={selectedTask.status} onValueChange={(v) => updateTask({ ...selectedTask, status: v as TaskItem["status"] })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                        <SelectItem value="cancelled">Отменена</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Приоритет</Label>
                    <Select value={selectedTask.priority} onValueChange={(v) => updateTask({ ...selectedTask, priority: v as TaskItem["priority"] })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="urgent">Срочно</SelectItem>
                        <SelectItem value="high">Высокий</SelectItem>
                        <SelectItem value="medium">Средний</SelectItem>
                        <SelectItem value="low">Низкий</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Исполнитель</Label>
                    <Select value={selectedTask.assigneeId ?? "none"} onValueChange={(v) => {
                      const u = MOCK_USERS.find((x) => x.id === v)
                      updateTask({ ...selectedTask, assigneeId: v === "none" ? null : v, assigneeName: u?.name ?? "", assigneeInitials: u?.initials ?? "", assigneeColor: u?.color ?? "" })
                    }}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {MOCK_USERS.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Проект</Label>
                    <Select value={selectedTask.projectId ?? "none"} onValueChange={(v) => {
                      const p = MOCK_PROJECTS.find((x) => x.id === v)
                      updateTask({ ...selectedTask, projectId: v === "none" ? null : v, projectName: p?.name ?? null, projectColor: p?.color ?? "" })
                    }}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без проекта</SelectItem>
                        {MOCK_PROJECTS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Дедлайн</Label>
                    <Input type="date" value={selectedTask.deadline ?? ""} onChange={(e) => updateTask({ ...selectedTask, deadline: e.target.value || null })} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Прогресс: {selectedTask.progress}%</Label>
                    <Slider value={[selectedTask.progress]} onValueChange={([v]) => updateTask({ ...selectedTask, progress: v })} max={100} step={5} className="mt-2" />
                  </div>
                </div>

                {/* Subtasks */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Подзадачи</Label>
                  {selectedTask.subtasks.map((st) => (
                    <label key={st.id} className="flex items-center gap-2">
                      <Checkbox checked={st.done} onCheckedChange={(v) => {
                        const subtasks = selectedTask.subtasks.map((s) => s.id === st.id ? { ...s, done: v === true } : s)
                        updateTask({ ...selectedTask, subtasks })
                      }} />
                      <span className={cn("text-sm", st.done && "line-through text-muted-foreground")}>{st.title}</span>
                    </label>
                  ))}
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => {
                    const title = prompt("Название подзадачи:")
                    if (title?.trim()) updateTask({ ...selectedTask, subtasks: [...selectedTask.subtasks, { id: `st-${Date.now()}`, title: title.trim(), done: false }] })
                  }}>
                    <Plus className="size-3" />
                    Добавить подзадачу
                  </Button>
                </div>

                {/* Comments */}
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-semibold">Комментарии</Label>
                  {selectedTask.comments.length === 0 && <p className="text-xs text-muted-foreground">Нет комментариев</p>}
                  {selectedTask.comments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <Avatar className="size-6 shrink-0"><AvatarFallback style={{ backgroundColor: c.color }} className="text-white text-[8px]">{c.initials}</AvatarFallback></Avatar>
                      <div>
                        <p className="text-xs"><span className="font-medium">{c.author}</span> <span className="text-muted-foreground">· {c.date}</span></p>
                        <p className="text-sm">{c.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Написать комментарий..."
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                          const text = (e.target as HTMLInputElement).value.trim()
                          updateTask({ ...selectedTask, comments: [...selectedTask.comments, { id: `c-${Date.now()}`, author: "Вы", initials: "ВЫ", color: "#3b82f6", text, date: "сейчас" }] });
                          (e.target as HTMLInputElement).value = ""
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Activity */}
                {selectedTask.activity.length > 0 && (
                  <div className="space-y-1 border-t pt-3">
                    <Label className="text-xs font-semibold">История</Label>
                    {selectedTask.activity.map((a) => (
                      <p key={a.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{a.user}</span> {a.action} · {a.date}
                      </p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="destructive" size="sm" className="gap-1" onClick={() => deleteTask(selectedTask.id)}>
                    <Trash2 className="size-3.5" />
                    Удалить
                  </Button>
                  <Button size="sm" className="gap-1" onClick={() => { toast.success("Сохранено"); setSelectedTask(null) }}>
                    <Save className="size-3.5" />
                    Сохранить
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick add dialog */}
      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новая задача</DialogTitle></DialogHeader>
          <Input placeholder="Название задачи" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()} className="h-10" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewTask(false)}>Отмена</Button>
            <Button onClick={handleQuickAdd} disabled={!newTaskTitle.trim()}>Создать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
