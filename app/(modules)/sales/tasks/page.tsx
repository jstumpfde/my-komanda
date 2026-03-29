"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClipboardList, Plus, AlertCircle, Clock, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Priority = "high" | "medium" | "low"

interface Task {
  id: string
  title: string
  dealOrClient: string
  assignee: string
  assigneeInitials: string
  dueDate: string
  priority: Priority
  done: boolean
  overdue: boolean
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
}

const INITIAL_TASKS: Task[] = [
  { id: "1", title: "Перезвонить по КП", dealOrClient: "ООО Техностар", assignee: "Алексей Иванов", assigneeInitials: "АИ", dueDate: "26.03.2026", priority: "high", done: false, overdue: true },
  { id: "2", title: "Отправить договор на согласование", dealOrClient: "ЗАО Капитал", assignee: "Алексей Иванов", assigneeInitials: "АИ", dueDate: "28.03.2026", priority: "high", done: false, overdue: true },
  { id: "3", title: "Подготовить презентацию для демо", dealOrClient: "ГК Вектор", assignee: "Мария Петрова", assigneeInitials: "МП", dueDate: "29.03.2026", priority: "medium", done: false, overdue: false },
  { id: "4", title: "Уточнить технические требования", dealOrClient: "АО Альфа Ресурс", assignee: "Дмитрий Козлов", assigneeInitials: "ДК", dueDate: "29.03.2026", priority: "medium", done: false, overdue: false },
  { id: "5", title: "Выставить счёт", dealOrClient: "ИТ Решения ООО", assignee: "Мария Петрова", assigneeInitials: "МП", dueDate: "30.03.2026", priority: "high", done: false, overdue: false },
  { id: "6", title: "Написать follow-up после встречи", dealOrClient: "ООО СтройГрупп", assignee: "Сергей Новиков", assigneeInitials: "СН", dueDate: "30.03.2026", priority: "low", done: false, overdue: false },
  { id: "7", title: "Согласовать скидку с руководством", dealOrClient: "ООО Горизонт", assignee: "Алексей Иванов", assigneeInitials: "АИ", dueDate: "31.03.2026", priority: "medium", done: false, overdue: false },
  { id: "8", title: "Добавить контакт в CRM", dealOrClient: "ООО Прогресс", assignee: "Сергей Новиков", assigneeInitials: "СН", dueDate: "01.04.2026", priority: "low", done: false, overdue: false },
  { id: "9", title: "Обновить карточку клиента", dealOrClient: "ООО Медиасфера", assignee: "Дмитрий Козлов", assigneeInitials: "ДК", dueDate: "02.04.2026", priority: "low", done: true, overdue: false },
  { id: "10", title: "Запланировать встречу", dealOrClient: "ГК Вектор", assignee: "Мария Петрова", assigneeInitials: "МП", dueDate: "25.03.2026", priority: "high", done: true, overdue: false },
]

const MANAGERS = ["Алексей Иванов", "Мария Петрова", "Дмитрий Козлов", "Сергей Новиков"]
const DEALS = ["ООО Техностар", "ГК Вектор", "ЗАО Капитал", "ООО Горизонт", "АО Альфа Ресурс", "ООО СтройГрупп", "ИТ Решения ООО"]

export default function SalesTasksPage() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterAssignee, setFilterAssignee] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [filterDue, setFilterDue] = useState("all")
  const [view, setView] = useState<"list" | "byEmployee">("list")

  const [form, setForm] = useState({
    title: "", description: "", assignee: "Алексей Иванов",
    dueDate: "", priority: "medium" as Priority, deal: "",
  })

  const toggleDone = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const filtered = tasks.filter(t => {
    if (filterAssignee !== "all" && t.assignee !== filterAssignee) return false
    if (filterPriority !== "all" && t.priority !== filterPriority) return false
    if (filterDue === "overdue" && !t.overdue) return false
    if (filterDue === "done" && !t.done) return false
    if (filterDue === "active" && t.done) return false
    return true
  })

  const handleCreate = () => {
    if (!form.title) { toast.error("Введите заголовок задачи"); return }
    const initials = form.assignee.split(" ").map(w => w[0]).join("").slice(0, 2)
    const newTask: Task = {
      id: String(Date.now()),
      title: form.title,
      dealOrClient: form.deal || "—",
      assignee: form.assignee,
      assigneeInitials: initials,
      dueDate: form.dueDate || "—",
      priority: form.priority,
      done: false,
      overdue: false,
    }
    setTasks(prev => [newTask, ...prev])
    setDialogOpen(false)
    setForm({ title: "", description: "", assignee: "Алексей Иванов", dueDate: "", priority: "medium", deal: "" })
    toast.success("Задача создана")
  }

  const byEmployee = MANAGERS.map(mgr => ({
    name: mgr,
    initials: mgr.split(" ").map(w => w[0]).join("").slice(0, 2),
    tasks: filtered.filter(t => t.assignee === mgr),
  }))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Задачи</h1>
                  <p className="text-sm text-muted-foreground">
                    {tasks.filter(t => t.overdue && !t.done).length} просроченных
                  </p>
                </div>
              </div>
              <Button className="gap-1.5" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4" />
                Новая задача
              </Button>
            </div>

            {/* View toggle + Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  className={cn("px-3 py-1.5 text-sm transition-colors", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground")}
                  onClick={() => setView("list")}
                >
                  Список
                </button>
                <button
                  className={cn("px-3 py-1.5 text-sm transition-colors", view === "byEmployee" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground")}
                  onClick={() => setView("byEmployee")}
                >
                  По сотрудникам
                </button>
              </div>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Все" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все сотрудники</SelectItem>
                  {MANAGERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Приоритет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все приоритеты</SelectItem>
                  <SelectItem value="high">Высокий</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="low">Низкий</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterDue} onValueChange={setFilterDue}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Срок" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="overdue">Просроченные</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="done">Выполненные</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {view === "list" && (
              <div className="border rounded-xl overflow-hidden">
                <div className="divide-y">
                  {filtered.map(task => (
                    <div key={task.id} className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors",
                      task.done && "opacity-60"
                    )}>
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={() => toggleDone(task.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={cn("text-sm font-medium text-foreground", task.done && "line-through text-muted-foreground")}>
                            {task.title}
                          </p>
                          <Badge className={cn("text-xs border-0 shrink-0", PRIORITY_COLORS[task.priority])}>
                            {PRIORITY_LABELS[task.priority]}
                          </Badge>
                          {task.overdue && !task.done && (
                            <Badge className="text-xs border-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Просрочено
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ChevronRight className="w-3 h-3" />
                            {task.dealOrClient}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {task.dueDate}
                        </div>
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{task.assigneeInitials}</AvatarFallback>
                        </Avatar>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      Нет задач по выбранным фильтрам
                    </div>
                  )}
                </div>
              </div>
            )}

            {view === "byEmployee" && (
              <div className="space-y-4">
                {byEmployee.filter(e => e.tasks.length > 0).map(emp => (
                  <div key={emp.name} className="border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-muted/30 border-b">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{emp.initials}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold text-foreground">{emp.name}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">{emp.tasks.length}</Badge>
                    </div>
                    <div className="divide-y">
                      {emp.tasks.map(task => (
                        <div key={task.id} className={cn(
                          "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors",
                          task.done && "opacity-60"
                        )}>
                          <Checkbox checked={task.done} onCheckedChange={() => toggleDone(task.id)} />
                          <div className="flex-1">
                            <p className={cn("text-sm text-foreground", task.done && "line-through text-muted-foreground")}>{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.dealOrClient}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs border-0", PRIORITY_COLORS[task.priority])}>{PRIORITY_LABELS[task.priority]}</Badge>
                            {task.overdue && !task.done && <AlertCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-xs text-muted-foreground">{task.dueDate}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* New Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Новая задача
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Заголовок *</Label>
              <Input placeholder="Что нужно сделать..." value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea placeholder="Детали задачи..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Ответственный</Label>
              <Select value={form.assignee} onValueChange={v => setForm(p => ({ ...p, assignee: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANAGERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Срок</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Приоритет</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as Priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Высокий</SelectItem>
                    <SelectItem value="medium">Средний</SelectItem>
                    <SelectItem value="low">Низкий</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Привязать к сделке</Label>
              <Select value={form.deal} onValueChange={v => setForm(p => ({ ...p, deal: v }))}>
                <SelectTrigger><SelectValue placeholder="Без привязки" /></SelectTrigger>
                <SelectContent>
                  {DEALS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Отмена</Button>
              <Button className="flex-1" onClick={handleCreate}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
