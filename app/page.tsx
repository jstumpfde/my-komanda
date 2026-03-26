"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { KanbanBoard, type ViewMode } from "@/components/dashboard/kanban-board"
import { CardSettings, type CardDisplaySettings } from "@/components/dashboard/card-settings"
import { CandidateFilters, type FilterState } from "@/components/dashboard/candidate-filters"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Plus, Filter } from "lucide-react"
import { toast } from "sonner"
import { defaultColumnColors, getNextColumnId, PROGRESS_BY_COLUMN, type CandidateAction } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { CandidateProfile } from "@/components/dashboard/candidate-profile"
import { AddCandidateDialog } from "@/components/dashboard/add-candidate-dialog"
import { getOnboarding, isOnboardingComplete, remainingSteps } from "@/lib/onboarding"
import { Rocket } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

interface ColumnData {
  id: string
  title: string
  count: number
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

const defaultSettings: CardDisplaySettings = {
  showSalary: true,
  showSalaryFull: false,
  showScore: true,
  showProgress: true,
  showSource: true,
  showCity: true,
  showExperience: true,
  showSkills: true,
  showActions: true,
}

function emptyColumns(): ColumnData[] {
  return Object.entries(defaultColumnColors).map(([id, c]) => ({
    id, title: c.label, count: 0,
    colorFrom: c.from, colorTo: c.to, candidates: [],
  }))
}

export default function DashboardPage() {
  const [cardSettings, setCardSettings] = useState<CardDisplaySettings>(defaultSettings)
  const [viewMode, setViewMode] = useState<ViewMode>("funnel")
  const [columns, setColumns] = useState<ColumnData[]>(emptyColumns)
  const [filters, setFilters] = useState<FilterState>({
    searchText: "",
    cities: [],
    salaryMin: 0,
    salaryMax: 250000,
    scoreMin: 0,
    sources: [],
    workFormats: [],
  })
  const [profileCandidate, setProfileCandidate] = useState<Candidate | null>(null)
  const [profileColumnId, setProfileColumnId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [onboardingRemaining, setOnboardingRemaining] = useState(0)
  const [onboardingDone, setOnboardingDone] = useState(true)

  useEffect(() => {
    const ob = getOnboarding()
    setOnboardingDone(isOnboardingComplete(ob))
    setOnboardingRemaining(remainingSteps(ob))
  }, [])

  const handleAddCandidate = (candidate: Candidate) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== "new") return col
        const newCandidates = [...col.candidates, candidate]
        return { ...col, candidates: newCandidates, count: newCandidates.length }
      })
    )
    toast.success(`${candidate.name} добавлен`, {
      description: 'Кандидат добавлен в этап "Новые"',
    })
  }

  const handleOpenProfile = (candidate: Candidate, columnId: string) => {
    setProfileCandidate(candidate)
    setProfileColumnId(columnId)
  }

  const handleAction = (candidateId: string, columnId: string, action: CandidateAction) => {
    const sourceColumn = columns.find((c) => c.id === columnId)
    const candidate = sourceColumn?.candidates.find((c) => c.id === candidateId)
    if (!candidate || !sourceColumn) return

    if (action === "reject") {
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== columnId) return col
          const newCandidates = col.candidates.filter((c) => c.id !== candidateId)
          return { ...col, candidates: newCandidates, count: newCandidates.length }
        })
      )
      toast.error(`${candidate.name} — отказ`, {
        description: `Кандидат удалён из этапа "${sourceColumn.title}"`,
      })
      return
    }

    if (action === "reserve") {
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== columnId) return col
          const newCandidates = col.candidates.filter((c) => c.id !== candidateId)
          return { ...col, candidates: newCandidates, count: newCandidates.length }
        })
      )
      toast.warning(`${candidate.name} — в резерв`, {
        description: "Кандидат перемещён в резерв",
      })
      return
    }

    if (action === "think") {
      toast("🤔 Подумаем над кандидатом", { description: candidate.name })
      return
    }

    if (action === "hire") {
      // Перемещаем в "Нанят"
      const movedCandidate = { ...candidate, progress: 100 }
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id === columnId) {
            const nc = col.candidates.filter((c) => c.id !== candidateId)
            return { ...col, candidates: nc, count: nc.length }
          }
          if (col.id === "hired") {
            const nc = [...col.candidates, movedCandidate]
            return { ...col, candidates: nc, count: nc.length }
          }
          return col
        })
      )
      toast.success(`🎉 ${candidate.name} — нанят!`)
      return
    }

    if (action === "advance") {
      const nextColumnId = getNextColumnId(columnId)

      if (!nextColumnId) {
        setColumns((prev) =>
          prev.map((col) => {
            if (col.id !== columnId) return col
            const newCandidates = col.candidates.filter((c) => c.id !== candidateId)
            return { ...col, candidates: newCandidates, count: newCandidates.length }
          })
        )
        toast.success(`${candidate.name} — нанят!`)
        return
      }

      const movedCandidate = {
        ...candidate,
        progress: PROGRESS_BY_COLUMN[nextColumnId] ?? candidate.progress,
      }

      setColumns((prev) =>
        prev.map((col) => {
          if (col.id === columnId) {
            const newCandidates = col.candidates.filter((c) => c.id !== candidateId)
            return { ...col, candidates: newCandidates, count: newCandidates.length }
          }
          if (col.id === nextColumnId) {
            const newCandidates = [...col.candidates, movedCandidate]
            return { ...col, candidates: newCandidates, count: newCandidates.length }
          }
          return col
        })
      )
      toast.success(`${candidate.name} → ${nextColumn?.title}`, {
        description: `Кандидат перемещён на следующий этап`,
      })
    }
  }

  const applyFilters = (cols: ColumnData[]): ColumnData[] => {
    return cols.map((column) => ({
      ...column,
      candidates: column.candidates.filter((candidate) => {
        // Search by name
        if (
          filters.searchText &&
          !candidate.name.toLowerCase().includes(filters.searchText.toLowerCase())
        ) {
          return false
        }

        // Filter by cities
        if (filters.cities.length > 0 && !filters.cities.includes(candidate.city)) {
          return false
        }

        // Filter by salary
        if (candidate.salaryMin < filters.salaryMin || candidate.salaryMax > filters.salaryMax) {
          if (!(candidate.salaryMin >= filters.salaryMin && candidate.salaryMin <= filters.salaryMax)) {
            return false
          }
        }

        // Filter by score
        if (candidate.score < filters.scoreMin) {
          return false
        }

        // Filter by sources
        if (filters.sources.length > 0 && !filters.sources.includes(candidate.source)) {
          return false
        }

        // Filter by work format
        if (filters.workFormats.length > 0) {
          const fmt = (candidate as any).workFormat || "office"
          if (!filters.workFormats.includes(fmt)) return false
        }

        return true
      }),
      count: column.candidates.filter((candidate) => {
        if (
          filters.searchText &&
          !candidate.name.toLowerCase().includes(filters.searchText.toLowerCase())
        ) {
          return false
        }
        if (filters.cities.length > 0 && !filters.cities.includes(candidate.city)) {
          return false
        }
        if (candidate.salaryMin < filters.salaryMin || candidate.salaryMax > filters.salaryMax) {
          if (!(candidate.salaryMin >= filters.salaryMin && candidate.salaryMin <= filters.salaryMax)) {
            return false
          }
        }
        if (candidate.score < filters.scoreMin) {
          return false
        }
        if (filters.sources.length > 0 && !filters.sources.includes(candidate.source)) {
          return false
        }
        if (filters.workFormats.length > 0) {
          const fmt = (candidate as any).workFormat || "office"
          if (!filters.workFormats.includes(fmt)) return false
        }
        return true
      }).length,
    }))
  }

  const filteredColumns = applyFilters(columns)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            {/* Onboarding checklist */}
            {!onboardingDone && onboardingRemaining > 0 && (
              <div className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <Rocket className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Настройте платформу: осталось {onboardingRemaining} {onboardingRemaining === 1 ? "шаг" : onboardingRemaining < 5 ? "шага" : "шагов"}</p>
                    <p className="text-xs text-muted-foreground">Завершите настройку, чтобы получить максимум от Моя Команда</p>
                  </div>
                </div>
                <Button size="sm" asChild>
                  <Link href="/register">Продолжить настройку</Link>
                </Button>
              </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                    Воронка найма
                  </h1>
                </div>
                <p className="text-muted-foreground text-sm">
                  {columns.reduce((acc, col) => acc + col.candidates.length, 0)} кандидатов в воронке
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CandidateFilters filters={filters} onFiltersChange={setFilters} candidates={columns.flatMap((c) => c.candidates)} />
                <CardSettings settings={cardSettings} onSettingsChange={setCardSettings} />
                <Button size="sm" className="h-9" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="size-4 mr-2" />
                  Добавить
                </Button>
              </div>
            </div>
            
            {/* Board / List / Funnel */}
            <KanbanBoard
              settings={cardSettings}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              columns={filteredColumns}
              onColumnsChange={setColumns}
              onOpenProfile={handleOpenProfile}
              onAction={handleAction}
            />
          </div>
        </main>
      </SidebarInset>

      <AddCandidateDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddCandidate}
      />

      {/* Candidate Profile Sheet */}
      {(() => {
        const col = profileColumnId ? columns.find((c) => c.id === profileColumnId) : null
        return (
          <CandidateProfile
            candidate={profileCandidate}
            columnId={profileColumnId ?? undefined}
            columnTitle={col?.title}
            columnColorFrom={col?.colorFrom}
            columnColorTo={col?.colorTo}
            open={!!profileCandidate}
            onOpenChange={(open) => {
              if (!open) {
                setProfileCandidate(null)
                setProfileColumnId(null)
              }
            }}
            onAction={handleAction}
          />
        )
      })()}
    </SidebarProvider>
  )
}
