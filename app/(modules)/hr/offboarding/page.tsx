"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  UserMinus, Plus, Search, CheckCircle2, Circle, Clock, ArrowRight,
  MessageSquare, Users, Handshake,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ChecklistItem {
  id: string
  title: string
  done: boolean
  assignedTo: string
}

interface OffboardingCase {
  id: string
  employeeId: string
  employeeName: string | null
  department: string | null
  position: string | null
  reason: string
  status: string
  lastWorkDay: string | null
  checklistJson: ChecklistItem[] | null
  referralBridge: boolean
  rehireEligible: boolean
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  initiated:      { label: "Начат",           color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  in_progress:    { label: "В процессе",      color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  exit_interview: { label: "Exit-интервью",   color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  completed:      { label: "Завершён",        color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  cancelled:      { label: "Отменён",         color: "bg-muted text-muted-foreground" },
}

const REASON_LABELS: Record<string, string> = {
  voluntary:    "По собственному",
  involuntary:  "По инициативе компании",
  retirement:   "Выход на пенсию",
  contract_end: "Окончание договора",
  mutual:       "По соглашению сторон",
}

export default function OffboardingPage() {
  const [cases, setCases] = useState<OffboardingCase[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/hr/offboarding")
      setCases(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const seedDemo = async () => {
    await fetch("/api/modules/hr/offboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed-demo" }),
    })
    load()
  }

  const toggleChecklist = async (caseId: string, itemId: string) => {
    const c = cases.find(x => x.id === caseId)
    if (!c || !c.checklistJson) return

    const updated = c.checklistJson.map(item =>
      item.id === itemId ? { ...item, done: !item.done } : item
    )

    await fetch(`/api/modules/hr/offboarding/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistJson: updated }),
    })

    setCases(prev => prev.map(x =>
      x.id === caseId ? { ...x, checklistJson: updated } : x
    ))
  }

  const filtered = cases.filter(c =>
    !search ||
    (c.employeeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.department ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Offboarding" subtitle="Увольнение и передача дел" />
        <main className="p-6 space-y-6">

          {/* Сводка */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Всего кейсов</p>
              <p className="text-2xl font-semibold">{cases.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">В процессе</p>
              <p className="text-2xl font-semibold">{cases.filter(c => c.status !== "completed" && c.status !== "cancelled").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Завершено</p>
              <p className="text-2xl font-semibold">{cases.filter(c => c.status === "completed").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Реферальный мост</p>
              <p className="text-2xl font-semibold">{cases.filter(c => c.referralBridge).length}</p>
            </div>
          </div>

          {/* Тулбар */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex-1" />
            {cases.length === 0 && !loading && (
              <Button size="sm" variant="outline" onClick={seedDemo}>Загрузить демо</Button>
            )}
          </div>

          {/* Список */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <UserMinus className="size-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Нет кейсов offboarding</p>
              <Button size="sm" onClick={seedDemo}><Plus className="size-4 mr-1.5" />Загрузить демо</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(c => {
                const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.initiated
                const checklist = c.checklistJson ?? []
                const doneCount = checklist.filter(i => i.done).length
                const totalCount = checklist.length
                const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
                const daysLeft = c.lastWorkDay
                  ? Math.ceil((new Date(c.lastWorkDay).getTime() - Date.now()) / 86400000)
                  : null

                return (
                  <div key={c.id} className="border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        <UserMinus className="size-5 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{c.employeeName}</p>
                          <Badge variant="secondary" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                          {c.referralBridge && (
                            <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400">
                              <Handshake className="size-3 mr-1" />Реферал
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.position} · {c.department} · {REASON_LABELS[c.reason] || c.reason}
                          {daysLeft !== null && daysLeft > 0 && ` · ${daysLeft} дн. до ухода`}
                          {daysLeft !== null && daysLeft <= 0 && ` · Уже ушёл`}
                        </p>

                        {/* Чеклист прогресс */}
                        <div className="mt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{doneCount}/{totalCount}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {checklist.map(item => (
                              <button
                                key={item.id}
                                onClick={() => toggleChecklist(c.id, item.id)}
                                className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50 transition-colors text-left"
                              >
                                {item.done ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Circle className="size-3.5 text-muted-foreground shrink-0" />
                                )}
                                <span className={cn(item.done && "line-through text-muted-foreground")}>{item.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
