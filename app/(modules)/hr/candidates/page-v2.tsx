"use client"

import { useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Calendar, Mail, Phone, GripVertical } from "lucide-react"

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  stage: string
  score: number | null
  vacancyId: string
  vacancyTitle: string
  createdAt: string
}

// ─── Конфиг колонок ──────────────────────────────────────────────────────────

const STAGES = [
  { id: "new",       label: "Новые",      color: "bg-slate-500" },
  { id: "screening", label: "Скрининг",   color: "bg-blue-500" },
  { id: "demo",      label: "Демо",       color: "bg-violet-500" },
  { id: "interview", label: "Интервью",   color: "bg-amber-500" },
  { id: "offer",     label: "Оффер",      color: "bg-orange-500" },
  { id: "hired",     label: "Принят",     color: "bg-emerald-500" },
  { id: "rejected",  label: "Отказ",      color: "bg-red-400" },
]

const SOURCE_LABELS: Record<string, string> = {
  direct: "Прямой отклик",
  hh: "hh.ru",
  referral: "Реферал",
  manual: "Вручную",
  avito: "Авито",
}

// ─── Канбан страница ──────────────────────────────────────────────────────────

function KanbanBoard() {
  const searchParams = useSearchParams()
  const vacancyId = searchParams.get("vacancyId")

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState<string | null>(null)
  const dragOver = useRef<string | null>(null)

  useEffect(() => {
    const url = vacancyId
      ? `/api/modules/hr/candidates-v2?vacancyId=${vacancyId}`
      : "/api/modules/hr/candidates-v2"
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setCandidates(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [vacancyId])

  const moveToStage = async (candidateId: string, newStage: string) => {
    // Оптимистичное обновление
    setCandidates((prev) =>
      prev.map((c) => c.id === candidateId ? { ...c, stage: newStage } : c)
    )
    await fetch(`/api/modules/hr/candidates-v2/${candidateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    })
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragging(id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragEnd = () => setDragging(null)

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    if (dragging && dragging !== stageId) {
      moveToStage(dragging, stageId)
    }
    dragOver.current = null
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    dragOver.current = stageId
    e.dataTransfer.dropEffect = "move"
  }

  const byStage = (stageId: string) =>
    candidates.filter((c) => c.stage === stageId)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col h-[calc(100vh-56px)]">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h1 className="text-xl font-semibold">Кандидаты</h1>
              {!loading && (
                <p className="text-sm text-muted-foreground">{candidates.length} кандидатов</p>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex gap-4 p-6 overflow-x-auto">
              {STAGES.map((s) => (
                <div key={s.id} className="w-64 shrink-0 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 p-4 overflow-x-auto flex-1 min-h-0">
              {STAGES.map((stage) => {
                const cols = byStage(stage.id)
                return (
                  <div
                    key={stage.id}
                    className="flex flex-col w-64 shrink-0"
                    onDragOver={(e) => handleDragOver(e, stage.id)}
                    onDrop={(e) => handleDrop(e, stage.id)}
                  >
                    {/* Заголовок колонки */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", stage.color)} />
                      <span className="text-sm font-medium">{stage.label}</span>
                      <Badge variant="secondary" className="ml-auto text-xs h-5">
                        {cols.length}
                      </Badge>
                    </div>

                    {/* Карточки */}
                    <div className="flex-1 space-y-2 rounded-lg bg-muted/40 p-2 min-h-[200px]">
                      {cols.map((c) => (
                        <CandidateCard
                          key={c.id}
                          candidate={c}
                          isDragging={dragging === c.id}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                      {cols.length === 0 && (
                        <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50">
                          Перетащите сюда
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function CandidateCard({
  candidate, isDragging, onDragStart, onDragEnd,
}: {
  candidate: Candidate
  isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}) {
  const initials = candidate.name
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, candidate.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none",
        "hover:border-primary/40 hover:shadow-sm transition-all",
        isDragging && "opacity-40 rotate-1 scale-95",
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar className="w-7 h-7 shrink-0">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{candidate.name}</p>
          <p className="text-xs text-muted-foreground truncate">{candidate.vacancyTitle}</p>
        </div>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
      </div>

      <div className="mt-2 space-y-1">
        {candidate.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="w-3 h-3" />
            <span className="truncate">{candidate.email}</span>
          </div>
        )}
        {candidate.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{candidate.phone}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        <span className="text-xs text-muted-foreground">
          {candidate.source ? SOURCE_LABELS[candidate.source] ?? candidate.source : "—"}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          {new Date(candidate.createdAt).toLocaleDateString("ru", { day: "numeric", month: "short" })}
        </div>
      </div>

      {candidate.score != null && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-muted-foreground">Скор</span>
            <span className="font-medium">{candidate.score}/100</span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                candidate.score >= 70 ? "bg-emerald-500" :
                candidate.score >= 40 ? "bg-amber-500" : "bg-red-400"
              )}
              style={{ width: `${candidate.score}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function CandidatesPageV2() {
  return (
    <Suspense>
      <KanbanBoard />
    </Suspense>
  )
}
