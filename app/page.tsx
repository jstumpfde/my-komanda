"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { KanbanBoard, type ViewMode } from "@/components/dashboard/kanban-board"
import { CardSettings, type CardDisplaySettings } from "@/components/dashboard/card-settings"
import { CandidateFilters, type FilterState } from "@/components/dashboard/candidate-filters"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, Filter, Clock, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { defaultColumnColors, getNextColumnId, PROGRESS_BY_COLUMN, type CandidateAction } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { CandidateProfile } from "@/components/dashboard/candidate-profile"
import { AddCandidateDialog } from "@/components/dashboard/add-candidate-dialog"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { useLocalStorage } from "@/hooks/use-local-storage"
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

const initialColumns: ColumnData[] = [
  {
    id: "new", title: "Новые", count: 2,
    colorFrom: defaultColumnColors.new.from, colorTo: defaultColumnColors.new.to,
    candidates: [
      { id: "1", name: "Иван Петров", city: "Москва", salaryMin: 150000, salaryMax: 180000, score: 88, progress: 5, source: "hh.ru", experience: "5 лет в B2B", skills: ["CRM", "B2B", "Переговоры"], addedAt: new Date(Date.now() - 3600000), lastSeen: "online" },
      { id: "2", name: "Мария Сидорова", city: "СПб", salaryMin: 140000, salaryMax: 170000, score: 76, progress: 5, source: "Avito", experience: "3 года в ритейле", skills: ["Продажи", "Сервис"], addedAt: new Date(Date.now() - 7200000), lastSeen: new Date(Date.now() - 3600000) },
    ],
  },
  {
    id: "awaiting", title: "Ожидает ответа", count: 2,
    colorFrom: defaultColumnColors.awaiting.from, colorTo: defaultColumnColors.awaiting.to,
    candidates: [
      { id: "3", name: "Алексей Козлов", city: "Москва", salaryMin: 160000, salaryMax: 190000, score: 92, progress: 15, source: "Telegram", experience: "7 лет, Team Lead", skills: ["Управление", "SaaS"], addedAt: new Date(Date.now() - 86400000), lastSeen: new Date(Date.now() - 900000), utmSource: "TG канал HR" },
      { id: "10", name: "Анна Белова", city: "Казань", salaryMin: 120000, salaryMax: 150000, score: 71, progress: 15, source: "hh.ru", experience: "2 года в продажах", skills: ["Звонки", "CRM"], addedAt: new Date(Date.now() - 172800000), lastSeen: new Date(Date.now() - 7200000) },
    ],
  },
  {
    id: "demo", title: "Демонстрация", count: 2,
    colorFrom: defaultColumnColors.demo.from, colorTo: defaultColumnColors.demo.to,
    candidates: [
      { id: "4", name: "Елена Волкова", city: "Москва", salaryMin: 155000, salaryMax: 185000, score: 81, progress: 35, source: "hh.ru", experience: "4 года в IT-продажах", skills: ["IT Sales", "Enterprise"], addedAt: new Date(Date.now() - 14 * 86400000), lastSeen: "online", demoProgress: 8, demoTotal: 12, demoTimeMin: 12 },
      { id: "5", name: "Сергей Морозов", city: "Казань", salaryMin: 145000, salaryMax: 175000, score: 68, progress: 35, source: "LinkedIn", experience: "2 года", skills: ["Звонки", "CRM"], addedAt: new Date(Date.now() - 21 * 86400000), lastSeen: new Date(Date.now() - 86400000), demoProgress: 3, demoTotal: 12, demoTimeMin: 5 },
    ],
  },
  {
    id: "hr_decision", title: "Решение HR", count: 2,
    colorFrom: defaultColumnColors.hr_decision.from, colorTo: defaultColumnColors.hr_decision.to,
    candidates: [
      { id: "6", name: "Ольга Новикова", city: "Москва", salaryMin: 150000, salaryMax: 180000, score: 85, progress: 60, source: "hh.ru", experience: "6 лет в FMCG", skills: ["FMCG", "Дистрибуция"], addedAt: new Date(Date.now() - 30 * 86400000), lastSeen: new Date(Date.now() - 1800000), demoProgress: 12, demoTotal: 12, demoTimeMin: 18, aiSummary: "Сильный опыт в FMCG, хорошие коммуникативные навыки. Ответы на вопросы показали глубокое понимание продаж." },
      { id: "7", name: "Дмитрий Смирнов", city: "СПб", salaryMin: 140000, salaryMax: 170000, score: 72, progress: 60, source: "Avito", experience: "3 года в телекоме", skills: ["B2C", "Upselling"], addedAt: new Date(Date.now() - 25 * 86400000), lastSeen: new Date(Date.now() - 18000000), demoProgress: 12, demoTotal: 12, demoTimeMin: 22, aiSummary: "Средний опыт, но мотивирован. Упомянул стремление к росту дохода и карьере." },
    ],
  },
  {
    id: "interview", title: "Интервью", count: 1,
    colorFrom: defaultColumnColors.interview.from, colorTo: defaultColumnColors.interview.to,
    candidates: [
      { id: "8", name: "Виктор Лебедев", city: "Москва", salaryMin: 160000, salaryMax: 190000, score: 79, progress: 75, source: "hh.ru", experience: "5 лет, Key Account", skills: ["Key Account", "Переговоры"], addedAt: new Date(Date.now() - 45 * 86400000), lastSeen: "online", demoProgress: 12, demoTotal: 12, interviewDate: new Date(Date.now() + 2 * 86400000), interviewTime: "14:00" },
    ],
  },
  {
    id: "final_decision", title: "Финальное решение", count: 1,
    colorFrom: defaultColumnColors.final_decision.from, colorTo: defaultColumnColors.final_decision.to,
    candidates: [
      { id: "9", name: "Юлия Орлова", city: "Москва", salaryMin: 170000, salaryMax: 200000, score: 94, progress: 90, source: "hh.ru", experience: "8 лет, Head of Sales", skills: ["Управление", "Стратегия", "P&L"], addedAt: new Date(Date.now() - 60 * 86400000), lastSeen: new Date(Date.now() - 600000), demoProgress: 12, demoTotal: 12, aiSummary: "Отличный кандидат. 8 лет опыта, управленческие навыки. Идеально подходит для позиции." },
    ],
  },
  {
    id: "hired", title: "Нанят 🎉", count: 1,
    colorFrom: defaultColumnColors.hired.from, colorTo: defaultColumnColors.hired.to,
    candidates: [
      { id: "11", name: "Павел Соколов", city: "Москва", salaryMin: 155000, salaryMax: 180000, score: 87, progress: 100, source: "hh.ru", experience: "4 года B2B", skills: ["B2B", "CRM"], addedAt: new Date(Date.now() - 90 * 86400000), lastSeen: new Date(Date.now() - 86400000), demoProgress: 12, demoTotal: 12 },
    ],
  },
]

const VACANCY_OPENED_AT = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000)
const VACANCY_DURATION_DAYS = 30
const VACANCY_EXPIRES_AT = new Date(VACANCY_OPENED_AT.getTime() + VACANCY_DURATION_DAYS * 24 * 60 * 60 * 1000)

export default function DashboardPage() {
  const [cardSettings, setCardSettings] = useState<CardDisplaySettings>(defaultSettings)
  const [viewMode, setViewMode] = useState<ViewMode>("funnel")
  const [columns, setColumns] = useLocalStorage<ColumnData[]>("hireflow-columns", initialColumns)
  const [filters, setFilters] = useState<FilterState>({
    searchText: "",
    cities: [],
    salaryMin: 0,
    salaryMax: 250000,
    scoreMin: 0,
    sources: [],
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
        return true
      }).length,
    }))
  }

  const filteredColumns = applyFilters(columns)

  const daysRemaining = Math.ceil((VACANCY_EXPIRES_AT.getTime() - Date.now()) / 86400000)
  const isExpiringSoon = daysRemaining <= 3 && daysRemaining > 0
  const isExpired = daysRemaining <= 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            {/* Expiring warning */}
            {isExpiringSoon && (
              <Alert variant="destructive" className="mb-6 border-indigo-200 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-800">
                <AlertCircle className="text-indigo-600 dark:text-indigo-400" />
                <AlertTitle className="text-indigo-900 dark:text-indigo-100">
                  Вакансия истекает через {daysRemaining} {daysRemaining === 1 ? "день" : "дня"}
                </AlertTitle>
                <AlertDescription className="text-indigo-800 dark:text-indigo-200">
                  Продлите вакансию, чтобы продолжить получать откликы от кандидатов
                </AlertDescription>
                <Button size="sm" className="mt-2 ml-auto col-start-2">
                  Продлить на 30 дней
                </Button>
              </Alert>
            )}

            {isExpired && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-900 dark:text-red-100">
                  Вакансия истекла
                </AlertTitle>
                <AlertDescription className="text-red-800 dark:text-red-200">
                  Вакансия больше не активна. Переоткройте вакансию, чтобы продолжить поиск
                </AlertDescription>
                <Button size="sm" className="mt-2 ml-auto col-start-2">
                  Переоткрыть вакансию
                </Button>
              </Alert>
            )}
            {/* Onboarding checklist */}
            {!onboardingDone && onboardingRemaining > 0 && (
              <div className="mb-6 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <Rocket className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Настройте платформу: осталось {onboardingRemaining} {onboardingRemaining === 1 ? "шаг" : onboardingRemaining < 5 ? "шага" : "шагов"}</p>
                    <p className="text-xs text-muted-foreground">Завершите настройку, чтобы получить максимум от HireFlow</p>
                  </div>
                </div>
                <Button size="sm" asChild>
                  <Link href="/onboarding">Продолжить настройку</Link>
                </Button>
              </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                    Менеджер по продажам
                  </h1>
                  <Badge variant="secondary" className="text-xs">
                    Активна
                  </Badge>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {Math.floor((Date.now() - VACANCY_OPENED_AT.getTime()) / 86400000)} дн. активна
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {columns.reduce((acc, col) => acc + col.candidates.length, 0)} кандидат в воронке найма
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CandidateFilters filters={filters} onFiltersChange={setFilters} />
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
