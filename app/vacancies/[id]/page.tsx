"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { KanbanBoard, type ViewMode } from "@/components/dashboard/kanban-board"
import { CardSettings, type CardDisplaySettings } from "@/components/dashboard/card-settings"
import { CandidateFilters, type FilterState } from "@/components/dashboard/candidate-filters"
import { CandidateProfile } from "@/components/dashboard/candidate-profile"
import { AddCandidateDialog } from "@/components/dashboard/add-candidate-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CourseTab } from "@/components/vacancies/course-tab"
import { Plus, Clock, Pause, Play, Archive, RotateCcw, Trash2, Settings, BookOpen, BarChart3, Kanban, Pencil, MessageCircle, Zap, Globe } from "lucide-react"
import { toast } from "sonner"
import { defaultColumnColors, type CandidateAction, getNextColumnId, PROGRESS_BY_COLUMN } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { HhIntegration, type HhMessageLog } from "@/components/vacancies/hh-integration"
import { AutomationSettings } from "@/components/vacancies/automation-settings"
import { PublishTab } from "@/components/vacancies/publish-tab"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts"

interface ColumnData {
  id: string
  title: string
  count: number
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

// Mock vacancy data based on ID
type VacancyStatus = "draft" | "active" | "archived"

function emptyColumns(): ColumnData[] {
  return Object.entries(defaultColumnColors).map(([id, c]) => ({
    id, title: c.label, count: 0, colorFrom: c.from, colorTo: c.to, candidates: [],
  }))
}

const vacancyData: Record<string, { title: string; status: VacancyStatus; daysActive: number; columns: ColumnData[] }> = {
  "new-vacancy": { title: "Новая вакансия", status: "draft", daysActive: 0, columns: emptyColumns() },
  "1": {
    title: "Менеджер по продажам", status: "active", daysActive: 18,
    columns: [
      { id: "new", title: "Новые", count: 2, colorFrom: defaultColumnColors.new.from, colorTo: defaultColumnColors.new.to, candidates: [
        { id: "v1-1", name: "Иван Петров", city: "Москва", salaryMin: 150000, salaryMax: 180000, score: 88, progress: 5, source: "hh.ru", experience: "5 лет в B2B", skills: ["CRM", "B2B"], addedAt: new Date(Date.now() - 3 * 86400000), lastSeen: "online" },
        { id: "v1-2", name: "Мария Сидорова", city: "СПб", salaryMin: 140000, salaryMax: 170000, score: 76, progress: 5, source: "Avito", experience: "3 года в ритейле", skills: ["Продажи"], addedAt: new Date(Date.now() - 7 * 86400000), lastSeen: new Date(Date.now() - 7200000) },
      ]},
      { id: "awaiting", title: "Ожидает ответа", count: 0, colorFrom: defaultColumnColors.awaiting.from, colorTo: defaultColumnColors.awaiting.to, candidates: [] },
      { id: "demo", title: "Демонстрация", count: 0, colorFrom: defaultColumnColors.demo.from, colorTo: defaultColumnColors.demo.to, candidates: [] },
      { id: "hr_decision", title: "Решение HR", count: 1, colorFrom: defaultColumnColors.hr_decision.from, colorTo: defaultColumnColors.hr_decision.to, candidates: [
        { id: "v1-3", name: "Елена Волкова", city: "Москва", salaryMin: 155000, salaryMax: 185000, score: 81, progress: 60, source: "hh.ru", experience: "4 года в IT-продажах", skills: ["IT Sales"], addedAt: new Date(Date.now() - 14 * 86400000), lastSeen: "online", demoProgress: 12, demoTotal: 12, demoTimeMin: 16, aiSummary: "Хороший опыт в IT-продажах, уверенные ответы на вопросы." },
      ]},
      { id: "interview", title: "Интервью", count: 0, colorFrom: defaultColumnColors.interview.from, colorTo: defaultColumnColors.interview.to, candidates: [] },
      { id: "final_decision", title: "Финальное решение", count: 0, colorFrom: defaultColumnColors.final_decision.from, colorTo: defaultColumnColors.final_decision.to, candidates: [] },
      { id: "hired", title: "Нанят 🎉", count: 0, colorFrom: defaultColumnColors.hired.from, colorTo: defaultColumnColors.hired.to, candidates: [] },
    ],
  },
}

const defaultSettings: CardDisplaySettings = {
  showSalary: true, showSalaryFull: false, showScore: true, showProgress: true,
  showSource: true, showCity: true, showExperience: true, showSkills: true, showActions: true,
}

const STATUS_CONFIG: Record<VacancyStatus, { label: string; color: string }> = {
  draft: { label: "Не опубликована", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  active: { label: "Активна", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  archived: { label: "В архиве", color: "bg-muted text-muted-foreground border-border" },
}

export default function VacancyPage() {
  const params = useParams()
  const id = params.id as string
  const vacancy = vacancyData[id] || {
    ...vacancyData["new-vacancy"],
    title: "Новая вакансия",
    status: "draft" as VacancyStatus,
  }

  const [status, setStatus] = useState(vacancy.status)
  const [columns, setColumns] = useState(vacancy.columns)
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")
  const [cardSettings, setCardSettings] = useState(defaultSettings)
  const [filters, setFilters] = useState<FilterState>({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, sources: [] })
  const [profileCandidate, setProfileCandidate] = useState<Candidate | null>(null)
  const [profileColumnId, setProfileColumnId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [internalName, setInternalName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)
  const [messageLogs, setMessageLogs] = useState<HhMessageLog[]>([])

  const totalCandidates = columns.reduce((acc, col) => acc + col.candidates.length, 0)

  const handleHhCandidatesImported = (candidates: Candidate[]) => {
    setColumns(prev => prev.map(col => {
      if (col.id !== "new") return col
      const newCandidates = [...col.candidates, ...candidates]
      return { ...col, candidates: newCandidates, count: newCandidates.length }
    }))
  }

  const handleHhMessageLog = (log: HhMessageLog) => {
    setMessageLogs(prev => [...prev, log])
  }

  const handleAction = (candidateId: string, columnId: string, action: CandidateAction) => {
    const sourceCol = columns.find((c) => c.id === columnId)
    const candidate = sourceCol?.candidates.find((c) => c.id === candidateId)
    if (!candidate || !sourceCol) return

    if (action === "reject") {
      setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
      toast.error(`${candidate.name} — отказ`)
      return
    }
    if (action === "reserve") {
      setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
      toast.warning(`${candidate.name} — в резерв`)
      return
    }
    if (action === "think") {
      toast("🤔 Подумаем над кандидатом", { description: candidate.name })
      return
    }
    if (action === "hire") {
      const moved = { ...candidate, progress: 100 }
      setColumns((p) => p.map((c) => {
        if (c.id === columnId) { const nc = c.candidates.filter((x) => x.id !== candidateId); return { ...c, candidates: nc, count: nc.length } }
        if (c.id === "hired") { const nc = [...c.candidates, moved]; return { ...c, candidates: nc, count: nc.length } }
        return c
      }))
      toast.success(`🎉 ${candidate.name} — нанят!`)
      return
    }
    if (action === "advance") {
      const nextId = getNextColumnId(columnId)
      if (!nextId) {
        setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
        toast.success(`${candidate.name} — нанят!`)
        return
      }
      const moved = { ...candidate, progress: PROGRESS_BY_COLUMN[nextId] ?? candidate.progress }
      setColumns((p) => p.map((c) => {
        if (c.id === columnId) { const nc = c.candidates.filter((x) => x.id !== candidateId); return { ...c, candidates: nc, count: nc.length } }
        if (c.id === nextId) { const nc = [...c.candidates, moved]; return { ...c, candidates: nc, count: nc.length } }
        return c
      }))
      toast.success(`${candidate.name} → следующий этап`)
    }
  }

  const handleAddCandidate = (candidate: Candidate) => {
    setColumns((p) => p.map((c) => c.id !== "new" ? c : { ...c, candidates: [...c.candidates, candidate], count: c.candidates.length + 1 }))
    toast.success(`${candidate.name} добавлен`)
  }

  const filteredColumns = columns.map((col) => {
    const filtered = col.candidates.filter((c) => {
      if (filters.searchText && !c.name.toLowerCase().includes(filters.searchText.toLowerCase())) return false
      if (filters.cities.length > 0 && !filters.cities.includes(c.city)) return false
      if (c.score < filters.scoreMin) return false
      if (filters.sources.length > 0 && !filters.sources.includes(c.source)) return false
      return true
    })
    return { ...col, candidates: filtered, count: filtered.length }
  })

  const funnelData = columns.map((col) => ({ stage: col.title, count: col.candidates.length, color: col.colorFrom }))

  const statusCfg = STATUS_CONFIG[status]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            {/* Vacancy Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  {/* Inline-editable internal name */}
                  {isEditingName ? (
                    <input
                      autoFocus
                      className="text-xl sm:text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5 min-w-[200px]"
                      value={internalName}
                      onChange={(e) => setInternalName(e.target.value)}
                      onBlur={() => setIsEditingName(false)}
                      onKeyDown={(e) => { if (e.key === "Enter") setIsEditingName(false) }}
                      placeholder="Нажмите чтобы изменить название"
                    />
                  ) : (
                    <button
                      className="flex items-center gap-2 group text-left"
                      onClick={() => setIsEditingName(true)}
                    >
                      <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                        {internalName || vacancy.title}
                      </h1>
                      <Pencil className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </button>
                  )}
                  <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
                  {status === "active" && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" />
                      {vacancy.daysActive} дн. активна
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {vacancy.title} · Москва · Продажи
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {totalCandidates} кандидатов в воронке
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Status actions */}
                {status === "draft" && (
                  <>
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => { setStatus("active"); toast.success("Вакансия опубликована") }}>
                      <Play className="size-3.5" />
                      Опубликовать
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { setStatus("archived"); toast("Вакансия перемещена в архив") }}>
                      <Archive className="size-3.5" />
                      В архив
                    </Button>
                  </>
                )}
                {status === "active" && (
                  <>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950" onClick={() => { setStatus("draft"); toast.warning("Вакансия остановлена") }}>
                      <Pause className="size-3.5" />
                      Остановить
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { setStatus("archived"); toast("Вакансия перемещена в архив") }}>
                      <Archive className="size-3.5" />
                      В архив
                    </Button>
                  </>
                )}
                {status === "archived" && (
                  <>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setStatus("draft"); toast.success("Вакансия восстановлена") }}>
                      <RotateCcw className="size-3.5" />
                      Восстановить
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-destructive hover:bg-destructive/10" onClick={() => toast.error("Удаление вакансии (заглушка)")}>
                      <Trash2 className="size-3.5" />
                      Удалить
                    </Button>
                  </>
                )}

                <div className="w-px h-6 bg-border mx-1" />

                <CandidateFilters filters={filters} onFiltersChange={setFilters} />
                <CardSettings settings={cardSettings} onSettingsChange={setCardSettings} />
                <Button size="sm" className="h-9" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="size-4 mr-2" />
                  Добавить
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="candidates">
              <TabsList className="mb-5">
                <TabsTrigger value="candidates" className="gap-1.5">
                  <Kanban className="w-3.5 h-3.5" />
                  Кандидаты
                </TabsTrigger>
                <TabsTrigger value="course" className="gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  Курс
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Аналитика
                </TabsTrigger>
                <TabsTrigger value="automation" className="gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Автоматизация
                </TabsTrigger>
                <TabsTrigger value="publish" className="gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Публикация
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5">
                  <Settings className="w-3.5 h-3.5" />
                  Настройки
                </TabsTrigger>
              </TabsList>

              <TabsContent value="candidates">
                <KanbanBoard
                  settings={cardSettings}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  columns={filteredColumns}
                  onColumnsChange={setColumns}
                  onOpenProfile={(c, colId) => { setProfileCandidate(c); setProfileColumnId(colId) }}
                  onAction={handleAction}
                />
              </TabsContent>

              <TabsContent value="course">
                <CourseTab />
              </TabsContent>

              <TabsContent value="analytics">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Воронка найма</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                          <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={100} stroke="var(--muted-foreground)" />
                          <Tooltip contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {funnelData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Всего кандидатов", value: totalCandidates, color: "text-blue-600" },
                      { label: "Конверсия", value: totalCandidates > 0 ? `${Math.round((columns[columns.length - 1].candidates.length / totalCandidates) * 100)}%` : "0%", color: "text-emerald-600" },
                      { label: "Ср. скор", value: totalCandidates > 0 ? Math.round(columns.flatMap((c) => c.candidates).reduce((a, c) => a + c.score, 0) / totalCandidates) : 0, color: "text-purple-600" },
                      { label: "Дней активна", value: vacancy.daysActive, color: "text-amber-600" },
                    ].map((s) => (
                      <Card key={s.label}>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                          <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="automation">
                <AutomationSettings />
              </TabsContent>

              <TabsContent value="publish">
                <PublishTab
                  vacancyTitle={internalName || vacancy.title}
                  vacancySlug={id}
                  vacancyCity="Москва"
                  salaryFrom={80000}
                  salaryTo={150000}
                />
              </TabsContent>

              <TabsContent value="settings">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Левая колонка — Интеграции */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Интеграции</h3>
                      <p className="text-sm text-muted-foreground mb-4">Подключение сервисов для автоматического импорта кандидатов</p>
                    </div>
                    <HhIntegration
                      onCandidatesImported={handleHhCandidatesImported}
                      onMessageLog={handleHhMessageLog}
                    />
                  </div>

                  {/* Правая колонка — Лог сообщений + прочие настройки */}
                  <div className="space-y-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MessageCircle className="w-4 h-4" />
                          Лог сообщений hh-чат
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {messageLogs.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            Сообщения появятся после синхронизации откликов
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {messageLogs.slice().reverse().map((log, i) => (
                              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50 border border-border text-sm">
                                <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <MessageCircle className="w-3 h-3 text-emerald-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground truncate">{log.candidateName}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {log.sentAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Сообщение отправлено в hh-чат {log.sentAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-8 text-center">
                        <Settings className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">Настройки вакансии</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                          Редактирование текста, зарплаты, требований и публикация. Модуль в разработке.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>

      <AddCandidateDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={handleAddCandidate} />

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
            onOpenChange={(open) => { if (!open) { setProfileCandidate(null); setProfileColumnId(null) } }}
            onAction={handleAction}
          />
        )
      })()}
    </SidebarProvider>
  )
}
