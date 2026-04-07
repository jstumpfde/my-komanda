"use client"

import { useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Plus, FolderKanban, CheckSquare, Clock, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planning:  { label: "Планирование", className: "bg-slate-500/15 text-slate-700" },
  active:    { label: "Активный",     className: "bg-blue-500/15 text-blue-700" },
  paused:    { label: "На паузе",     className: "bg-amber-500/15 text-amber-700" },
  completed: { label: "Завершён",     className: "bg-emerald-500/15 text-emerald-700" },
}

const MOCK_PROJECTS = [
  { id: "p1", title: "Маркетинг Q2",       description: "Маркетинговые активности на второй квартал", status: "active",    color: "#a855f7", progress: 45, tasksTotal: 12, tasksDone: 5, owner: "Анна И.",    ownerInitials: "АИ", ownerColor: "#8b5cf6", deadline: "2026-06-30" },
  { id: "p2", title: "Редизайн платформы", description: "Обновление UI/UX всех разделов",            status: "active",    color: "#3b82f6", progress: 30, tasksTotal: 24, tasksDone: 7, owner: "Макс П.",    ownerInitials: "МП", ownerColor: "#3b82f6", deadline: "2026-05-15" },
  { id: "p3", title: "Автоматизация продаж", description: "Внедрение CRM-автоматизаций",             status: "active",    color: "#10b981", progress: 60, tasksTotal: 8,  tasksDone: 5, owner: "Дмитрий К.", ownerInitials: "ДК", ownerColor: "#10b981", deadline: "2026-04-30" },
  { id: "p4", title: "Найм Q2",            description: "Закрытие вакансий на Q2",                   status: "planning",  color: "#f59e0b", progress: 10, tasksTotal: 6,  tasksDone: 1, owner: "Мария С.",   ownerInitials: "МС", ownerColor: "#ef4444", deadline: "2026-06-30" },
  { id: "p5", title: "Онбординг 2.0",      description: "Новый процесс адаптации",                  status: "completed", color: "#06b6d4", progress: 100, tasksTotal: 15, tasksDone: 15, owner: "Елена С.",   ownerInitials: "ЕС", ownerColor: "#f59e0b", deadline: "2026-03-30" },
]

export default function TaskProjectsPage() {
  const [projects] = useState(MOCK_PROJECTS)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <FolderKanban className="size-5 text-sky-500" />
                <h1 className="text-xl font-semibold">Проекты</h1>
              </div>
              <Button className="gap-1.5" onClick={() => setShowNew(true)}>
                <Plus className="size-4" />
                Новый проект
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map((p) => {
                const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.active
                return (
                  <Link key={p.id} href={`/tasks?project=${p.id}`} className="group block border rounded-xl p-5 bg-card transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{p.title}</h3>
                      </div>
                      <Badge variant="secondary" className={cn("text-[10px] shrink-0", st.className)}>{st.label}</Badge>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-1 mb-3">{p.description}</p>}

                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span>{p.tasksDone} из {p.tasksTotal} задач</span>
                        <span>{p.progress}%</span>
                      </div>
                      <Progress value={p.progress} className="h-1.5" />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="size-5">
                          <AvatarFallback style={{ backgroundColor: p.ownerColor }} className="text-white text-[8px]">{p.ownerInitials}</AvatarFallback>
                        </Avatar>
                        <span>{p.owner}</span>
                      </div>
                      {p.deadline && (
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {new Date(p.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </SidebarInset>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новый проект</DialogTitle></DialogHeader>
          <Input placeholder="Название проекта" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) { toast.success("Проект создан"); setShowNew(false); setNewTitle("") } }} className="h-10" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNew(false)}>Отмена</Button>
            <Button onClick={() => { toast.success("Проект создан"); setShowNew(false); setNewTitle("") }} disabled={!newTitle.trim()}>Создать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
