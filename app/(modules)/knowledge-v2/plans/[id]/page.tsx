"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, BookOpen, FileText, Users, Calendar, CheckCircle2, Clock, AlertTriangle, Award } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
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
  createdAt: string
}

interface Assignment {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  status: "assigned" | "in_progress" | "completed" | "overdue"
  progress: Record<string, { started_at?: string; completed_at?: string; score?: number }>
  assignedAt: string
  deadline: string | null
  completedAt: string | null
  certificateUrl?: string | null
}

const STATUS_META: Record<Assignment["status"], { label: string; icon: typeof Clock; className: string }> = {
  assigned:    { label: "Назначено",  icon: Clock,          className: "text-muted-foreground" },
  in_progress: { label: "В процессе", icon: Clock,          className: "text-blue-500" },
  completed:   { label: "Завершено",  icon: CheckCircle2,   className: "text-green-600" },
  overdue:     { label: "Просрочено", icon: AlertTriangle,  className: "text-red-500" },
}

export default function LearningPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [materialsIndex, setMaterialsIndex] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/knowledge/learning-plans/${id}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (cancelled) return
        if (data.error) {
          setLoading(false)
          return
        }
        setPlan(data.plan)
        setAssignments(data.assignments ?? [])

        // Best-effort resolve material titles from both sources
        const [demosRes, articlesRes] = await Promise.all([
          fetch("/api/demo-templates").then((r) => r.ok ? r.json() : []).catch(() => []),
          fetch("/api/modules/knowledge/articles").then((r) => r.ok ? r.json() : { articles: [] }).catch(() => ({ articles: [] })),
        ])
        const idx: Record<string, string> = {}
        const demos: { id: string; name: string }[] = Array.isArray(demosRes) ? demosRes : (demosRes.data ?? [])
        for (const d of demos) idx[d.id] = d.name
        for (const a of (articlesRes.articles ?? [])) idx[a.id] = a.title
        if (!cancelled) setMaterialsIndex(idx)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex items-center justify-center h-96 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Загрузка...
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!plan) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex flex-col items-center justify-center h-96 gap-3 text-muted-foreground">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">План не найден</p>
            <Link href="/knowledge-v2/plans" className="text-sm text-primary hover:underline">
              Назад к списку
            </Link>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const orderedMaterials = [...plan.materials].sort((a, b) => a.order - b.order)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <Link
                  href="/knowledge-v2/plans"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Все планы
                </Link>
                <h1 className="text-xl font-semibold">{plan.title}</h1>
                {plan.description && (
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
                    <BookOpen className="w-3.5 h-3.5" />
                    Материалов
                  </div>
                  <div className="text-2xl font-semibold mt-1">{orderedMaterials.length}</div>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
                    <Users className="w-3.5 h-3.5" />
                    Назначено
                  </div>
                  <div className="text-2xl font-semibold mt-1">{assignments.length}</div>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Завершили
                  </div>
                  <div className="text-2xl font-semibold mt-1 text-green-600">
                    {assignments.filter((a) => a.status === "completed").length}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-3">Материалы</h2>
                {orderedMaterials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет материалов</p>
                ) : (
                  <div className="space-y-2">
                    {orderedMaterials.map((m, i) => {
                      const title = materialsIndex[m.materialId] ?? m.materialId
                      const Icon = m.materialType === "demo" ? BookOpen : FileText
                      return (
                        <div
                          key={m.materialId}
                          className="flex items-center gap-3 rounded-lg border border-border p-3"
                        >
                          <span className="font-mono text-xs text-muted-foreground w-6">{i + 1}.</span>
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-sm">{title}</span>
                          <span className="text-xs uppercase text-muted-foreground">
                            {m.materialType === "demo" ? "Демо" : "Статья"}
                          </span>
                          {m.required && (
                            <span className="text-xs text-orange-500">обязательно</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-3">Назначено</h2>
                {assignments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-10 text-center">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Пока никому не назначено</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b border-border">
                        <tr className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-3">Сотрудник</th>
                          <th className="px-4 py-3">Статус</th>
                          <th className="px-4 py-3">Дедлайн</th>
                          <th className="px-4 py-3">Назначено</th>
                          <th className="px-4 py-3 text-right">Сертификат</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {assignments.map((a) => {
                          const meta = STATUS_META[a.status] ?? STATUS_META.assigned
                          const Icon = meta.icon
                          return (
                            <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-medium">{a.userName ?? "—"}</div>
                                <div className="text-xs text-muted-foreground">{a.userEmail}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn("inline-flex items-center gap-1.5 text-xs", meta.className)}>
                                  <Icon className="w-3.5 h-3.5" />
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {a.deadline ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(a.deadline).toLocaleDateString("ru-RU")}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(a.assignedAt).toLocaleDateString("ru-RU")}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {a.status === "completed" && a.certificateUrl ? (
                                  <Link
                                    href={a.certificateUrl}
                                    target="_blank"
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                                  >
                                    <Award className="w-3.5 h-3.5" />
                                    Скачать сертификат
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
