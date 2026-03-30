"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Users, CheckCircle2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface Assignment {
  id: string
  planId: string
  planTitle: string
  employeeId: string | null
  status: string
  currentDay: number | null
  completionPct: number | null
  totalSteps: number | null
  completedSteps: number | null
  startDate: string | null
  createdAt: string
}

interface Plan { id: string; title: string }

const STATUS_LABELS: Record<string, string> = {
  active: "Активно", paused: "Пауза", cancelled: "Отменено", completed: "Завершено",
}
const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-500/15 text-blue-700",
  completed: "bg-emerald-500/15 text-emerald-700",
  paused: "bg-amber-500/15 text-amber-700",
  cancelled: "bg-muted text-muted-foreground",
}

export default function AssignmentsPageV2() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [planId, setPlanId] = useState("")
  const [creating, setCreating] = useState(false)

  const load = () => {
    fetch("/api/modules/hr/adaptation-v2/assignments")
      .then((r) => r.json())
      .then((d) => { setAssignments(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
    fetch("/api/modules/hr/adaptation-v2/plans")
      .then((r) => r.json())
      .then((d) => setPlans(Array.isArray(d) ? d : []))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!planId) return
    setCreating(true)
    const res = await fetch("/api/modules/hr/adaptation-v2/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    })
    if (res.ok) { setOpen(false); setPlanId(""); load() }
    setCreating(false)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Назначения</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{assignments.length} назначений</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Назначить план</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новое назначение</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>План адаптации</Label>
                    <Select value={planId} onValueChange={setPlanId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите план..." />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreate} disabled={!planId || creating} className="w-full">
                    Создать назначение
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="grid gap-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <Users className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Назначений пока нет</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {assignments.map((a) => {
                const pct = a.completionPct ?? 0
                return (
                  <Link
                    key={a.id}
                    href={`/hr/adaptation/assignments/${a.id}`}
                    className="group rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium group-hover:text-primary transition-colors">
                            {a.planTitle}
                          </span>
                          <Badge variant="secondary" className={cn("text-xs", STATUS_COLORS[a.status] ?? "")}>
                            {STATUS_LABELS[a.status] ?? a.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            День {a.currentDay}
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {a.completedSteps}/{a.totalSteps} шагов
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold">{pct}%</div>
                        <div className="w-20 h-1.5 bg-muted rounded-full mt-1">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
