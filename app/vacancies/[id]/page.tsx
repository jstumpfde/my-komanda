"use client"

import { useState, useRef, useEffect } from "react"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { useVacancy } from "@/hooks/use-vacancies"
import { useCandidates, type ApiCandidate } from "@/hooks/use-candidates"
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
import type { NotionEditorHandle } from "@/components/vacancies/notion-editor"
import { NotionCourseTab } from "@/components/vacancies/notion-course-tab"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Plus, Clock, Pause, Play, Archive, RotateCcw, Trash2, Settings, BookOpen, BarChart3, Kanban, Pencil, MessageCircle, Zap, Globe, AlertTriangle, TrendingUp, Calendar, MapPin, DollarSign, Filter, X, Link2, Copy, Save, Sparkles, Eye, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { defaultColumnColors, type CandidateAction, getNextColumnId, PROGRESS_BY_COLUMN } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { HhIntegration, type HhMessageLog } from "@/components/vacancies/hh-integration"
import { AutomationSettings } from "@/components/vacancies/automation-settings"
import { PublishTab } from "@/components/vacancies/publish-tab"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  PieChart,
  Pie,
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

// ─── Seed generator for test data ───
const FIRST_NAMES = ["Иван","Мария","Алексей","Елена","Сергей","Ольга","Дмитрий","Анна","Виктор","Юлия","Павел","Татьяна","Андрей","Наталья","Михаил","Екатерина","Артём","Светлана","Максим","Ирина","Никита","Вероника","Роман","Ксения","Денис","Полина","Кирилл","Дарья","Владимир","Валерия"]
const LAST_NAMES = ["Иванов","Петров","Сидоров","Козлов","Морозов","Волков","Новиков","Соколов","Лебедев","Орлов","Белов","Смирнов","Кузнецов","Попов","Васильев","Фёдоров","Николаев","Егоров","Макаров","Павлов","Зайцев","Степанов","Семёнов","Голубев","Виноградов","Антонов","Тихонов","Крылов","Комаров","Жуков"]
const SEED_CITIES = ["Москва","СПб","Казань","Екатеринбург","Новосибирск"]
const SEED_SOURCES = ["hh.ru","Avito","Реферал","Прямая ссылка"]
const SEED_SKILLS_POOL = ["CRM","B2B","Переговоры","Excel","1C","Холодные звонки","Презентации","Upselling","Key Account","Тендеры","FMCG","IT Sales","SaaS","Аналитика","Управление","Стратегия","Клиентский сервис","Дистрибуция","Телемаркетинг","P&L"]
const SEED_EXP = ["1 год","2 года","3 года","4 года","5 лет","6 лет","7 лет","8 лет","10 лет","Без опыта","1.5 года","2.5 года"]

function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

function generateCandidates(count: number, columnId: string, progress: number, startId: number, seed: number): Candidate[] {
  const rng = seededRandom(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)]
  const candidates: Candidate[] = []
  for (let i = 0; i < count; i++) {
    const salaryBase = 80000 + Math.floor(rng() * 120000)
    const daysAgo = Math.floor(rng() * 90) + 1
    const hoursAgo = Math.floor(rng() * 72)
    const isOnline = rng() < 0.15
    const skillCount = 1 + Math.floor(rng() * 4)
    const skills: string[] = []
    while (skills.length < skillCount) { const sk = pick(SEED_SKILLS_POOL); if (!skills.includes(sk)) skills.push(sk) }
    candidates.push({
      id: `v1-${startId + i}`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      city: pick(SEED_CITIES),
      salaryMin: salaryBase,
      salaryMax: salaryBase + 20000 + Math.floor(rng() * 50000),
      score: 40 + Math.floor(rng() * 60),
      progress,
      source: pick(SEED_SOURCES),
      experience: pick(SEED_EXP),
      skills,
      addedAt: new Date(Date.now() - daysAgo * 86400000),
      lastSeen: isOnline ? "online" as const : new Date(Date.now() - hoursAgo * 3600000),
      workFormat: pick(["office", "remote", "hybrid"] as const),
    })
  }
  return candidates
}

const v1New = generateCandidates(400, "new", 10, 100, 42)
const v1Demo = generateCandidates(300, "demo", 30, 600, 77)
const v1Scheduled = generateCandidates(180, "scheduled", 55, 1000, 123)
const v1Interviewed = generateCandidates(80, "interviewed", 80, 1300, 256)
const v1Hired = generateCandidates(41, "hired", 100, 1500, 512)

const vacancyData: Record<string, { title: string; status: VacancyStatus; daysActive: number; columns: ColumnData[] }> = {
  "new-vacancy": { title: "Новая вакансия", status: "draft", daysActive: 0, columns: emptyColumns() },
  "1": {
    title: "Менеджер по продажам", status: "active", daysActive: 18,
    columns: [
      { id: "new", title: "Всего откликов", count: v1New.length, colorFrom: defaultColumnColors.new.from, colorTo: defaultColumnColors.new.to, candidates: v1New },
      { id: "demo", title: "Прошли демонстрацию", count: v1Demo.length, colorFrom: defaultColumnColors.demo.from, colorTo: defaultColumnColors.demo.to, candidates: v1Demo },
      { id: "scheduled", title: "Назначено интервью", count: v1Scheduled.length, colorFrom: defaultColumnColors.scheduled.from, colorTo: defaultColumnColors.scheduled.to, candidates: v1Scheduled },
      { id: "interviewed", title: "Прошли интервью", count: v1Interviewed.length, colorFrom: defaultColumnColors.interviewed.from, colorTo: defaultColumnColors.interviewed.to, candidates: v1Interviewed },
      { id: "hired", title: "Нанято", count: v1Hired.length, colorFrom: defaultColumnColors.hired.from, colorTo: defaultColumnColors.hired.to, candidates: v1Hired },
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

// Map ApiCandidate → Candidate (for the kanban card)
function apiCandidateToCard(c: ApiCandidate, columnId: string): Candidate {
  const progress = { new: 10, demo: 30, scheduled: 55, interviewed: 80, hired: 100 }[columnId] ?? 10
  return {
    id: c.id,
    name: c.name,
    city: c.city ?? "",
    salaryMin: c.salaryMin ?? 0,
    salaryMax: c.salaryMax ?? 0,
    score: c.score ?? 50,
    progress,
    source: c.source ?? "Прямая ссылка",
    experience: c.experience ?? "",
    skills: c.skills ?? [],
    addedAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    lastSeen: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    workFormat: "office" as const,
  }
}

// DEMO IDs that use seeded mock data (no API calls)
const DEMO_IDS = new Set(["1", "new-vacancy"])

export default function VacancyPage() {
  const params = useParams()
  const id = params.id as string
  const isDemo = DEMO_IDS.has(id)

  // ── Real API data (skipped for demo IDs) ──────────────────
  const { vacancy: apiVacancy } = useVacancy(isDemo ? null : id)
  const { candidates: apiCandidates, updateStage } = useCandidates(isDemo ? null : id)

  const mockVacancy = vacancyData[id] || {
    ...vacancyData["new-vacancy"],
    title: "Новая вакансия",
    status: "draft" as VacancyStatus,
  }

  const [status, setStatus] = useState<VacancyStatus>(mockVacancy.status)
  const [columns, setColumns] = useState<ColumnData[]>(isDemo ? mockVacancy.columns : emptyColumns())

  // Sync vacancy status from API
  useEffect(() => {
    if (apiVacancy?.status) {
      const s = apiVacancy.status as VacancyStatus
      if (["draft", "active", "archived"].includes(s)) setStatus(s)
    }
  }, [apiVacancy])

  // Populate columns from API candidates
  useEffect(() => {
    if (isDemo || apiCandidates.length === 0) return
    setColumns(prev => prev.map(col => {
      const colCandidates = apiCandidates
        .filter(c => c.stage === col.id)
        .map(c => apiCandidateToCard(c, col.id))
      return { ...col, candidates: colCandidates, count: colCandidates.length }
    }))
  }, [apiCandidates, isDemo])
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")
  const [cardSettings, setCardSettings] = useState(defaultSettings)
  const [filters, setFilters] = useState<FilterState>({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, sources: [], workFormats: [] })
  const [profileCandidate, setProfileCandidate] = useState<Candidate | null>(null)
  const [profileColumnId, setProfileColumnId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [internalName, setInternalName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)
  const [messageLogs, setMessageLogs] = useState<HhMessageLog[]>([])
  const [activeTab, setActiveTab] = useState("candidates")
  const [utmLinks, setUtmLinks] = useState([
    { id: "u1", resource: "Telegram", channel: "hh", tag: "tghh", clicks: 234, responses: 18, conversion: 7.7 },
    { id: "u2", resource: "Avito", channel: "promo", tag: "avitopromo", clicks: 156, responses: 12, conversion: 7.7 },
    { id: "u3", resource: "VK", channel: "group", tag: "vkgroup", clicks: 89, responses: 5, conversion: 5.6 },
  ])
  const [utmResource, setUtmResource] = useState("")
  const [utmChannel, setUtmChannel] = useState("")
  const [anPeriod, setAnPeriod] = useState("all")
  const [anSources, setAnSources] = useState<string[]>([])
  const [anCities, setAnCities] = useState<string[]>([])
  const [anFormats, setAnFormats] = useState<string[]>([])
  const [anSalaryMin, setAnSalaryMin] = useState(0)
  const [anSalaryMax, setAnSalaryMax] = useState(300000)
  const [anScoreMin, setAnScoreMin] = useState(0)
  const [anStages, setAnStages] = useState<string[]>([])
  // Course editor toolbar state
  const courseEditorRef = useRef<NotionEditorHandle>(null)
  const [courseEditorSaveStatus, setCourseEditorSaveStatus] = useState<"saved" | "saving">("saved")
  const { role } = useAuth()
  const canAdd = role === "admin" || role === "manager"

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

  const handleAction = async (candidateId: string, columnId: string, action: CandidateAction) => {
    const sourceCol = columns.find((c) => c.id === columnId)
    const candidate = sourceCol?.candidates.find((c) => c.id === candidateId)
    if (!candidate || !sourceCol) return

    if (action === "reject") {
      // Optimistic UI
      setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
      toast.error(`${candidate.name} — отказ`)
      // Persist to API (non-demo)
      if (!isDemo) await updateStage(candidateId, "rejected")
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
      // Persist to API (non-demo)
      if (!isDemo) await updateStage(candidateId, "hired")
      return
    }
    if (action === "advance") {
      const nextId = getNextColumnId(columnId)
      if (!nextId) {
        setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
        toast.success(`${candidate.name} — нанят!`)
        if (!isDemo) await updateStage(candidateId, "hired")
        return
      }
      const moved = { ...candidate, progress: PROGRESS_BY_COLUMN[nextId] ?? candidate.progress }
      setColumns((p) => p.map((c) => {
        if (c.id === columnId) { const nc = c.candidates.filter((x) => x.id !== candidateId); return { ...c, candidates: nc, count: nc.length } }
        if (c.id === nextId) { const nc = [...c.candidates, moved]; return { ...c, candidates: nc, count: nc.length } }
        return c
      }))
      toast.success(`${candidate.name} → следующий этап`)
      // Persist to API (non-demo)
      if (!isDemo) await updateStage(candidateId, nextId)
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
      if (filters.workFormats.length > 0 && !(c as any).workFormat && !filters.workFormats.includes("office")) return false
      if (filters.workFormats.length > 0 && (c as any).workFormat && !filters.workFormats.includes((c as any).workFormat)) return false
      return true
    })
    return { ...col, candidates: filtered, count: filtered.length }
  })

  // ─── Unified 6-stage metrics (single source of truth) ───
  const allCandidates = columns.flatMap((c) => c.candidates)
  const demoCol = columns.find((c) => c.id === "demo")
  const scheduledCol = columns.find((c) => c.id === "scheduled")
  const interviewedCol = columns.find((c) => c.id === "interviewed")
  const hiredCol = columns.find((c) => c.id === "hired")

  // "Прошли демонстрацию ≥85%" = candidates in demo+ columns with score >= 85
  const passedDemoHighScore = columns
    .filter((c) => c.id !== "new")
    .flatMap((c) => c.candidates)
    .filter((c) => c.score >= 85).length

  const funnelStages = [
    { stage: "Всего откликов", count: totalCandidates, color: "#94a3b8" },
    { stage: "Перешли на демо", count: totalCandidates - (columns.find((c) => c.id === "new")?.candidates.length || 0), color: "#3b82f6" },
    { stage: "Прошли демо ≥85%", count: passedDemoHighScore, color: "#06b6d4" },
    { stage: "Назначено интервью", count: (scheduledCol?.candidates.length || 0) + (interviewedCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#8b5cf6" },
    { stage: "Прошли интервью", count: (interviewedCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#f59e0b" },
    { stage: "Нанято", count: hiredCol?.candidates.length || 0, color: "#22c55e" },
  ]

  const funnelData = funnelStages

  const statusCfg = STATUS_CONFIG[status]

  // Use real API title if available, fall back to mock title
  const vacancyTitle = apiVacancy?.title ?? mockVacancy.title

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            {/* ═══ ШАПКА ═══════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  {isEditingName ? (
                    <input autoFocus className="text-xl sm:text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5 min-w-[200px]" value={internalName} onChange={(e) => setInternalName(e.target.value)} onBlur={() => setIsEditingName(false)} onKeyDown={(e) => { if (e.key === "Enter") setIsEditingName(false) }} placeholder="Название" />
                  ) : (
                    <button className="flex items-center gap-2 group text-left" onClick={() => setIsEditingName(true)}>
                      <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{internalName || vacancyTitle}</h1>
                      <Pencil className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </button>
                  )}
                  <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
                  {status === "active" && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" />{mockVacancy.daysActive} дн.</span>}
                </div>
                <p className="text-muted-foreground text-xs">{totalCandidates} кандидатов · {vacancyTitle} · {apiVacancy?.city ?? "Москва"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {status === "draft" && <>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setStatus("active"); toast.success("Опубликована") }}><Play className="size-3.5" />Опубликовать</Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => { setStatus("archived"); toast("В архив") }}><Archive className="size-3.5" />В архив</Button>
                </>}
                {status === "active" && <>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-amber-600" onClick={() => { setStatus("draft"); toast.warning("Остановлена") }}><Pause className="size-3.5" />Остановить</Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => { setStatus("archived"); toast("В архив") }}><Archive className="size-3.5" />В архив</Button>
                </>}
                {status === "archived" && <>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setStatus("draft"); toast.success("Восстановлена") }}><RotateCcw className="size-3.5" />Восстановить</Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive" onClick={() => toast.error("Удаление (заглушка)")}><Trash2 className="size-3.5" />Удалить</Button>
                </>}
                {canAdd && (
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAddDialogOpen(true)}>
                    <Plus className="size-3.5" />Добавить
                  </Button>
                )}
              </div>
            </div>

            {/* ═══ АНАЛИТИКА ВОРОНКИ — 6 плашек ═══════════════ */}
            <div className="mb-4 w-full overflow-x-auto">
              <div className="flex items-stretch gap-0 min-w-max">
                {funnelStages.map((s, i) => {
                  const next = funnelStages[i + 1]
                  const convPct = next && s.count > 0 ? Math.round((next.count / s.count) * 100) : null
                  return (
                    <div key={s.stage} className="flex items-center flex-1">
                      <div
                        className="rounded-xl border-l-4 border border-border bg-card px-3 py-3 w-full min-h-[90px] flex flex-col justify-between"
                        style={{ borderLeftColor: s.color }}
                      >
                        <p className="text-[10px] text-muted-foreground leading-tight">{s.stage}</p>
                        <p className="text-2xl font-bold text-foreground leading-none mt-1">{s.count}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {convPct !== null && (
                            <span className={cn("text-[11px] font-bold", convPct >= 50 ? "text-emerald-600" : convPct >= 25 ? "text-amber-600" : "text-red-600")}>→ {convPct}%</span>
                          )}
                          {convPct === null && i < funnelStages.length - 1 && (
                            <span className="text-[11px] text-muted-foreground/50">→ —</span>
                          )}
                        </div>
                      </div>
                      {i < funnelStages.length - 1 && <span className="text-muted-foreground/25 text-lg px-1 flex-shrink-0">›</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ═══ ТАБЫ + ВИД в одной строке ══════════════════ */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between gap-3 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabsList className="shrink-0">
                  <TabsTrigger value="candidates" className="gap-1.5"><Kanban className="w-3.5 h-3.5" />Кандидаты</TabsTrigger>
                  <TabsTrigger value="course" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />Демодолжности</TabsTrigger>
                  <TabsTrigger value="course2" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />Демо 2</TabsTrigger>
                  <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Аналитика</TabsTrigger>
                  <TabsTrigger value="automation" className="gap-1.5"><Zap className="w-3.5 h-3.5" />Автоматизация</TabsTrigger>
                  <TabsTrigger value="publish" className="gap-1.5"><Globe className="w-3.5 h-3.5" />Публикация</TabsTrigger>
                  <TabsTrigger value="settings" className="gap-1.5"><Settings className="w-3.5 h-3.5" />Настройки</TabsTrigger>
                </TabsList>

                {activeTab === "candidates" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <CandidateFilters filters={filters} onFiltersChange={setFilters} candidates={columns.flatMap((c) => c.candidates)} />
                    <CardSettings settings={cardSettings} onSettingsChange={setCardSettings} />
                    <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                      {([
                        { mode: "funnel" as const, label: "Воронка" },
                        { mode: "list" as const, label: "Список" },
                        { mode: "kanban" as const, label: "Канбан" },
                        { mode: "tiles" as const, label: "Плитки" },
                      ]).map(v => (
                        <button key={v.mode} className={cn("h-7 px-2.5 rounded-md text-xs font-medium transition-all whitespace-nowrap", viewMode === v.mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setViewMode(v.mode)}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === "course" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => courseEditorRef.current?.save()}>
                        {courseEditorSaveStatus === "saving" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        Сохранить
                      </Button>
                      <span className={cn("absolute left-1/2 -translate-x-1/2 top-full mt-0.5 text-[10px] leading-none whitespace-nowrap transition-colors", courseEditorSaveStatus === "saving" ? "text-amber-500" : "text-muted-foreground/40")}>
                        {courseEditorSaveStatus === "saving" ? "Сохранение..." : "✓ Сохранено"}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                      <BookOpen className="w-3.5 h-3.5" />Библиотека
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                      <Sparkles className="w-3.5 h-3.5" />AI
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => courseEditorRef.current?.openPreview()}>
                      <Eye className="w-3.5 h-3.5" />Превью
                    </Button>
                  </div>
                )}
                {activeTab === "analytics" && (
                  <AnalyticsFilterButton
                    anPeriod={anPeriod} setAnPeriod={setAnPeriod}
                    anSources={anSources} setAnSources={setAnSources}
                    anCities={anCities} setAnCities={setAnCities}
                    anFormats={anFormats} setAnFormats={setAnFormats}
                    anSalaryMin={anSalaryMin} setAnSalaryMin={setAnSalaryMin}
                    anSalaryMax={anSalaryMax} setAnSalaryMax={setAnSalaryMax}
                    anScoreMin={anScoreMin} setAnScoreMin={setAnScoreMin}
                    anStages={anStages} setAnStages={setAnStages}
                    columns={columns}
                    candidates={columns.flatMap((c) => c.candidates)}
                  />
                )}
              </div>

              <TabsContent value="candidates">
                <KanbanBoard
                  settings={cardSettings}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  columns={filteredColumns}
                  onColumnsChange={setColumns}
                  onOpenProfile={(c, colId) => { setProfileCandidate(c); setProfileColumnId(colId) }}
                  onAction={handleAction}
                  hideViewSwitcher
                />
              </TabsContent>

              <TabsContent value="course">
                <CourseTab
                  editorRef={courseEditorRef}
                  onSaveStatusChange={setCourseEditorSaveStatus}
                />
              </TabsContent>

              <TabsContent value="course2" className="p-0 border-0 mt-0">
                <NotionCourseTab />
              </TabsContent>

              <TabsContent value="analytics">
                {(() => {
                  const ttStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }

                  // ─── Apply analytics filters ───
                  const now = Date.now()
                  const periodMs: Record<string, number> = { today: 86400000, "7d": 7 * 86400000, "30d": 30 * 86400000, all: Infinity }
                  const maxAge = periodMs[anPeriod] || Infinity

                  const allCands = columns.flatMap((c) => c.candidates).filter((c) => {
                    if (maxAge < Infinity && (now - c.addedAt.getTime()) > maxAge) return false
                    if (anSources.length > 0 && !anSources.includes(c.source)) return false
                    if (anCities.length > 0 && !anCities.includes(c.city)) return false
                    if (anFormats.length > 0) { const f = (c as any).workFormat || "office"; if (!anFormats.includes(f)) return false }
                    if (c.salaryMin < anSalaryMin || c.salaryMax > anSalaryMax) return false
                    if (c.score < anScoreMin) return false
                    if (anStages.length > 0) {
                      const col = columns.find((col) => col.candidates.some((x) => x.id === c.id))
                      if (col && !anStages.includes(col.id)) return false
                    }
                    return true
                  })

                  // Dynamic filter options
                  const allRaw = columns.flatMap((c) => c.candidates)
                  const cityOptions = Array.from(new Set(allRaw.map((c) => c.city))).sort()
                  const sourceOptions = Array.from(new Set(allRaw.map((c) => c.source))).sort()
                  const hasAnFilters = anPeriod !== "all" || anSources.length > 0 || anCities.length > 0 || anFormats.length > 0 || anSalaryMin > 0 || anSalaryMax < 300000 || anScoreMin > 0 || anStages.length > 0
                  const resetAnFilters = () => { setAnPeriod("all"); setAnSources([]); setAnCities([]); setAnFormats([]); setAnSalaryMin(0); setAnSalaryMax(300000); setAnScoreMin(0); setAnStages([]) }
                  const transitions = funnelStages.slice(1).map((s, i) => ({
                    from: funnelStages[i].stage, to: s.stage,
                    pct: funnelStages[i].count > 0 ? Math.round((s.count / funnelStages[i].count) * 100) : 0,
                  }))
                  const minPct = transitions.length > 0 ? Math.min(...transitions.map((t) => t.pct)) : 0
                  const overallConv = totalCandidates > 0 ? ((funnelStages[funnelStages.length - 1].count / totalCandidates) * 100).toFixed(1) : "0"

                  // Sources
                  const srcMap = new Map<string, { count: number; scoreSum: number }>()
                  allCands.forEach((c) => {
                    const e = srcMap.get(c.source) || { count: 0, scoreSum: 0 }
                    e.count++; e.scoreSum += c.score
                    srcMap.set(c.source, e)
                  })
                  const srcColors: Record<string, string> = { "hh.ru": "#3b82f6", "Avito": "#06b6d4", "LinkedIn": "#8b5cf6", "Telegram": "#6366f1", "Реферал": "#10b981" }
                  const sourceData = Array.from(srcMap.entries()).map(([source, d]) => ({
                    source, count: d.count, avgScore: d.count > 0 ? Math.round(d.scoreSum / d.count) : 0,
                    pct: totalCandidates > 0 ? Math.round((d.count / totalCandidates) * 100) : 0,
                    color: srcColors[source] || "#94a3b8",
                  })).sort((a, b) => b.count - a.count)

                  // Score distribution
                  const scoreRanges = [
                    { range: "0-40 (низкий)", count: allCands.filter((c) => c.score <= 40).length, color: "#ef4444" },
                    { range: "41-70 (средний)", count: allCands.filter((c) => c.score > 40 && c.score <= 70).length, color: "#f59e0b" },
                    { range: "71-100 (высокий)", count: allCands.filter((c) => c.score > 70).length, color: "#22c55e" },
                  ]

                  return (
                    <div className="space-y-4">
                      {/* Funnel chart + 3 metric cards */}
                      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Воронка найма</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={250}>
                              <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" domain={[0, funnelData[0]?.count || 1]} allowDataOverflow />
                                <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={140} stroke="var(--muted-foreground)" />
                                <Tooltip contentStyle={ttStyle} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                  {funnelData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                  <LabelList
                                    dataKey="count"
                                    content={({ x, y, width, height, value }: any) => {
                                      if (!value) return null
                                      const textW = String(value).length * 8 + 8
                                      const inside = width > textW
                                      return (
                                        <text x={inside ? x + width - 8 : x + width + 6} y={y + height / 2} textAnchor={inside ? "end" : "start"} dominantBaseline="central" style={{ fontSize: 12, fontWeight: 700, fill: inside ? "#fff" : "var(--foreground)" }}>
                                          {value}
                                        </text>
                                      )
                                    }}
                                  />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        {/* 4 metric cards — 2x2 grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Всего кандидатов</p><p className="text-2xl font-bold text-blue-600 mt-1">{totalCandidates}</p></CardContent></Card>
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Конверсия воронки</p><p className="text-2xl font-bold text-emerald-600 mt-1">{overallConv}%</p></CardContent></Card>
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ср. AI-скор</p><p className="text-2xl font-bold text-purple-600 mt-1">{allCands.length > 0 ? Math.round(allCands.reduce((a, c) => a + c.score, 0) / allCands.length) : 0}</p></CardContent></Card>
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Дней активна</p><p className="text-2xl font-bold text-amber-600 mt-1">{mockVacancy.daysActive}</p></CardContent></Card>
                        </div>
                      </div>

                      {/* БЛОК 2: Конверсия между этапами */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-muted-foreground" />Конверсия между этапами</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5">
                          {transitions.map((t) => {
                            const isWorst = t.pct === minPct && transitions.length > 1
                            return (
                              <div key={t.from + t.to} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm", isWorst ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-muted/30")}>
                                <span className="text-muted-foreground w-[200px] shrink-0 text-xs">{t.from} → {t.to}</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={cn("h-full rounded-full", isWorst ? "bg-red-500" : "bg-primary")} style={{ width: `${t.pct}%` }} />
                                </div>
                                <span className={cn("text-xs font-semibold w-12 text-right", isWorst ? "text-red-600" : "text-foreground")}>{t.pct}%</span>
                                {isWorst && <div className="flex items-center gap-1 text-red-600 shrink-0"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-xs font-medium">Здесь теряем больше всего</span></div>}
                              </div>
                            )
                          })}
                          <div className="flex items-center justify-between mt-3 px-3 pt-2 border-t border-border">
                            <span className="text-xs font-medium">Общая конверсия воронки</span>
                            <Badge variant="secondary" className="text-xs font-bold">{overallConv}%</Badge>
                          </div>
                        </CardContent>
                      </Card>

                      {/* БЛОК 3: Источники */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" />Источники кандидатов</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-col lg:flex-row gap-6">
                            <div className="w-full lg:w-1/3">
                              <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" strokeWidth={2} stroke="var(--background)">
                                    {sourceData.map((s, i) => <Cell key={i} fill={s.color} />)}
                                  </Pie>
                                  <Tooltip contentStyle={ttStyle} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex-1 overflow-x-auto">
                              <table className="w-full">
                                <thead><tr className="border-b bg-muted/30">
                                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2">Источник</th>
                                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2">Кол-во</th>
                                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2">%</th>
                                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2">Ср. AI-скор</th>
                                </tr></thead>
                                <tbody>
                                  {sourceData.map((s) => (
                                    <tr key={s.source} className="border-b last:border-0 hover:bg-muted/20">
                                      <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /><span className="text-sm font-medium">{s.source}</span></div></td>
                                      <td className="text-right px-3 py-2 text-sm font-medium">{s.count}</td>
                                      <td className="text-right px-3 py-2 text-sm text-muted-foreground">{s.pct}%</td>
                                      <td className="text-right px-3 py-2">
                                        <Badge variant="outline" className={cn("text-xs", s.avgScore >= 75 ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : s.avgScore >= 60 ? "bg-amber-500/10 text-amber-700 border-amber-200" : "bg-red-500/10 text-red-700 border-red-200")}>{s.avgScore}</Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* БЛОК 4: AI-скор */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-muted-foreground" />Распределение AI-скора</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={scoreRanges} margin={{ left: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                              <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                              <Tooltip contentStyle={ttStyle} />
                              <Bar dataKey="count" name="Кандидатов" radius={[6, 6, 0, 0]}>
                                {scoreRanges.map((s, i) => <Cell key={i} fill={s.color} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          <div className="flex items-center justify-center gap-6 mt-2">
                            {scoreRanges.map((s) => (
                              <div key={s.range} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                <span className="text-xs text-muted-foreground">{s.range}: <span className="font-semibold text-foreground">{s.count}</span></span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )
                })()}
              </TabsContent>

              <TabsContent value="automation">
                <AutomationSettings />
              </TabsContent>

              <TabsContent value="publish">
                <PublishTab
                  vacancyTitle={internalName || vacancyTitle}
                  vacancySlug={id}
                  vacancyCity="Москва"
                  salaryFrom={80000}
                  salaryTo={150000}
                />
              </TabsContent>

              <TabsContent value="settings">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Левая колонка — Интеграции */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Источники кандидатов</h3>
                      <p className="text-sm text-muted-foreground mb-3">Подключение сервисов для импорта откликов</p>
                    </div>

                    {/* hh.ru — compact row that expands on click */}
                    <HhIntegration onCandidatesImported={handleHhCandidatesImported} onMessageLog={handleHhMessageLog} />

                    {/* Avito */}
                    <Card><CardContent className="px-4 py-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0"><span className="text-sm font-bold text-emerald-600">A</span></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">Авито Работа</p><p className="text-[12px] text-muted-foreground">Импорт откликов с Авито</p></div>
                      <Badge variant="outline" className="text-[12px] text-muted-foreground border-border shrink-0">Не подключено</Badge>
                      <Button size="sm" className="h-8 text-[12px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" onClick={() => toast.info("Подключение Авито (заглушка)")}>Подключить</Button>
                    </CardContent></Card>

                    {/* SuperJob */}
                    <Card><CardContent className="px-4 py-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0"><span className="text-sm font-bold text-blue-600">SJ</span></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">SuperJob</p><p className="text-[12px] text-muted-foreground">Импорт откликов с SuperJob</p></div>
                      <Badge variant="outline" className="text-[12px] text-muted-foreground border-border shrink-0">Не подключено</Badge>
                      <Button size="sm" className="h-8 text-[12px] gap-1 bg-blue-600 hover:bg-blue-700 text-white shrink-0" onClick={() => toast.info("Подключение SuperJob (заглушка)")}>Подключить</Button>
                    </CardContent></Card>

                    {/* CRM Integrations */}
                    <div className="pt-2">
                      <h3 className="text-lg font-semibold text-foreground mb-1">CRM-интеграции</h3>
                      <p className="text-sm text-muted-foreground mb-3">Синхронизация воронки с CRM</p>
                    </div>

                    {/* Bitrix24 */}
                    <Card><CardContent className="px-4 py-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-sky-600">Б24</span></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">Битрикс24</p><p className="text-[12px] text-muted-foreground">Синхронизация воронки и кандидатов</p></div>
                      <Badge variant="outline" className="text-[12px] text-muted-foreground border-border shrink-0">Не подключено</Badge>
                      <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1 text-sky-600 border-sky-300 hover:bg-sky-50 shrink-0" onClick={() => toast.info("Подключение Битрикс24 (заглушка)")}>Подключить</Button>
                    </CardContent></Card>

                    {/* AmoCRM */}
                    <Card><CardContent className="px-4 py-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-indigo-600">amo</span></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">AmoCRM</p><p className="text-[12px] text-muted-foreground">Синхронизация воронки и кандидатов</p></div>
                      <Badge variant="outline" className="text-[12px] text-muted-foreground border-border shrink-0">Не подключено</Badge>
                      <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1 text-indigo-600 border-indigo-300 hover:bg-indigo-50 shrink-0" onClick={() => toast.info("Подключение AmoCRM (заглушка)")}>Подключить</Button>
                    </CardContent></Card>

                    {/* UTM Links */}
                    <div className="pt-2">
                      <h3 className="text-lg font-semibold text-foreground mb-1">UTM-ссылки и источники трафика</h3>
                      <p className="text-sm text-muted-foreground mb-4">Создайте ссылки для отслеживания кандидатов из любого канала</p>
                    </div>

                    <Card>
                      <CardContent className="p-4 space-y-4">
                        {/* Create form */}
                        <div className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <label className="text-[11px] text-muted-foreground font-medium">Ресурс</label>
                            <Input value={utmResource} onChange={(e) => setUtmResource(e.target.value)} placeholder="например: telegram" className="h-8 text-sm" />
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[11px] text-muted-foreground font-medium">Канал</label>
                            <Input value={utmChannel} onChange={(e) => setUtmChannel(e.target.value)} placeholder="например: superjob" className="h-8 text-sm" />
                          </div>
                          <Button size="sm" className="h-8 gap-1 text-xs shrink-0" disabled={!utmResource.trim() || !utmChannel.trim()} onClick={() => {
                            const tag = (utmResource.trim() + utmChannel.trim()).toLowerCase().replace(/\s+/g, "")
                            setUtmLinks((prev) => [...prev, { id: `u-${Date.now()}`, resource: utmResource.trim(), channel: utmChannel.trim(), tag, clicks: 0, responses: 0, conversion: 0 }])
                            setUtmResource(""); setUtmChannel("")
                            toast.success("UTM-ссылка создана")
                          }}>
                            <Plus className="w-3 h-3" />Создать
                          </Button>
                        </div>

                        {/* Table */}
                        {utmLinks.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b bg-muted/30">
                                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2">Название</th>
                                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2">UTM</th>
                                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2">Ссылка</th>
                                  <th className="text-right text-[11px] font-semibold text-muted-foreground px-3 py-2">Переходы</th>
                                  <th className="text-right text-[11px] font-semibold text-muted-foreground px-3 py-2">Отклики</th>
                                  <th className="text-right text-[11px] font-semibold text-muted-foreground px-3 py-2">Конв.</th>
                                  <th className="px-2 py-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {utmLinks.map((link) => {
                                  const fullUrl = `https://hireflow.ru/v/${id}?utm_source=${link.tag}`
                                  return (
                                    <tr key={link.id} className="border-b last:border-0 hover:bg-muted/20">
                                      <td className="px-3 py-2 text-sm font-medium">{link.resource} + {link.channel}</td>
                                      <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px] font-mono">{link.tag}</Badge></td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">{fullUrl}</span>
                                          <button className="shrink-0 text-muted-foreground hover:text-primary" title="Копировать" onClick={() => { navigator.clipboard.writeText(fullUrl); toast.success("Ссылка скопирована") }}>
                                            <Copy className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="text-right px-3 py-2 text-sm">{link.clicks}</td>
                                      <td className="text-right px-3 py-2 text-sm">{link.responses}</td>
                                      <td className="text-right px-3 py-2 text-sm font-medium">{link.conversion}%</td>
                                      <td className="px-2 py-2">
                                        <button className="text-muted-foreground hover:text-destructive" onClick={() => setUtmLinks((p) => p.filter((l) => l.id !== link.id))}>
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
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

                    <PostDemoSettings />
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

/* ──── Analytics Filter Button ──── */
function AnalyticsFilterButton(props: {
  anPeriod: string; setAnPeriod: (v: string) => void
  anSources: string[]; setAnSources: (v: any) => void
  anCities: string[]; setAnCities: (v: any) => void
  anFormats: string[]; setAnFormats: (v: any) => void
  anSalaryMin: number; setAnSalaryMin: (v: number) => void
  anSalaryMax: number; setAnSalaryMax: (v: number) => void
  anScoreMin: number; setAnScoreMin: (v: number) => void
  anStages: string[]; setAnStages: (v: any) => void
  columns: { id: string; title: string; candidates: any[] }[]
  candidates: any[]
}) {
  const { anPeriod, setAnPeriod, anSources, setAnSources, anCities, setAnCities, anFormats, setAnFormats, anSalaryMin, setAnSalaryMin, anSalaryMax, setAnSalaryMax, anScoreMin, setAnScoreMin, anStages, setAnStages, columns, candidates } = props

  const [showAllSources, setShowAllSources] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)
  const [showAllStages, setShowAllStages] = useState(false)

  const sourceOpts = Array.from(new Set(candidates.map((c: any) => c.source))).sort() as string[]
  const cityOpts = Array.from(new Set(candidates.map((c: any) => c.city))).sort() as string[]
  const has = anPeriod !== "all" || anSources.length > 0 || anCities.length > 0 || anFormats.length > 0 || anSalaryMin > 0 || anSalaryMax < 300000 || anScoreMin > 0 || anStages.length > 0
  const reset = () => { setAnPeriod("all"); setAnSources([]); setAnCities([]); setAnFormats([]); setAnSalaryMin(0); setAnSalaryMax(300000); setAnScoreMin(0); setAnStages([]) }
  const tog = (arr: string[], v: string, set: any) => set((p: string[]) => p.includes(v) ? p.filter((x: string) => x !== v) : [...p, v])

  const visibleSources = showAllSources ? sourceOpts : sourceOpts.slice(0, 3)
  const hiddenSourcesN = sourceOpts.length - 3
  const visibleCities = showAllCities ? cityOpts : cityOpts.slice(0, 3)
  const hiddenCitiesN = cityOpts.length - 3
  const visibleStages = showAllStages ? columns : columns.slice(0, 3)
  const hiddenStagesN = columns.length - 3

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={has ? "default" : "outline"} size="sm" className="h-7 text-xs gap-1.5 shrink-0">
          <Filter className="w-3 h-3" />Фильтры{has && <Badge className="ml-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px] bg-primary-foreground text-primary">!</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="end">
        <div className="flex items-center justify-between"><p className="text-xs font-semibold">Фильтры аналитики</p>{has && <button className="text-[11px] text-primary hover:underline" onClick={reset}>Сбросить</button>}</div>
        <div className="space-y-1"><p className="text-[11px] text-muted-foreground font-medium">Период</p><div className="flex gap-1">{[{ v: "all", l: "Все" }, { v: "today", l: "Сегодня" }, { v: "7d", l: "7 дн" }, { v: "30d", l: "30 дн" }].map((o) => (<button key={o.v} className={cn("px-2 py-1 rounded text-[11px]", anPeriod === o.v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")} onClick={() => setAnPeriod(o.v)}>{o.l}</button>))}</div></div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium">Источник</p>
          {visibleSources.map((s) => (<div key={s} className="flex items-center gap-2 py-0.5"><Checkbox className="h-3.5 w-3.5" checked={anSources.includes(s)} onCheckedChange={() => tog(anSources, s, setAnSources)} /><span className="text-[11px]">{s}</span></div>))}
          {hiddenSourcesN > 0 && <button className="text-[11px] text-primary hover:underline" onClick={() => setShowAllSources(!showAllSources)}>{showAllSources ? "Свернуть" : `+ ещё ${hiddenSourcesN}`}</button>}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium">Регион</p>
          {visibleCities.map((c) => (<div key={c} className="flex items-center gap-2 py-0.5"><Checkbox className="h-3.5 w-3.5" checked={anCities.includes(c)} onCheckedChange={() => tog(anCities, c, setAnCities)} /><span className="text-[11px]">{c}</span></div>))}
          {hiddenCitiesN > 0 && <button className="text-[11px] text-primary hover:underline" onClick={() => setShowAllCities(!showAllCities)}>{showAllCities ? "Свернуть" : `+ ещё ${hiddenCitiesN}`}</button>}
        </div>
        <div className="space-y-1.5"><p className="text-[11px] text-muted-foreground font-medium">Зарплата: {anSalaryMin.toLocaleString("ru-RU")} – {anSalaryMax.toLocaleString("ru-RU")} ₽</p><Slider value={[anSalaryMin]} onValueChange={([v]) => setAnSalaryMin(v)} min={0} max={300000} step={10000} /><Slider value={[anSalaryMax]} onValueChange={([v]) => setAnSalaryMax(v)} min={0} max={300000} step={10000} /></div>
        <div className="space-y-1.5"><p className="text-[11px] text-muted-foreground font-medium">AI-скор ≥ {anScoreMin}</p><Slider value={[anScoreMin]} onValueChange={([v]) => setAnScoreMin(v)} min={0} max={100} step={5} /></div>
        <div className="space-y-1"><p className="text-[11px] text-muted-foreground font-medium">Формат</p><div className="flex gap-2">{[{ v: "office", l: "Офис" }, { v: "remote", l: "Удалёнка" }, { v: "hybrid", l: "Гибрид" }].map((o) => (<div key={o.v} className="flex items-center gap-1"><Checkbox className="h-3.5 w-3.5" checked={anFormats.includes(o.v)} onCheckedChange={() => tog(anFormats, o.v, setAnFormats)} /><span className="text-[11px]">{o.l}</span></div>))}</div></div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium">Этап</p>
          {visibleStages.map((col) => (<div key={col.id} className="flex items-center gap-2 py-0.5"><Checkbox className="h-3.5 w-3.5" checked={anStages.includes(col.id)} onCheckedChange={() => tog(anStages, col.id, setAnStages)} /><span className="text-[11px]">{col.title}</span></div>))}
          {hiddenStagesN > 0 && <button className="text-[11px] text-primary hover:underline" onClick={() => setShowAllStages(!showAllStages)}>{showAllStages ? "Свернуть" : `+ ещё ${hiddenStagesN}`}</button>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
