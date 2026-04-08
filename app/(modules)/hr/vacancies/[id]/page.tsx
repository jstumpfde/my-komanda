"use client"

import { useState, useRef, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth, isPlatformRole } from "@/lib/auth"
import { useVacancy } from "@/hooks/use-vacancies"
import { useCandidates, type ApiCandidate } from "@/hooks/use-candidates"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { KanbanBoard, type ViewMode } from "@/components/dashboard/kanban-board"
import { CardSettings, type CardDisplaySettings } from "@/components/dashboard/card-settings"
import { CandidateFilters, type FilterState } from "@/components/dashboard/candidate-filters"
import { CandidateProfile } from "@/components/dashboard/candidate-profile"
import { CandidateDrawer } from "@/components/candidates/candidate-drawer"
import { AddCandidateDialog } from "@/components/dashboard/add-candidate-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CourseTab } from "@/components/vacancies/course-tab"
import { AnketaTab } from "@/components/vacancies/anketa-tab"
import type { NotionEditorHandle } from "@/components/vacancies/notion-editor"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Plus, Clock, Pause, Play, Archive, RotateCcw, Trash2, Settings, BookOpen, BarChart3, Kanban, Pencil, MessageCircle, Zap, Globe, AlertTriangle, TrendingUp, Calendar, MapPin, DollarSign, Filter, X, Link2, Copy, Save, Sparkles, Eye, Check, Loader2, Download, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, XCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { defaultColumnColors, type CandidateAction, getNextColumnId, PROGRESS_BY_COLUMN } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { HhIntegration, type HhMessageLog } from "@/components/vacancies/hh-integration"
import { AutomationSettings } from "@/components/vacancies/automation-settings"
import { PublishTab } from "@/components/vacancies/publish-tab"
import { MiniFormBuilder } from "@/components/vacancies/mini-form-builder"
import { UtmLinksSection } from "@/components/vacancies/utm-links-section"
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

type VacancyStatus = "draft" | "active" | "paused" | "closed_success" | "closed_cancelled"

function emptyColumns(): ColumnData[] {
  return Object.entries(defaultColumnColors).map(([id, c]) => ({
    id, title: c.label, count: 0, colorFrom: c.from, colorTo: c.to, candidates: [],
  }))
}

const defaultSettings: CardDisplaySettings = {
  showSalary: false, showSalaryFull: true, showScore: true, showAge: true,
  showSource: true, showCity: true, showExperience: true, showSkills: true, showActions: true,
}


const STATUS_CONFIG: Record<VacancyStatus, { label: string; color: string }> = {
  draft: { label: "Черновик", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  active: { label: "Активна", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  paused: { label: "Приостановлена", color: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800" },
  closed_success: { label: "Закрыта (найден)", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  closed_cancelled: { label: "Закрыта (отменена)", color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
}

// Map ApiCandidate → Candidate (for the kanban card)
function apiCandidateToCard(c: ApiCandidate, columnId: string): Candidate {
  const progress = PROGRESS_BY_COLUMN[columnId] ?? 10
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

export default function VacancyPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // ── Real API data ──────────────────────────────────────────
  const { vacancy: apiVacancy, loading: vacancyLoading, error: vacancyError } = useVacancy(id)
  const { candidates: apiCandidates, updateStage } = useCandidates(id)

  const [status, setStatus] = useState<VacancyStatus>("draft")
  const [columns, setColumns] = useState<ColumnData[]>(emptyColumns())

  // Sync vacancy status + custom columns from API
  useEffect(() => {
    if (apiVacancy?.status) {
      const s = apiVacancy.status as VacancyStatus
      setStatus(s)
      const isPublished = s === "active" || s === "closed_success" || s === "closed_cancelled"
      setActiveTab(prev => prev === "anketa" || prev === "analytics" ? (isPublished ? "analytics" : "anketa") : prev)
    }
    // Load custom columns from description_json (skip hidden ones)
    const desc = apiVacancy?.descriptionJson as Record<string, unknown> | undefined
    const hiddenColumns = (desc?.hiddenColumns as string[]) || []
    const custom = ((desc?.customColumns as Array<{ id: string; name: string; color: string }>) || [])
      .filter(c => !hiddenColumns.includes(c.id))
    if (custom.length > 0) {
      setColumns(prev => {
        const existingIds = new Set(prev.map(c => c.id))
        const newCols = custom
          .filter(c => !existingIds.has(c.id))
          .map(c => ({ id: c.id, title: c.name, count: 0, colorFrom: c.color, colorTo: c.color, candidates: [] as Candidate[] }))
        return newCols.length > 0 ? [...prev, ...newCols] : prev
      })
    }
    // Load branding
    const branding = desc?.branding as Record<string, string> | undefined
    if (branding) {
      if (branding.companyName) setBrandCompanyName(branding.companyName)
      if (branding.color) setBrandColor(branding.color)
      if (branding.slogan) setBrandSlogan(branding.slogan)
      if (branding.logo) setBrandLogo(branding.logo)
      if (branding.domainLevel) setBrandDomainLevel(branding.domainLevel as "free" | "subdomain" | "custom")
      if (branding.companySlug) setBrandCompanySlug(branding.companySlug)
      if (branding.customDomain) setBrandCustomDomain(branding.customDomain)
    }
  }, [apiVacancy])

  // Populate columns from API candidates
  useEffect(() => {
    if (apiCandidates.length === 0) return
    setColumns(prev => prev.map(col => {
      const colCandidates = apiCandidates
        .filter(c => c.stage === col.id)
        .map(c => apiCandidateToCard(c, col.id))
      return { ...col, candidates: colCandidates, count: colCandidates.length }
    }))
  }, [apiCandidates])
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")
  const [cardSettings, setCardSettings] = useState(defaultSettings)
  const [filters, setFilters] = useState<FilterState>({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, sources: [], workFormats: [], relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20, funnelStatuses: [], demoProgress: [], dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [], skills: [], industries: [] })
  const [profileCandidate, setProfileCandidate] = useState<Candidate | null>(null)
  const [profileColumnId, setProfileColumnId] = useState<string | null>(null)
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [internalName, setInternalName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)
  const [messageLogs, setMessageLogs] = useState<HhMessageLog[]>([])
  const [brandCompanyName, setBrandCompanyName] = useState("")
  const [brandColor, setBrandColor] = useState("#3B82F6")
  const [brandSlogan, setBrandSlogan] = useState("")
  const [brandLogo, setBrandLogo] = useState("")
  const [brandDomainLevel, setBrandDomainLevel] = useState<"free" | "subdomain" | "custom">("free")
  const [brandCompanySlug, setBrandCompanySlug] = useState("")
  const [brandCustomDomain, setBrandCustomDomain] = useState("")
  const [editingSlug, setEditingSlug] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  const defaultTab = (status === "active" || status === "closed_success" || status === "closed_cancelled") ? "analytics" : "anketa"
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [anPeriod, setAnPeriod] = useState("all")
  const [anSources, setAnSources] = useState<string[]>([])
  const [anCities, setAnCities] = useState<string[]>([])
  const [anFormats, setAnFormats] = useState<string[]>([])
  const [anSalaryMin, setAnSalaryMin] = useState(0)
  const [anSalaryMax, setAnSalaryMax] = useState(300000)
  const [anScoreMin, setAnScoreMin] = useState(0)
  const [anStages, setAnStages] = useState<string[]>([])
  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectCandidateId, setRejectCandidateId] = useState<string | null>(null)
  const [rejectColumnId, setRejectColumnId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  // Course editor toolbar state
  const courseEditorRef = useRef<NotionEditorHandle>(null)
  const [courseEditorSaveStatus, setCourseEditorSaveStatus] = useState<"saved" | "saving">("saved")

  // HH.ru integration state
  const [hhConnected, setHhConnected] = useState<boolean | null>(null)
  const [hhPublished, setHhPublished] = useState<{ hhVacancyId: string; views: number; responses: number; publishedAt: string } | null>(null)
  const [hhPublishing, setHhPublishing] = useState(false)
  const [hhImporting, setHhImporting] = useState(false)
  const [hhLastImport, setHhLastImport] = useState<Date | null>(null)
  const [hhSalaryFrom, setHhSalaryFrom] = useState("")
  const [hhSalaryTo, setHhSalaryTo] = useState("")
  const [hhSchedule, setHhSchedule] = useState("fullDay")

  useEffect(() => {
    // Fetch hh.ru connection status
    fetch("/api/integrations/hh/status")
      .then((r) => r.json())
      .then((data) => setHhConnected(data.connected))
      .catch(() => setHhConnected(false))

    // Fetch published status for this vacancy
    fetch("/api/integrations/hh/vacancies")
      .then((r) => r.json())
      .then((rows: Array<{ vacancyId: string; hhVacancyId: string; views: number; responses: number; publishedAt: string }>) => {
        const found = rows.find((r) => r.vacancyId === id)
        if (found) setHhPublished(found)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleHhPublish = async () => {
    setHhPublishing(true)
    try {
      const res = await fetch(`/api/integrations/hh/vacancies/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaryFrom: hhSalaryFrom ? parseInt(hhSalaryFrom) : undefined,
          salaryTo: hhSalaryTo ? parseInt(hhSalaryTo) : undefined,
          schedule: hhSchedule,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setHhPublished({ hhVacancyId: data.hh_id, views: 0, responses: 0, publishedAt: new Date().toISOString() })
        toast.success("Вакансия опубликована на hh.ru")
      } else {
        toast.error(data.error ?? "Ошибка публикации")
      }
    } catch {
      toast.error("Ошибка публикации на hh.ru")
    } finally {
      setHhPublishing(false)
    }
  }

  const handleHhImport = async () => {
    setHhImporting(true)
    try {
      const res = await fetch(`/api/integrations/hh/vacancies/${id}/import`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setHhLastImport(new Date())
        if (data.imported > 0) {
          toast.success(`Импортировано ${data.imported} кандидатов с hh.ru`)
        } else {
          toast("Новых откликов не найдено")
        }
      } else {
        toast.error(data.error ?? "Ошибка импорта")
      }
    } catch {
      toast.error("Ошибка импорта с hh.ru")
    } finally {
      setHhImporting(false)
    }
  }

  const { role } = useAuth()
  const canAdd = isPlatformRole(role)
  const [duplicating, setDuplicating] = useState(false)

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}/duplicate`, { method: "POST" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success("Копия создана")
      router.push(`/hr/vacancies/${data.id}`)
    } catch {
      toast.error("Не удалось создать копию")
    } finally {
      setDuplicating(false)
    }
  }

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

  const saveBranding = async (updates?: { companyName?: string; color?: string; slogan?: string; logo?: string }) => {
    setBrandSaving(true)
    const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
    const branding = {
      companyName: updates?.companyName ?? brandCompanyName,
      color: updates?.color ?? brandColor,
      slogan: updates?.slogan ?? brandSlogan,
      logo: updates?.logo ?? brandLogo,
      domainLevel: brandDomainLevel,
      companySlug: brandCompanySlug,
      customDomain: brandCustomDomain,
    }
    try {
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { ...existing, branding } }),
      })
      toast.success("Брендинг сохранён")
    } catch { /* silent */ }
    setBrandSaving(false)
  }

  const handleAddCustomColumn = async (name: string, color: string, afterColumnId?: string) => {
    const colId = `custom_${Date.now()}`
    const newCol: ColumnData = {
      id: colId, title: name, count: 0,
      colorFrom: color, colorTo: color,
      candidates: [],
    }
    setColumns(prev => {
      if (afterColumnId) {
        const idx = prev.findIndex(c => c.id === afterColumnId)
        if (idx !== -1) {
          const copy = [...prev]
          copy.splice(idx + 1, 0, newCol)
          return copy
        }
      }
      return [...prev, newCol]
    })

    // Persist custom columns in vacancy.description_json
    const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
    const customColumns = [...((existing.customColumns as Array<{ id: string; name: string; color: string; afterColumnId?: string }>) || []), { id: colId, name, color, afterColumnId }]
    try {
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { ...existing, customColumns } }),
      })
    } catch { /* silent */ }
  }

  const handleRemoveColumn = async (columnId: string) => {
    setColumns(prev => {
      const idx = prev.findIndex(c => c.id === columnId)
      if (idx <= 0) return prev
      const removed = prev[idx]
      const prevCol = prev[idx - 1]
      // Move candidates to previous column
      const updated = prev.filter(c => c.id !== columnId).map(c =>
        c.id === prevCol.id
          ? { ...c, candidates: [...c.candidates, ...removed.candidates], count: c.count + removed.count }
          : c
      )
      return updated
    })

    // Persist hidden columns in vacancy.description_json
    const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
    const hiddenColumns = [...((existing.hiddenColumns as string[]) || []), columnId]
    try {
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { ...existing, hiddenColumns } }),
      })
    } catch { /* silent */ }
  }

  const handleAction = async (candidateId: string, columnId: string, action: CandidateAction) => {
    const sourceCol = columns.find((c) => c.id === columnId)
    const candidate = sourceCol?.candidates.find((c) => c.id === candidateId)
    if (!candidate || !sourceCol) return

    if (action === "reject") {
      setRejectCandidateId(candidateId)
      setRejectColumnId(columnId)
      setRejectReason("")
      setRejectDialogOpen(true)
      return
    }
    if (action === "reserve") {
      setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
      toast.warning(`${candidate.name} — в резерв`)
      await updateStage(candidateId, "talent_pool")
      return
    }
    if (action === "think") {
      toast("🤔 Подумаем над кандидатом", { description: candidate.name })
      await updateStage(candidateId, "pending")
      return
    }
    if (action === "preboarding") {
      setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
      toast.success(`${candidate.name} — пребординг`)
      await updateStage(candidateId, "preboarding")
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
      await updateStage(candidateId, "hired")
      return
    }
    if (action === "advance") {
      const nextId = getNextColumnId(columnId)
      if (!nextId) {
        setColumns((p) => p.map((c) => c.id !== columnId ? c : { ...c, candidates: c.candidates.filter((x) => x.id !== candidateId), count: c.candidates.filter((x) => x.id !== candidateId).length }))
        toast.success(`${candidate.name} — нанят!`)
        await updateStage(candidateId, "hired")
        return
      }
      const moved = { ...candidate, progress: PROGRESS_BY_COLUMN[nextId] ?? candidate.progress }
      setColumns((p) => p.map((c) => {
        if (c.id === columnId) { const nc = c.candidates.filter((x) => x.id !== candidateId); return { ...c, candidates: nc, count: nc.length } }
        if (c.id === nextId) { const nc = [...c.candidates, moved]; return { ...c, candidates: nc, count: nc.length } }
        return c
      }))
      toast.success(`${candidate.name} → следующий этап`)
      await updateStage(candidateId, nextId)
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
  const newCol = columns.find((c) => c.id === "new")
  const demoCol = columns.find((c) => c.id === "demo")
  const decisionCol = columns.find((c) => c.id === "decision")
  const interviewCol = columns.find((c) => c.id === "interview")
  const finalDecisionCol = columns.find((c) => c.id === "final_decision")
  const hiredCol = columns.find((c) => c.id === "hired")

  const afterDecision = [interviewCol, finalDecisionCol, hiredCol]
    .reduce((acc, col) => acc + (col?.candidates.length || 0), 0)

  const funnelStages = [
    { stage: "Новый", count: totalCandidates, color: "#94a3b8" },
    { stage: "Демо-курс", count: totalCandidates - (newCol?.candidates.length || 0), color: "#3b82f6" },
    { stage: "Решение", count: (decisionCol?.candidates.length || 0) + afterDecision, color: "#ef4444" },
    { stage: "Интервью", count: (interviewCol?.candidates.length || 0) + (finalDecisionCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#8b5cf6" },
    { stage: "Финальное решение", count: (finalDecisionCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#f97316" },
    { stage: "Нанято", count: hiredCol?.candidates.length || 0, color: "#22c55e" },
  ]

  const funnelData = funnelStages

  const statusCfg = STATUS_CONFIG[status]

  const vacancyTitle = apiVacancy?.title ?? "Вакансия"
  const vacancySlugOrId = apiVacancy?.slug || id
  const companySlugDisplay = brandCompanySlug || brandCompanyName.toLowerCase()
    .replace(/[а-яё]/g, (c) => {
      const m: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" }
      return m[c] || c
    })
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company"
  const publicPageUrl = brandDomainLevel === "custom" && brandCustomDomain
    ? `https://${brandCustomDomain}/v/${vacancySlugOrId}`
    : brandDomainLevel === "subdomain"
    ? `https://${companySlugDisplay}.company24.pro/v/${vacancySlugOrId}`
    : `https://company24.pro/c/${companySlugDisplay}/${vacancySlugOrId}`

  // ── Loading / 404 guard ────────────────────────────────────
  const isLoadingVacancy = vacancyLoading || (!apiVacancy && !vacancyError)

  if (isLoadingVacancy) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 overflow-auto bg-background">
            <div className="py-6 space-y-4 animate-pulse" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <div className="h-8 w-64 bg-muted rounded" />
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="flex gap-4 mt-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex-1 h-24 bg-muted rounded-xl" />
                ))}
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!apiVacancy) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 overflow-auto bg-background">
            <div className="py-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <AlertTriangle className="w-12 h-12 text-muted-foreground/40" />
              <h2 className="text-xl font-semibold text-foreground">Вакансия не найдена</h2>
              <p className="text-sm text-muted-foreground">Вакансия не существует или у вас нет доступа к ней</p>
              <Button variant="outline" onClick={() => window.history.back()}>Назад</Button>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* ═══ Breadcrumb ═══════════════════════════════ */}
            <Button variant="ghost" size="sm" className="gap-1 text-sm text-muted-foreground -ml-2 mb-2" onClick={() => router.push("/hr/vacancies")}>
              <ChevronLeft className="w-3.5 h-3.5" />
              Все вакансии
            </Button>

            {/* ═══ ШАПКА ═══════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  {isEditingName ? (
                    <input autoFocus className="text-xl sm:text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5 min-w-[200px]" value={internalName} onChange={(e) => setInternalName(e.target.value)} onBlur={() => setIsEditingName(false)} onKeyDown={(e) => { if (e.key === "Enter") setIsEditingName(false) }} placeholder="Название" />
                  ) : (
                    <button className="flex items-center gap-2 group text-left" onClick={() => setIsEditingName(true)}>
                      <h1 className="text-xl sm:text-2xl font-semibold text-foreground line-clamp-2">{internalName || vacancyTitle}</h1>
                      <Pencil className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </button>
                  )}
                  <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
                  {status === "active" && apiVacancy?.createdAt && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" />{Math.floor((Date.now() - new Date(apiVacancy.createdAt).getTime()) / 86400000)} дн.</span>}
                </div>
                <p className="text-muted-foreground text-xs">{totalCandidates} кандидатов · {vacancyTitle} · {apiVacancy?.city ?? "Москва"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {status === "draft" && <>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setStatus("active"); toast.success("Вакансия запущена") }}><Play className="size-3.5" />Запустить</Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => { setStatus("closed_cancelled"); toast("В архив") }}><Archive className="size-3.5" />В архив</Button>
                </>}
                {status === "active" && <>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive" onClick={() => { setStatus("paused"); toast.warning("Вакансия приостановлена") }}><Pause className="size-3.5" />Остановить</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><X className="size-3.5" />Закрыть вакансию<ChevronDown className="size-3 ml-0.5 opacity-50" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setStatus("closed_success"); toast.success("Вакансия закрыта — кандидат найден") }}><CheckCircle2 className="size-3.5 text-blue-600" />Кандидат найден</DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setStatus("closed_cancelled"); toast.warning("Вакансия отменена") }}><XCircle className="size-3.5 text-red-600" />Отменить вакансию</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>}
                {status === "paused" && <>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setStatus("active"); toast.success("Вакансия запущена") }}><Play className="size-3.5" />Запустить</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><X className="size-3.5" />Закрыть вакансию<ChevronDown className="size-3 ml-0.5 opacity-50" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setStatus("closed_success"); toast.success("Вакансия закрыта — кандидат найден") }}><CheckCircle2 className="size-3.5 text-blue-600" />Кандидат найден</DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setStatus("closed_cancelled"); toast.warning("Вакансия отменена") }}><XCircle className="size-3.5 text-red-600" />Отменить вакансию</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => { setStatus("closed_cancelled"); toast("В архив") }}><Archive className="size-3.5" />В архив</Button>
                </>}
                {(status === "closed_success" || status === "closed_cancelled") && null}
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" disabled={duplicating} onClick={handleDuplicate}>
                  {duplicating ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}Создать похожую
                </Button>
              </div>
            </div>

            {/* ═══ ТАБЫ + ВИД в одной строке ══════════════════ */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between gap-3 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabsList className="shrink-0">
                  {(status === "active" || status === "closed_success" || status === "closed_cancelled" ? [
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "course", icon: BookOpen, label: "Демонстрация" },
                    { value: "anketa", icon: ClipboardList, label: "Анкета" },
                    { value: "automation", icon: Zap, label: "Автоматизация" },
                  ] : [
                    { value: "anketa", icon: ClipboardList, label: "Анкета" },
                    { value: "course", icon: BookOpen, label: "Демонстрация" },
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "automation", icon: Zap, label: "Автоматизация" },
                  ]).map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                      <tab.icon className="w-3.5 h-3.5" />{tab.label}
                    </TabsTrigger>
                  ))}
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

              <TabsContent value="anketa">
                <AnketaTab vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} onTitleChange={(t) => { if (t) setInternalName(t) }} />
              </TabsContent>

              <TabsContent value="candidates">
                <KanbanBoard
                  settings={cardSettings}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  columns={filteredColumns}
                  onColumnsChange={setColumns}
                  onOpenProfile={(c, colId) => {
                    // Open the candidate drawer with real API data
                    setDrawerCandidateId(c.id)
                    setDrawerOpen(true)
                    // Also keep profile state for CandidateProfile fallback
                    setProfileCandidate(c)
                    setProfileColumnId(colId)
                  }}
                  onAction={handleAction}
                  hideViewSwitcher
                  onAddCustomColumn={handleAddCustomColumn}
                  onRemoveColumn={handleRemoveColumn}
                />
              </TabsContent>

              <TabsContent value="course">
                <CourseTab
                  vacancyId={id}
                  vacancyTitle={vacancyTitle}
                  editorRef={courseEditorRef}
                  onSaveStatusChange={setCourseEditorSaveStatus}
                />
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
                  const srcColors: Record<string, string> = { "hh.ru": "#D6001C", "hh": "#D6001C", "Avito": "#00AAFF", "avito": "#00AAFF", "SuperJob": "#0066CC", "superjob": "#0066CC", "Telegram": "#26A5E4", "telegram": "#26A5E4", "WhatsApp": "#25D366", "whatsapp": "#25D366", "Сайт": "#F59E0B", "site": "#F59E0B", "Реферал": "#8B5CF6", "referral": "#8B5CF6", "LinkedIn": "#0A66C2" }
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
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Дней активна</p><p className="text-2xl font-bold text-amber-600 mt-1">{apiVacancy?.createdAt ? Math.floor((Date.now() - new Date(apiVacancy.createdAt).getTime()) / 86400000) : 0}</p></CardContent></Card>
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
                                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="count" strokeWidth={2} stroke="var(--background)"
                                    label={({ cx, cy, midAngle, innerRadius: ir, outerRadius: or, count }) => {
                                      const RADIAN = Math.PI / 180
                                      const radius = (ir + or) / 2
                                      const x = cx + radius * Math.cos(-midAngle * RADIAN)
                                      const y = cy + radius * Math.sin(-midAngle * RADIAN)
                                      return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">{count}</text>
                                    }}
                                    labelLine={false}
                                  >
                                    {sourceData.map((s, i) => <Cell key={i} fill={s.color} />)}
                                  </Pie>
                                  <Tooltip contentStyle={ttStyle} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex-1 overflow-x-auto">
                              <table className="w-full">
                                <thead><tr className="bg-muted/50 border-b">
                                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кол-во</th>
                                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">%</th>
                                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ср. AI-скор</th>
                                </tr></thead>
                                <tbody>
                                  {sourceData.map((s) => (
                                    <tr key={s.source} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
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
                <AutomationSettings vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} />
                <PostDemoSettings />
              </TabsContent>

              <TabsContent value="settings">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Левая колонка */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Публичная страница</h3>
                      <p className="text-sm text-muted-foreground">Настройка страницы вакансии для кандидатов</p>
                    </div>

                    {/* Поля мини-формы */}
                    <MiniFormBuilder vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} />

                    {/* Брендинг страницы */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Брендинг страницы
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Название компании</Label>
                          <Input
                            value={brandCompanyName}
                            onChange={(e) => setBrandCompanyName(e.target.value)}
                            placeholder="Название вашей компании"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="flex gap-4">
                          <div className="space-y-1.5 flex-1">
                            <Label className="text-xs">Цвет бренда</Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={brandColor}
                                onChange={(e) => { setBrandColor(e.target.value) }}
                                className="w-9 h-9 rounded-md border cursor-pointer p-0.5"
                              />
                              <Input
                                value={brandColor}
                                onChange={(e) => setBrandColor(e.target.value)}
                                className="h-9 text-sm font-mono w-28"
                                maxLength={7}
                              />
                              <div className="h-9 flex-1 rounded-md" style={{ backgroundColor: brandColor }} />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Логотип</Label>
                          <div className="flex items-center gap-3">
                            {brandLogo ? (
                              <div className="relative">
                                <img src={brandLogo} alt="Логотип" className="max-h-[60px] object-contain rounded-md border" />
                                <button
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                                  onClick={() => { setBrandLogo(""); saveBranding({ logo: "" }) }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="h-14 w-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50">
                                <span className="text-[10px] text-muted-foreground">Логотип</span>
                              </div>
                            )}
                            <div className="flex flex-col gap-1">
                              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                                const input = document.createElement("input")
                                input.type = "file"
                                input.accept = "image/png,image/svg+xml,image/jpeg,image/webp"
                                input.onchange = (e) => {
                                  const file = (e.target as HTMLInputElement).files?.[0]
                                  if (!file) return
                                  if (file.size > 2 * 1024 * 1024) { toast.error("Файл слишком большой (макс. 2 МБ)"); return }
                                  const reader = new FileReader()
                                  reader.onload = () => {
                                    const base64 = reader.result as string
                                    setBrandLogo(base64)
                                    saveBranding({ logo: base64 })
                                  }
                                  reader.readAsDataURL(file)
                                }
                                input.click()
                              }}>
                                Загрузить
                              </Button>
                              <span className="text-[10px] text-muted-foreground">PNG, SVG, JPG до 2 МБ</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Слоган / подзаголовок</Label>
                          <Input
                            value={brandSlogan}
                            onChange={(e) => setBrandSlogan(e.target.value)}
                            placeholder="Мы строим будущее вместе"
                            className="h-9 text-sm"
                          />
                        </div>
                        {/* Домен для публичных страниц */}
                        <div className="space-y-3">
                          <Label className="text-xs font-medium">Домен для публичных страниц</Label>

                          {/* Free */}
                          <label className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors", brandDomainLevel === "free" ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                            <input type="radio" name="domainLevel" checked={brandDomainLevel === "free"} onChange={() => setBrandDomainLevel("free")} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">Бесплатный</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Ваши ссылки: <span className="font-mono text-foreground">company24.pro/c/{companySlugDisplay}/...</span>
                              </p>
                              {brandDomainLevel === "free" && (
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-xs text-muted-foreground">Slug:</span>
                                  {editingSlug ? (
                                    <Input
                                      value={brandCompanySlug}
                                      onChange={(e) => setBrandCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                      onBlur={() => setEditingSlug(false)}
                                      onKeyDown={(e) => e.key === "Enter" && setEditingSlug(false)}
                                      className="h-7 text-xs font-mono w-32"
                                      autoFocus
                                    />
                                  ) : (
                                    <>
                                      <span className="text-xs font-mono text-foreground">{companySlugDisplay}</span>
                                      <button className="text-xs text-primary hover:underline" onClick={() => { setBrandCompanySlug(companySlugDisplay); setEditingSlug(true) }}>Изменить</button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>

                          {/* Subdomain */}
                          <label className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors", brandDomainLevel === "subdomain" ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                            <input type="radio" name="domainLevel" checked={brandDomainLevel === "subdomain"} onChange={() => setBrandDomainLevel("subdomain")} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">Поддомен Company24</p>
                                <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full px-2 py-0.5">Тариф Бизнес</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Ваши ссылки: <span className="font-mono text-foreground">{companySlugDisplay}.company24.pro/v/...</span>
                              </p>
                              {brandDomainLevel === "subdomain" && (
                                <div className="mt-2 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Ваш сайт:</span>
                                    <Input
                                      value={brandCustomDomain}
                                      onChange={(e) => {
                                        setBrandCustomDomain(e.target.value)
                                        const domain = e.target.value.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].split(".")[0]
                                        if (domain) setBrandCompanySlug(domain.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                                      }}
                                      placeholder="orlink.ru"
                                      className="h-7 text-xs font-mono w-40"
                                    />
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    Ваш поддомен: <span className="font-mono text-foreground">{companySlugDisplay}.company24.pro</span>
                                  </p>
                                </div>
                              )}
                            </div>
                          </label>

                          {/* Custom domain */}
                          <label className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors", brandDomainLevel === "custom" ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                            <input type="radio" name="domainLevel" checked={brandDomainLevel === "custom"} onChange={() => setBrandDomainLevel("custom")} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">Свой домен</p>
                                <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 rounded-full px-2 py-0.5">Тариф Масштаб</span>
                              </div>
                              {brandDomainLevel === "custom" && (
                                <div className="mt-2 space-y-2">
                                  <Input
                                    value={brandCustomDomain}
                                    onChange={(e) => setBrandCustomDomain(e.target.value)}
                                    placeholder="careers.orlink.ru"
                                    className="h-8 text-xs font-mono"
                                  />
                                  {brandCustomDomain && (
                                    <>
                                      <p className="text-[11px] text-muted-foreground">
                                        Добавьте CNAME запись: <span className="font-mono text-foreground">{brandCustomDomain}</span> → <span className="font-mono text-foreground">company24.pro</span>
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">Не проверен</Badge>
                                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => toast.info("Проверка DNS (скоро)")}>Проверить DNS</Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>

                          {/* Ваша ссылка */}
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border text-xs font-mono text-muted-foreground mt-1">
                            <Globe className="w-3.5 h-3.5 shrink-0 text-primary" />
                            <span className="truncate flex-1">{publicPageUrl}</span>
                            <button className="shrink-0 text-muted-foreground hover:text-primary" onClick={() => { navigator.clipboard.writeText(publicPageUrl); toast.success("Ссылка скопирована") }}>
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => window.open(`/vacancy/${vacancySlugOrId}`, "_blank")}>
                              <Globe className="w-3 h-3" />
                              Открыть
                            </Button>
                          </div>
                        </div>
                        {/* Mini preview */}
                        <div className="rounded-lg border p-4 bg-muted/30">
                          <p className="text-[10px] text-muted-foreground mb-2">Превью шапки</p>
                          <div className="flex items-center gap-3">
                            {brandLogo ? (
                              <img src={brandLogo} alt="" className="max-h-[40px] object-contain" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: brandColor }}>
                                {brandCompanyName ? brandCompanyName.charAt(0).toUpperCase() : "K"}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold">{brandCompanyName || "Название компании"}</p>
                              {brandSlogan && <p className="text-xs text-muted-foreground">{brandSlogan}</p>}
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <div className="h-7 px-4 rounded-md text-xs text-white flex items-center font-medium" style={{ backgroundColor: brandColor }}>Откликнуться</div>
                            <div className="h-7 px-4 rounded-md text-xs border flex items-center" style={{ color: brandColor, borderColor: brandColor }}>Подробнее</div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-4">
                          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => saveBranding()} disabled={brandSaving}>
                            {brandSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Сохранить
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* HTML-страница */}
                    <PublishTab
                      vacancyTitle={internalName || vacancyTitle}
                      vacancySlug={id}
                      vacancyCity={apiVacancy?.city ?? "Москва"}
                      salaryFrom={80000}
                      salaryTo={150000}
                      brandOverride={{ companyName: brandCompanyName, color: brandColor, logo: brandLogo, slogan: brandSlogan }}
                    />
                  </div>

                  {/* Правая колонка */}
                  <div className="space-y-6">
                    {/* Источники кандидатов */}
                    {/* Источники кандидатов */}
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Источники кандидатов</h3>
                      <p className="text-sm text-muted-foreground mb-3">Подключение сервисов для импорта откликов</p>
                      <div className="space-y-3">
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#D6001C" }}>hh</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium">hh.ru</p><p className="text-[11px] text-muted-foreground">Импорт откликов и управление вакансиями</p></div>
                          <span className="text-xs text-muted-foreground shrink-0">0 кликов · 0 кандидатов</span>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => toast.info("Подключение hh.ru (заглушка)")}>Подключить</Button>
                        </div>
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#00AAFF" }}>A</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium flex items-center gap-2">Авито Работа <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">Скоро</span></p><p className="text-[11px] text-muted-foreground">Импорт откликов с Авито</p></div>
                          <span className="text-xs text-muted-foreground shrink-0">0 кликов · 0 кандидатов</span>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" disabled>Подключить</Button>
                        </div>
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#0066CC" }}>SJ</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium flex items-center gap-2">SuperJob <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">Скоро</span></p><p className="text-[11px] text-muted-foreground">Импорт откликов с SuperJob</p></div>
                          <span className="text-xs text-muted-foreground shrink-0">0 кликов · 0 кандидатов</span>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" disabled>Подключить</Button>
                        </div>
                      </div>
                      <div className="hidden"><HhIntegration onCandidatesImported={handleHhCandidatesImported} onMessageLog={handleHhMessageLog} /></div>
                    </div>

                    {/* CRM Integrations */}
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">CRM-интеграции</h3>
                      <p className="text-sm text-muted-foreground mb-3">Синхронизация воронки с CRM</p>
                      <div className="space-y-3">
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] font-bold" style={{ backgroundColor: "#2FC6F6" }}>Б24</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium flex items-center gap-2">Битрикс24 <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">Скоро</span></p><p className="text-[11px] text-muted-foreground">Синхронизация воронки и кандидатов</p></div>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" disabled>Подключить</Button>
                        </div>
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#7B68EE" }}>amo</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium flex items-center gap-2">AmoCRM <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">Скоро</span></p><p className="text-[11px] text-muted-foreground">Синхронизация воронки и кандидатов</p></div>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" disabled>Подключить</Button>
                        </div>
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: "#6B7280" }}><Settings className="w-3.5 h-3.5" /></div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium flex items-center gap-2">Другая CRM <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">Скоро</span></p><p className="text-[11px] text-muted-foreground">Подключение через API или webhook</p></div>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" disabled>Настроить</Button>
                        </div>
                      </div>
                    </div>

                    {/* Источники и UTM-ссылки */}
                    <UtmLinksSection vacancyId={id} vacancySlug={id} />

                    {/* Лог сообщений hh-чат */}
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
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* ═══ Bottom tab navigation ══════════════════ */}
            {(() => {
              const tabOrder = (status === "active" || status === "closed_success" || status === "closed_cancelled")
                ? ["analytics", "candidates", "course", "anketa", "automation", "settings"]
                : ["anketa", "course", "candidates", "analytics", "automation", "settings"]
              const tabLabels: Record<string, string> = { anketa: "Анкета", course: "Демонстрация", candidates: "Кандидаты", analytics: "Аналитика", automation: "Автоматизация", settings: "Настройки" }
              const idx = tabOrder.indexOf(activeTab)
              const prevTab = idx > 0 ? tabOrder[idx - 1] : null
              const nextTab = idx < tabOrder.length - 1 ? tabOrder[idx + 1] : null
              const goTab = (tab: string) => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }) }
              return (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => router.push("/hr/vacancies")}>
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Все вакансии
                    </Button>
                    {prevTab && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => goTab(prevTab)}>
                        <ChevronLeft className="w-3.5 h-3.5" />
                        {tabLabels[prevTab]}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {nextTab && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => goTab(nextTab)}>
                        {tabLabels[nextTab]}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </main>
      </SidebarInset>

      <AddCandidateDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={handleAddCandidate} />

      {/* Reject confirmation dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отказать кандидату</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Укажите причину отказа (необязательно)</p>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Причина отказа..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (rejectCandidateId && rejectColumnId) {
                  const candidate = columns.find(c => c.id === rejectColumnId)?.candidates.find(c => c.id === rejectCandidateId)
                  setColumns(p => p.map(c => c.id !== rejectColumnId ? c : { ...c, candidates: c.candidates.filter(x => x.id !== rejectCandidateId), count: c.candidates.filter(x => x.id !== rejectCandidateId).length }))
                  toast.error(`${candidate?.name ?? "Кандидат"} — отказ`)
                  await updateStage(rejectCandidateId, "rejected")
                }
                setRejectDialogOpen(false)
              }}
            >
              Отказать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Candidate Drawer — opens with real API data when "Открыть профиль" is clicked */}
      <CandidateDrawer
        candidateId={drawerCandidateId}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setDrawerCandidateId(null)
        }}
        onStageChange={(candidateId, newStage) => {
          // Sync kanban columns when stage changes in drawer
          setColumns((prev) => {
            const targetStage = newStage === "rejected" ? null : newStage
            return prev.map((col) => {
              // Remove from old column
              const filtered = col.candidates.filter((c) => c.id !== candidateId)
              // Add to new column (if not rejected)
              if (targetStage && col.id === targetStage) {
                const moved = prev
                  .flatMap((c) => c.candidates)
                  .find((c) => c.id === candidateId)
                if (moved) {
                  const updated = { ...moved, progress: { new: 10, demo: 30, scheduled: 55, interviewed: 80, hired: 100 }[targetStage] ?? moved.progress }
                  return { ...col, candidates: [...filtered, updated], count: filtered.length + 1 }
                }
              }
              return { ...col, candidates: filtered, count: filtered.length }
            })
          })
        }}
      />

      {/* Legacy CandidateProfile sheet (kept for backward compat) */}
      {(() => {
        const col = profileColumnId ? columns.find((c) => c.id === profileColumnId) : null
        return (
          <CandidateProfile
            candidate={drawerOpen ? null : profileCandidate}
            columnId={profileColumnId ?? undefined}
            columnTitle={col?.title}
            columnColorFrom={col?.colorFrom}
            columnColorTo={col?.colorTo}
            open={!drawerOpen && !!profileCandidate}
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
