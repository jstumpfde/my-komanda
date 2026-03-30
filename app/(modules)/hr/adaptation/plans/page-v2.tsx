"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebarV2 } from "@/components/dashboard/sidebar-v2"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, ListChecks, Clock, Users } from "lucide-react"

interface Plan {
  id: string
  title: string
  description: string | null
  durationDays: number | null
  planType: string | null
  isActive: boolean | null
  stepsCount: number
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  onboarding: "Онбординг", preboarding: "Пребординг", reboarding: "Рибординг",
}

export default function AdaptationPlansPageV2() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)

  const load = () => {
    fetch("/api/modules/hr/adaptation-v2/plans")
      .then((r) => r.json())
      .then((d) => { setPlans(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const res = await fetch("/api/modules/hr/adaptation-v2/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    })
    if (res.ok) { setOpen(false); setNewTitle(""); load() }
    setCreating(false)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebarV2 />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Планы адаптации</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{plans.length} планов</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Создать план</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новый план адаптации</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Название</Label>
                    <Input
                      placeholder="Например: Онбординг разработчика"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                      autoFocus
                    />
                  </div>
                  <Button onClick={handleCreate} disabled={!newTitle.trim() || creating} className="w-full">
                    Создать
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="grid gap-3">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <ListChecks className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Планов пока нет</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {plans.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/hr/adaptation/plans/${plan.id}`}
                  className="group rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium group-hover:text-primary transition-colors">
                          {plan.title}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {TYPE_LABELS[plan.planType ?? "onboarding"] ?? plan.planType}
                        </Badge>
                        {!plan.isActive && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Неактивен</Badge>
                        )}
                      </div>
                      {plan.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{plan.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0 ml-4">
                      <span className="flex items-center gap-1">
                        <ListChecks className="w-3.5 h-3.5" />
                        {plan.stepsCount} шагов
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {plan.durationDays} дн.
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
