"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth, isPlatformRole } from "@/lib/auth"
import { useVacancy } from "@/hooks/use-vacancies"
import { useCandidates, type ApiCandidate } from "@/hooks/use-candidates"
import { useUserPreferences } from "@/hooks/use-user-preferences"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { KanbanBoard, type ViewMode } from "@/components/dashboard/kanban-board"
import type { ListSortKey, ListSortState } from "@/components/dashboard/list-view"
import { type CardDisplaySettings } from "@/components/dashboard/card-settings"
import { ViewSettings } from "@/components/dashboard/view-settings"
import { CandidateFilters, type FilterState } from "@/components/dashboard/candidate-filters"
import { SortMenu } from "@/components/dashboard/sort-menu"
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { CandidateSortMode } from "@/lib/candidate-sort"
import { CandidateDrawer } from "@/components/candidates/candidate-drawer"
import { CandidatesProgressList } from "@/components/candidates/candidates-progress-list"
import { AddCandidateDialog } from "@/components/dashboard/add-candidate-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CourseTab, type CourseTabHandle } from "@/components/vacancies/course-tab"
import { AnketaTab } from "@/components/vacancies/anketa-tab"
import type { NotionEditorHandle } from "@/components/vacancies/notion-editor"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Plus, Clock, Pause, Play, Archive, RotateCcw, Trash2, Settings, BookOpen, BarChart3, Kanban, Pencil, MessageCircle, Zap, Globe, AlertTriangle, TrendingUp, Calendar, MapPin, DollarSign, Filter, X, Link2, Copy, Save, Sparkles, Eye, Check, Loader2, Download, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, XCircle, Users, Phone, Upload, RefreshCw, Activity } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { defaultColumnColors, type CandidateAction, getNextColumnId, PROGRESS_BY_COLUMN } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { HhVacancyBanner } from "@/components/vacancies/hh-vacancy-banner"
import { HhAutoProcess } from "@/components/hh/hh-auto-process"
import { AutomationSettings } from "@/components/vacancies/automation-settings"
import { PublishTab } from "@/components/vacancies/publish-tab"
import { MiniFormBuilder } from "@/components/vacancies/mini-form-builder"
import { UtmLinksSection } from "@/components/vacancies/utm-links-section"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import { VacancyAiProcessSettings } from "@/components/vacancies/vacancy-ai-process-settings"
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
  showSalary: false, showSalaryFull: true, showScore: true, showAge: false,
  showSource: true, showCity: true, showExperience: true, showSkills: true, showActions: true,
  showProgress: true, showResponseDate: true,
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
    aiScore: c.aiScore ?? undefined,
    aiSummary: c.aiSummary ?? undefined,
    aiVerdict: c.aiScore != null ? (c.aiScore >= 70 ? "подходит" : c.aiScore >= 40 ? "возможно" : "не подходит") : undefined,
    demoProgressJson: c.demoProgressJson as Candidate["demoProgressJson"],
    isFavorite: c.isFavorite ?? false,
    createdAt: c.createdAt,
  }
}

export default function VacancyPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // ── Real API data ──────────────────────────────────────────
  const { vacancy: apiVacancy, loading: vacancyLoading, error: vacancyError, refetch: refetchVacancy } = useVacancy(id)

  // ── Quick-fill: paste text (AI) / from library (template) / upload file ──
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteProgress, setPasteProgress] = useState("")
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false)
  const [libraryItems, setLibraryItems] = useState<Array<{ id: string; title: string; status: string; createdAt: string }>>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySearch, setLibrarySearch] = useState("")
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [hhImportDialogOpen, setHhImportDialogOpen] = useState(false)
  const [hhImportUrl, setHhImportUrl] = useState("")
  const [hhImportBusy, setHhImportBusy] = useState(false)
  const anketaFileInputRef = useRef<HTMLInputElement>(null)

  const parseTextAndFillAnketa = async (text: string) => {
    if (!text.trim()) { toast.error("Нет текста для парсинга"); return }
    setPasteBusy(true)
    setPasteProgress("AI анализирует текст...")
    try {
      const aiRes = await fetch("/api/ai/parse-vacancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!aiRes.ok) throw new Error("AI-парсинг не удался")
      const aiData = (await aiRes.json()) as { data: Record<string, unknown> }
      const parsed = aiData.data || {}

      setPasteProgress("Обновляю анкету...")
      const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
      const existingAnketa = (existing.anketa as Record<string, unknown>) || {}
      const newAnketa: Record<string, unknown> = {
        ...existingAnketa,
        vacancyTitle: existingAnketa.vacancyTitle || parsed.positionTitle || "",
        positionCategory: parsed.positionCategory ?? existingAnketa.positionCategory ?? "",
        workFormats: parsed.workFormats ?? existingAnketa.workFormats ?? [],
        employment: parsed.employment ?? existingAnketa.employment ?? [],
        positionCity: parsed.positionCity ?? existingAnketa.positionCity ?? "",
        salaryFrom: parsed.salaryFrom ?? existingAnketa.salaryFrom ?? "",
        salaryTo: parsed.salaryTo ?? existingAnketa.salaryTo ?? "",
        bonus: parsed.bonus ?? existingAnketa.bonus ?? "",
        responsibilities: parsed.responsibilities ?? existingAnketa.responsibilities ?? "",
        requirements: parsed.requirements ?? existingAnketa.requirements ?? "",
        requiredSkills: parsed.requiredSkills ?? existingAnketa.requiredSkills ?? [],
        desiredSkills: parsed.desiredSkills ?? existingAnketa.desiredSkills ?? [],
        unacceptableSkills: parsed.unacceptableSkills ?? existingAnketa.unacceptableSkills ?? [],
        experienceMin: parsed.experienceMin ?? existingAnketa.experienceMin ?? "",
        experienceIdeal: parsed.experienceIdeal ?? existingAnketa.experienceIdeal ?? "",
        conditions: parsed.conditions ?? existingAnketa.conditions ?? [],
        screeningQuestions: parsed.screeningQuestions ?? existingAnketa.screeningQuestions ?? [],
        hhDescription: parsed.hhDescription ?? existingAnketa.hhDescription ?? "",
      }
      const body: Record<string, unknown> = {
        description_json: { ...existing, anketa: newAnketa },
      }
      if (parsed.positionTitle && typeof parsed.positionTitle === "string") {
        body.title = parsed.positionTitle
      }
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error || "Не удалось сохранить анкету")
      }
      await refetchVacancy()
      toast.success("Анкета заполнена")
      setTextDialogOpen(false)
      setPasteText("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setPasteBusy(false)
      setPasteProgress("")
    }
  }

  const handlePasteAndFill = () => parseTextAndFillAnketa(pasteText.trim())

  const handleAnketaFileUpload = async (file: File) => {
    const name = file.name.toLowerCase()
    if (!name.endsWith(".txt") && !name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".doc")) {
      toast.error("Поддерживаются DOCX, PDF, TXT")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Файл слишком большой (макс. 50 МБ)")
      return
    }
    setPasteBusy(true)
    setPasteProgress("Извлекаю текст из файла...")
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/modules/hr/vacancies/parse-file", { method: "POST", body: fd })
      const data = await res.json() as { text?: string; error?: string }
      if (!res.ok || !data.text) throw new Error(data.error || "Не удалось извлечь текст")
      await parseTextAndFillAnketa(data.text)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка обработки файла")
      setPasteBusy(false)
      setPasteProgress("")
    }
  }

  const handleHhVacancyImport = async () => {
    const url = hhImportUrl.trim()
    if (!/hh\.ru\/vacancy\//i.test(url)) {
      toast.error("Ссылка должна содержать hh.ru/vacancy/")
      return
    }
    setHhImportBusy(true)
    try {
      const res = await fetch(`/api/vacancies/${id}/hh-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hhUrl: url }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await refetchVacancy()
      toast.success("✅ Данные импортированы с hh.ru")
      setHhImportDialogOpen(false)
      setHhImportUrl("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка импорта")
    } finally {
      setHhImportBusy(false)
    }
  }

  const loadLibrary = async () => {
    setLibraryLoading(true)
    try {
      const res = await fetch("/api/modules/hr/vacancies?limit=100")
      if (res.ok) {
        const data = await res.json()
        const vacs = (data.vacancies ?? data.data ?? []) as Array<{ id: string; title: string; status: string; createdAt: string }>
        setLibraryItems(vacs.filter(v => v.id !== id))
      }
    } catch {}
    setLibraryLoading(false)
  }

  const handleApplyTemplate = async (templateId: string) => {
    setLibraryBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${templateId}`)
      if (!res.ok) throw new Error("Не удалось загрузить шаблон")
      const template = await res.json()
      const src = template.data ?? template

      const body: Record<string, unknown> = {}
      if (src.descriptionJson) body.description_json = src.descriptionJson
      if (src.city) body.city = src.city
      if (src.format) body.format = src.format
      if (src.employment) body.employment = src.employment
      if (src.category) body.category = src.category
      if (src.salaryMin != null) body.salary_min = src.salaryMin
      if (src.salaryMax != null) body.salary_max = src.salaryMax

      const patchRes = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!patchRes.ok) throw new Error("Не удалось применить шаблон")
      await refetchVacancy()
      toast.success(`Анкета заполнена из «${src.title}»`)
      setLibraryDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setLibraryBusy(false)
    }
  }
  const searchParams = useSearchParams()

  // Сортировка списка кандидатов — состояние в URL, чтобы переживало refresh
  const VALID_SORT_KEYS: ListSortKey[] = ["favorite", "aiScore", "progress", "salary", "responseDate", "status"]
  const sortParam = searchParams?.get("sort") ?? null
  const orderParam = searchParams?.get("order") ?? null
  const listSort: ListSortState | null = sortParam && (VALID_SORT_KEYS as string[]).includes(sortParam)
    ? { key: sortParam as ListSortKey, dir: orderParam === "asc" ? "asc" : "desc" }
    : null

  const setListSort = useCallback((next: ListSortState | null) => {
    const sp = new URLSearchParams(window.location.search)
    if (next) {
      sp.set("sort", next.key)
      sp.set("order", next.dir)
    } else {
      sp.delete("sort")
      sp.delete("order")
    }
    const qs = sp.toString()
    router.replace(`${window.location.pathname}${qs ? "?" + qs : ""}`, { scroll: false })
  }, [router])

  const { candidates: apiCandidates, updateStage, refetch: refetchCandidates, toggleFavorite } = useCandidates(
    id,
    undefined,
    listSort ? { sort: listSort.key, order: listSort.dir } : undefined,
  )

  const handleToggleFavorite = useCallback(async (candidateId: string, isFavorite: boolean) => {
    const ok = await toggleFavorite(candidateId, isFavorite)
    if (!ok) toast.error("Не удалось обновить избранное")
  }, [toggleFavorite])

  const [status, setStatus] = useState<VacancyStatus>("draft")
  const [columns, setColumns] = useState<ColumnData[]>(emptyColumns())

  // Load funnel stages from API
  useEffect(() => {
    fetch("/api/funnel-stages")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((stages: Array<{ slug: string; title: string; color: string; sortOrder: number }>) => {
        if (stages.length > 0) {
          setColumns(stages.map(s => ({
            id: s.slug,
            title: s.title,
            count: 0,
            colorFrom: s.color,
            colorTo: s.color,
            candidates: [],
          })))
        }
      })
      .catch(() => {})
  }, [])

  // Sync vacancy status + custom columns from API
  useEffect(() => {
    if (apiVacancy?.status) {
      const s = apiVacancy.status as VacancyStatus
      setStatus(s)
      // Если URL не задаёт таб явно — переключаем дефолт по статусу при публикации
      if (!urlTab) {
        setActiveTab(prev => prev === "anketa" || prev === "analytics" ? (s === "active" ? "candidates" : "anketa") : prev)
      }
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
  const { prefs: userPrefs, loaded: userPrefsLoaded, setViewMode: persistViewMode, setColumns: persistColumns } = useUserPreferences()
  const [viewMode, setViewModeLocal] = useState<ViewMode>("list")
  const [sortMode, setSortMode] = useState<CandidateSortMode>("date_desc")
  const [cardSettings, setCardSettingsLocal] = useState(defaultSettings)

  // ─── При первой загрузке user-prefs — гидратируем UI ─────────────────────
  useEffect(() => {
    if (!userPrefsLoaded) return
    setViewModeLocal(userPrefs.viewMode as ViewMode)
    if (userPrefs.columns && Object.keys(userPrefs.columns).length > 0) {
      setCardSettingsLocal((prev) => ({ ...prev, ...userPrefs.columns } as typeof prev))
    }
  }, [userPrefsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeLocal(mode)
    persistViewMode(mode)
  }, [persistViewMode])

  const setCardSettings = useCallback((next: CardDisplaySettings) => {
    setCardSettingsLocal(next)
    persistColumns(next as unknown as Record<string, boolean>)
  }, [persistColumns])
  const [filters, setFilters] = useState<FilterState>({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, sources: [], workFormats: [], relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20, funnelStatuses: [], demoProgress: [], dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [], skills: [], industries: [] })
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [internalName, setInternalName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)

  // Keep internalName in sync with the persisted title so the edit field
  // starts populated and so external updates (e.g. hh.ru import) are reflected.
  useEffect(() => {
    if (apiVacancy?.title) setInternalName(apiVacancy.title)
  }, [apiVacancy?.title])

  const saveVacancyName = async (next: string) => {
    const trimmed = next.trim()
    if (!trimmed || trimmed === apiVacancy?.title) return
    setSavingName(true)
    try {
      const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
      const existingAnketa = (existing.anketa as Record<string, unknown>) || {}
      const body = {
        title: trimmed,
        description_json: { ...existing, anketa: { ...existingAnketa, vacancyTitle: trimmed } },
      }
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || "Не удалось сохранить название")
      }
      await refetchVacancy()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения названия")
      if (apiVacancy?.title) setInternalName(apiVacancy.title)
    } finally {
      setSavingName(false)
    }
  }
  const [showStickyHeader, setShowStickyHeader] = useState(false)
  const [advisorScore, setAdvisorScore] = useState<{ score: number; label: string }>({ score: 0, label: "" })
  const mainHeaderRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Listen to scroll in capture phase — catches any scrolling element
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document
      const scrollTop = target === document
        ? window.scrollY
        : (target as HTMLElement).scrollTop ?? 0
      setShowStickyHeader(scrollTop > 200)
    }
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true })
    return () => document.removeEventListener("scroll", handleScroll, { capture: true })
  }, [])
  const [brandCompanyName, setBrandCompanyName] = useState("")
  const [brandColor, setBrandColor] = useState("#3B82F6")
  const [brandSlogan, setBrandSlogan] = useState("")
  const [brandLogo, setBrandLogo] = useState("")
  const [brandDomainLevel, setBrandDomainLevel] = useState<"free" | "subdomain" | "custom">("free")
  const [brandCompanySlug, setBrandCompanySlug] = useState("")
  const [brandCustomDomain, setBrandCustomDomain] = useState("")
  const [editingSlug, setEditingSlug] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  const defaultTab = status === "active" ? "candidates" : "anketa"
  const rawUrlTab = searchParams?.get("tab") ?? null
  // Старая ссылка `?tab=automation` → новая `?tab=settings&section=automation`
  const urlTab = rawUrlTab === "automation" ? "settings" : rawUrlTab
  const urlSection = rawUrlTab === "automation" ? "automation" : (searchParams?.get("section") ?? null)
  const [activeTab, setActiveTab] = useState(urlTab ?? defaultTab)
  const [settingsSection, setSettingsSection] = useState<"general" | "automation">(urlSection === "automation" ? "automation" : "general")
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
  // Talent pool suggestion
  const [talentPoolDialogOpen, setTalentPoolDialogOpen] = useState(false)
  const [talentPoolCandidate, setTalentPoolCandidate] = useState<Candidate | null>(null)

  // AI tools modals
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareResult, setCompareResult] = useState<{ table: { candidateName: string; pros: string[]; cons: string[]; fitScore: number }[]; recommendation: string; summary: string } | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [questionsResult, setQuestionsResult] = useState<{ question: string; type: string; purpose: string }[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsCandidate, setQuestionsCandidate] = useState<string>("")
  const [refCheckOpen, setRefCheckOpen] = useState(false)
  const [refCheckResult, setRefCheckResult] = useState<{ intro: string; questions: string[]; redFlags: string[] } | null>(null)
  const [refCheckLoading, setRefCheckLoading] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerHtml, setOfferHtml] = useState("")
  const [offerLoading, setOfferLoading] = useState(false)
  const [offerEditing, setOfferEditing] = useState(false)

  // Course editor toolbar state
  const courseEditorRef = useRef<NotionEditorHandle>(null)
  const courseTabRef = useRef<CourseTabHandle>(null)
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

  // HH.ru sync state (lifted from VacancyPulse — used by both pulse hero text and bottom toolbar buttons)
  const [hhSyncMeta, setHhSyncMeta] = useState<{ hhVacancyId: string; responsesCount: number; syncedAt: string; createdAt: string; localVacancyId: string | null } | null>(null)
  const [hhPendingResponses, setHhPendingResponses] = useState<number | null>(null)
  const [hhSyncing, setHhSyncing] = useState(false)

  const loadHhSyncMeta = useCallback(async () => {
    const hhVacId = apiVacancy?.hhVacancyId
    if (!hhVacId) return
    try {
      const res = await fetch("/api/integrations/hh/vacancies")
      const data = await res.json() as { vacancies?: Array<{ hhVacancyId: string; responsesCount: number; syncedAt: string; createdAt: string; localVacancyId: string | null }> }
      setHhSyncMeta((data.vacancies ?? []).find(v => v.hhVacancyId === hhVacId) ?? null)
    } catch { /* silent */ }
  }, [apiVacancy?.hhVacancyId])

  const loadHhPending = useCallback(async () => {
    const hhVacId = apiVacancy?.hhVacancyId
    if (!hhVacId) return
    try {
      const res = await fetch("/api/integrations/hh/responses")
      const data = await res.json() as { responses?: Array<{ hhVacancyId: string; status: string }> }
      const count = (data.responses ?? []).filter(r => r.hhVacancyId === hhVacId && r.status === "response").length
      setHhPendingResponses(count)
    } catch { /* silent */ }
  }, [apiVacancy?.hhVacancyId])

  useEffect(() => {
    if (hhConnected !== true || !apiVacancy?.hhVacancyId) return
    loadHhSyncMeta()
    loadHhPending()
  }, [hhConnected, apiVacancy?.hhVacancyId, loadHhSyncMeta, loadHhPending])

  const handleHhSync = async () => {
    setHhSyncing(true)
    try {
      await Promise.all([
        fetch("/api/integrations/hh/vacancies"),
        fetch("/api/integrations/hh/responses"),
      ])
      await Promise.all([loadHhSyncMeta(), loadHhPending()])
      refetchCandidates(); refetchVacancy()
      toast.success("Синхронизировано с hh.ru")
    } catch { toast.error("Ошибка синхронизации") }
    finally { setHhSyncing(false) }
  }

  // Live stats для карточки источника hh.ru на табе «Настройки»
  const [hhStats, setHhStats] = useState<{ totalResponses: number; newResponses: number; lastSyncAt: string | null } | null>(null)
  const loadHhStats = useCallback(async () => {
    if (!apiVacancy?.hhVacancyId) { setHhStats(null); return }
    try {
      const res = await fetch(`/api/integrations/hh/vacancies/${id}/stats`)
      if (!res.ok) return
      const data = await res.json() as { totalResponses: number; newResponses: number; lastSyncAt: string | null }
      setHhStats({ totalResponses: data.totalResponses, newResponses: data.newResponses, lastSyncAt: data.lastSyncAt })
    } catch { /* silent */ }
  }, [apiVacancy?.hhVacancyId, id])

  useEffect(() => {
    if (!apiVacancy?.hhVacancyId) { setHhStats(null); return }
    loadHhStats()
  }, [apiVacancy?.hhVacancyId, loadHhStats])

  // Отвязка вакансии от hh.ru
  const [hhUnlinkOpen, setHhUnlinkOpen] = useState(false)
  const [hhUnlinking, setHhUnlinking] = useState(false)

  const handleHhUnlink = async () => {
    setHhUnlinking(true)
    try {
      const res = await fetch(`/api/integrations/hh/vacancies/${id}/unlink`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || "Не удалось отвязать")
      }
      toast.success("Вакансия отвязана от hh.ru")
      setHhUnlinkOpen(false)
      setHhStats(null)
      setHhSyncMeta(null)
      setHhPendingResponses(null)
      await refetchVacancy()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка отвязки")
    } finally {
      setHhUnlinking(false)
    }
  }

  const formatHhSyncDate = (iso: string | null): string => {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    const dd = String(d.getDate()).padStart(2, "0")
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    return `${dd}.${mm} в ${hh}:${mi}`
  }

  const relativeHhSyncTime = (date: string | null | undefined): string => {
    if (!date) return "—"
    const diff = Date.now() - new Date(date).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return "только что"
    if (min < 60) return `${min} мин`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} ч`
    if (hr < 48) return "вчера"
    return `${Math.floor(hr / 24)} дн.`
  }

  // ── Persist status changes to API ──────────────────────
  const updateVacancyStatus = async (newStatus: VacancyStatus) => {
    setStatus(newStatus)
    try {
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch { /* status already set optimistically */ }
  }

  // ── Edit mode state ──────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ title: "", city: "", salaryMin: "", salaryMax: "", experience: "", employment: "", schedule: "" })
  const [editSaving, setEditSaving] = useState(false)

  const startEditing = () => {
    setEditForm({
      title: apiVacancy?.title ?? "",
      city: apiVacancy?.city ?? "",
      salaryMin: apiVacancy?.salaryMin?.toString() ?? "",
      salaryMax: apiVacancy?.salaryMax?.toString() ?? "",
      experience: apiVacancy?.experience ?? "",
      employment: apiVacancy?.employment ?? "",
      schedule: apiVacancy?.schedule ?? "",
    })
    setEditMode(true)
  }

  const saveEdit = async () => {
    setEditSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title || undefined,
          city: editForm.city || undefined,
          salary_min: editForm.salaryMin ? parseInt(editForm.salaryMin) : undefined,
          salary_max: editForm.salaryMax ? parseInt(editForm.salaryMax) : undefined,
          experience: editForm.experience || undefined,
          employment: editForm.employment || undefined,
          schedule: editForm.schedule || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия обновлена")
      setEditMode(false)
      // Reload page to get fresh data
      window.location.reload()
    } catch { toast.error("Ошибка сохранения") }
    finally { setEditSaving(false) }
  }

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

  // ── AI Screening ──
  const [screeningIds, setScreeningIds] = useState<Set<string>>(new Set())
  const [bulkScreening, setBulkScreening] = useState(false)

  const screenCandidate = async (candidateId: string) => {
    const candidate = apiCandidates.find(c => c.id === candidateId)
    if (!candidate) return
    const anketa = ((apiVacancy?.descriptionJson as Record<string, unknown>)?.anketa as Record<string, unknown>) || {}

    setScreeningIds(prev => new Set(prev).add(candidateId))
    try {
      const res = await fetch("/api/ai/screen-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateData: {
            name: candidate.name,
            experience: candidate.experience,
            skills: candidate.skills,
            city: candidate.city,
            salary: candidate.salaryMin ? `${candidate.salaryMin}-${candidate.salaryMax}` : undefined,
          },
          vacancyAnketa: {
            vacancyTitle: apiVacancy?.title,
            requirements: anketa.requirements,
            responsibilities: anketa.responsibilities,
            requiredSkills: anketa.requiredSkills,
            desiredSkills: anketa.desiredSkills,
            experienceMin: anketa.experienceMin,
            positionCity: anketa.positionCity,
          },
        }),
      })
      if (!res.ok) throw new Error()
      const result = (await res.json()) as { score: number; verdict: string; recommendation: string; strengths: string[]; weaknesses: string[] }

      // Save to DB
      await fetch(`/api/modules/hr/candidates/${candidateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_score: result.score,
          ai_summary: result.recommendation,
          ai_details: [
            ...result.strengths.map(s => ({ question: "Сильная сторона", score: 1, comment: s })),
            ...result.weaknesses.map(w => ({ question: "Слабая сторона", score: 0, comment: w })),
          ],
        }),
      })
      refetchCandidates()
    } catch { /* silent */ }
    finally {
      setScreeningIds(prev => { const n = new Set(prev); n.delete(candidateId); return n })
    }
  }

  const screenAllNew = async () => {
    const newCandidates = apiCandidates.filter(c => c.stage === "new" && c.aiScore == null)
    if (newCandidates.length === 0) { toast.info("Нет новых кандидатов для скрининга"); return }
    setBulkScreening(true)
    for (const c of newCandidates) {
      await screenCandidate(c.id)
    }
    setBulkScreening(false)
    toast.success(`AI-скрининг завершён: ${newCandidates.length} кандидатов`)
  }

  // ── Talent Pool Radar ──
  const [talentMatches, setTalentMatches] = useState<{ id: string; name: string; matchPercent: number; aiScore: number | null; city: string | null }[]>([])
  const [talentRadarHidden, setTalentRadarHidden] = useState(false)
  const [talentRadarLoaded, setTalentRadarLoaded] = useState(false)

  useEffect(() => {
    if (!id || apiCandidates.length > 0 || talentRadarLoaded) return
    setTalentRadarLoaded(true)
    fetch(`/api/modules/hr/talent-pool/match?vacancy_id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { id: string; name: string; matchPercent: number; aiScore: number | null; city: string | null }[] | null) => {
        if (data && data.length > 0) setTalentMatches(data)
      })
      .catch(() => {})
  }, [id, apiCandidates.length, talentRadarLoaded])

  const inviteFromPool = async (candidateId: string) => {
    await updateStage(candidateId, "new")
    setTalentMatches(prev => prev.filter(c => c.id !== candidateId))
    toast.success("Кандидат приглашён из Talent Pool")
    refetchCandidates()
  }

  // ── Health check ──
  const [healthScore, setHealthScore] = useState<number | null>(null)
  const [healthIssues, setHealthIssues] = useState<{ type: string; severity: string; message: string; action: string; tab?: string }[]>([])
  const [healthNextStep, setHealthNextStep] = useState("")
  const healthLoadedRef = useRef(false)

  useEffect(() => {
    if (!id || healthLoadedRef.current) return
    healthLoadedRef.current = true
    fetch("/api/ai/vacancy-health-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vacancyId: id }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { score: number; issues: typeof healthIssues; nextStep: string } | null) => {
        if (data) {
          setHealthScore(data.score)
          setHealthIssues(data.issues)
          setHealthNextStep(data.nextStep)
        }
      })
      .catch(() => {})
  }, [id])

  // ── Auto-setup ──
  const [autoSetupOpen, setAutoSetupOpen] = useState(false)
  const [autoSetupRunning, setAutoSetupRunning] = useState(false)
  const [autoSetupStep, setAutoSetupStep] = useState("")
  const [autoSetupDone, setAutoSetupDone] = useState(false)

  const handleAutoSetup = async () => {
    setAutoSetupRunning(true)
    try {
      setAutoSetupStep("Генерирую описание для hh.ru...")
      await fetch("/api/ai/generate-hh-description", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anketa }),
      }).catch(() => {})

      setAutoSetupStep("Создаю демонстрацию должности...")
      await fetch("/api/modules/hr/demo/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId: id, template: "medium" }),
      }).catch(() => {})

      setAutoSetupStep("Настраиваю воронку...")
      const salary = apiVacancy?.salaryMax || apiVacancy?.salaryMin || 0
      const preset = salary < 100000 ? "fast" : salary >= 500000 ? "deep" : "standard"
      const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { ...existing, pipeline: { preset, stages: [] } } }),
      }).catch(() => {})

      setAutoSetupStep("Готово!")
      setAutoSetupDone(true)
      toast.success("Вакансия настроена автоматически")
      healthLoadedRef.current = false // Re-check health
    } catch {
      toast.error("Не удалось завершить настройку")
    } finally {
      setAutoSetupRunning(false)
    }
  }

  // ── AI tools handlers ──
  const anketa = ((apiVacancy?.descriptionJson as Record<string, unknown>)?.anketa as Record<string, unknown>) || {}

  const handleCompare = async () => {
    const top = apiCandidates
      .filter(c => c.aiScore != null)
      .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
      .slice(0, 5)
    if (top.length < 2) { toast.error("Нужно минимум 2 кандидата с AI-скором"); return }
    setCompareOpen(true)
    setCompareLoading(true)
    try {
      const res = await fetch("/api/ai/compare-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: top.map(c => ({ name: c.name, skills: c.skills, experience: c.experience, aiScore: c.aiScore })),
          vacancyRequirements: String(anketa.requirements || ""),
        }),
      })
      if (!res.ok) throw new Error()
      setCompareResult(await res.json())
    } catch { toast.error("Ошибка сравнения") }
    finally { setCompareLoading(false) }
  }

  const handleQuestions = async (candidateId: string) => {
    const c = apiCandidates.find(x => x.id === candidateId)
    if (!c) return
    setQuestionsCandidate(c.name)
    setQuestionsOpen(true)
    setQuestionsLoading(true)
    try {
      const res = await fetch("/api/ai/interview-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateData: { name: c.name, experience: c.experience, skills: c.skills, aiScore: c.aiScore },
          vacancyAnketa: { vacancyTitle: apiVacancy?.title, responsibilities: anketa.responsibilities, requirements: anketa.requirements },
        }),
      })
      if (!res.ok) throw new Error()
      setQuestionsResult(await res.json())
    } catch { toast.error("Ошибка генерации вопросов") }
    finally { setQuestionsLoading(false) }
  }

  const handleRefCheck = async (candidateId: string) => {
    const c = apiCandidates.find(x => x.id === candidateId)
    if (!c) return
    setRefCheckOpen(true)
    setRefCheckLoading(true)
    try {
      const res = await fetch("/api/ai/reference-check-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateName: c.name, position: apiVacancy?.title, responsibilities: anketa.responsibilities, candidateExperience: c.experience }),
      })
      if (!res.ok) throw new Error()
      setRefCheckResult(await res.json())
    } catch { toast.error("Ошибка генерации") }
    finally { setRefCheckLoading(false) }
  }

  const handleGenerateOffer = async (candidateId: string) => {
    const c = apiCandidates.find(x => x.id === candidateId)
    if (!c) return
    setOfferOpen(true)
    setOfferLoading(true)
    setOfferEditing(false)
    try {
      const conditions = Array.isArray(anketa.conditions) ? (anketa.conditions as string[]).join(", ") : ""
      const res = await fetch("/api/ai/generate-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: c.name,
          position: apiVacancy?.title,
          salary: apiVacancy?.salaryMin && apiVacancy?.salaryMax ? `${apiVacancy.salaryMin.toLocaleString("ru")} — ${apiVacancy.salaryMax.toLocaleString("ru")} ₽` : "",
          conditions,
          companyName: String(anketa.companyName || ""),
        }),
      })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { html: string }
      setOfferHtml(data.html)
    } catch { toast.error("Ошибка генерации оффера") }
    finally { setOfferLoading(false) }
  }

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
          {/* ═══ Fixed header: появляется только при скролле (под DashboardHeader) ═══ */}
          <div
            className={cn(
              "fixed top-14 right-0 z-40 bg-background/95 backdrop-blur-sm border-b shadow-sm py-2 transition-all duration-200",
              showStickyHeader ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
            )}
            style={{ left: "var(--sidebar-width, 16rem)", paddingLeft: 56, paddingRight: 56 }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <h2 className="text-sm font-medium text-foreground truncate">{internalName || vacancyTitle}</h2>
                <Badge variant="outline" className={cn("text-[10px] shrink-0", statusCfg.color)}>{statusCfg.label}</Badge>
              </div>
              {advisorScore.score > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn(
                      "h-full rounded-full transition-all",
                      advisorScore.score >= 70 ? "bg-emerald-500" : advisorScore.score >= 40 ? "bg-amber-500" : "bg-red-500"
                    )} style={{ width: `${advisorScore.score}%` }} />
                  </div>
                  <span className="text-sm font-medium tabular-nums">{advisorScore.score}%</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    advisorScore.score >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : advisorScore.score >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  )}>
                    {advisorScore.label}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* ═══ Breadcrumb ═══════════════════════════════ */}
            <Button variant="ghost" size="sm" className="gap-1 text-sm text-muted-foreground -ml-2 mb-2" onClick={() => router.push("/hr/vacancies")}>
              <ChevronLeft className="w-3.5 h-3.5" />
              Все вакансии
            </Button>

            {/* ═══ ШАПКА ═══════════════════════════════════ */}
            <div ref={mainHeaderRef} className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  {isEditingName ? (
                    <input
                      autoFocus
                      disabled={savingName}
                      className="flex-1 min-w-[320px] w-full text-xl sm:text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5"
                      value={internalName}
                      onChange={(e) => setInternalName(e.target.value)}
                      onBlur={async () => { await saveVacancyName(internalName); setIsEditingName(false) }}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
                        if (e.key === "Escape") { setInternalName(apiVacancy?.title ?? ""); setIsEditingName(false) }
                      }}
                      placeholder="Название"
                    />
                  ) : (
                    <button className="flex items-center gap-2 group text-left" onClick={() => setIsEditingName(true)}>
                      <h1 className="text-xl sm:text-2xl font-semibold text-foreground line-clamp-2">{internalName || vacancyTitle}</h1>
                      <Pencil className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </button>
                  )}
                  <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
                  {status === "active" && apiVacancy?.createdAt && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" />{Math.floor((Date.now() - new Date(apiVacancy.createdAt).getTime()) / 86400000)} дн.</span>}
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={async () => {
                          const code = apiVacancy?.shortCode
                          if (code) {
                            window.open(`${window.location.origin}/demo/${code}0000?as=hr`, "_blank", "noopener,noreferrer")
                            return
                          }
                          try {
                            const res = await fetch(`/api/modules/hr/vacancies/${id}/preview-link`)
                            const json = await res.json()
                            const path = json?.data?.url || json?.url
                            if (!path) { toast.error("Не удалось открыть превью"); return }
                            const sep = path.includes("?") ? "&" : "?"
                            window.open(`${window.location.origin}${path}${sep}as=hr`, "_blank", "noopener,noreferrer")
                          } catch {
                            toast.error("Не удалось открыть превью")
                          }
                        }}
                        aria-label="Открыть как директор"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Eye className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Открыть как директор (ответы не сохраняются)</TooltipContent>
                  </UITooltip>
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span>{apiVacancy?.city ?? "Москва"}</span>
                  {activeTab === "candidates" && <>
                    <span>·</span>
                    <span><span className="font-medium text-foreground">{hhSyncMeta?.responsesCount ?? apiCandidates.length}</span> откликов</span>
                    <span>·</span>
                    <span><span className="font-medium text-foreground">{apiCandidates.length}</span> кандидатов</span>
                    <span>·</span>
                    <span><span className={cn("font-medium", (hhPendingResponses ?? 0) > 0 ? "text-amber-700" : "text-foreground")}>{hhPendingResponses ?? 0}</span> необраб.</span>
                    <span>·</span>
                    <span><span className="font-medium text-foreground">{apiCandidates.filter(c => c.demoProgressJson != null).length}</span> в демо</span>
                    {hhConnected === true && apiVacancy?.hhVacancyId && hhSyncMeta && (<>
                      <span>·</span>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleHhSync}
                            disabled={hhSyncing}
                            aria-label="Синхронизировать с hh"
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-accent disabled:opacity-50 transition-colors"
                          >
                            {hhSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Синхронизировать с hh • синх. {relativeHhSyncTime(hhSyncMeta.syncedAt)} назад
                        </TooltipContent>
                      </UITooltip>
                    </>)}
                  </>}
                </div>
                <input
                  ref={anketaFileInputRef}
                  type="file"
                  accept=".docx,.doc,.pdf,.txt"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnketaFileUpload(f); e.target.value = "" }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      Действия<ChevronDown className="size-3 ml-0.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(status === "draft" || status === "paused") && (
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { updateVacancyStatus("active"); toast.success("Вакансия запущена") }}>
                        <Play className="size-3.5" />Запустить
                      </DropdownMenuItem>
                    )}
                    {(status === "draft" || status === "paused") && <DropdownMenuSeparator />}
                    {apiCandidates.length > 0 && (
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => {
                        const stageLabels: Record<string, string> = { new: "Новые", demo: "Демо", decision: "Решение", interview: "Интервью", final_decision: "Финал", hired: "Наняты", rejected: "Отказ" }
                        const stageCounts: Record<string, number> = {}
                        for (const c of apiCandidates) { const s = c.stage || "new"; stageCounts[s] = (stageCounts[s] || 0) + 1 }
                        const topCandidates = apiCandidates.filter(c => c.aiScore != null).sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0)).slice(0, 10)
                        const html = `<html><head><title>Отчёт: ${vacancyTitle}</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a}h1{font-size:22px}h2{font-size:16px;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:8px;text-size:13px;text-align:left}th{background:#f5f5f5}.bar{height:16px;background:#6366f1;border-radius:4px}@media print{body{margin:20px}}</style></head><body>
<h1>${vacancyTitle}</h1><p>Статус: ${status} | Город: ${apiVacancy?.city || "—"} | ЗП: ${apiVacancy?.salaryMin ? apiVacancy.salaryMin.toLocaleString("ru") : "—"} — ${apiVacancy?.salaryMax ? apiVacancy.salaryMax.toLocaleString("ru") : "—"} ₽</p>
<h2>Воронка (${apiCandidates.length} кандидатов)</h2><table><tr><th>Этап</th><th>Кол-во</th></tr>${Object.entries(stageCounts).map(([s, n]) => `<tr><td>${stageLabels[s] || s}</td><td>${n}</td></tr>`).join("")}</table>
${topCandidates.length > 0 ? `<h2>Топ кандидаты</h2><table><tr><th>Имя</th><th>AI-скор</th><th>Этап</th><th>Источник</th></tr>${topCandidates.map(c => `<tr><td>${c.name}</td><td>${c.aiScore}</td><td>${stageLabels[c.stage || "new"] || c.stage}</td><td>${c.source || "—"}</td></tr>`).join("")}</table>` : ""}
${healthScore !== null ? `<h2>Готовность: ${healthScore}%</h2>` : ""}
<p style="color:#999;font-size:11px;margin-top:40px">Сгенерировано Company24.pro</p></body></html>`
                        const w = window.open("", "_blank")
                        if (w) { w.document.write(html); w.document.close(); w.print() }
                      }}>
                        <Download className="size-3.5" />Отчёт PDF
                      </DropdownMenuItem>
                    )}
                    {apiCandidates.length > 0 && (
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={async () => {
                        const XLSX = (await import("xlsx")).default
                        const data = apiCandidates.map(c => ({
                          "Имя": c.name,
                          "Email": c.email || "",
                          "Телефон": c.phone || "",
                          "Город": c.city || "",
                          "Источник": c.source || "",
                          "Этап": c.stage || "",
                          "AI-скор": c.aiScore ?? "",
                          "Вердикт": c.aiScore != null ? (c.aiScore >= 70 ? "подходит" : c.aiScore >= 40 ? "возможно" : "не подходит") : "",
                          "Дата": c.createdAt ? new Date(c.createdAt).toLocaleDateString("ru-RU") : "",
                        }))
                        const ws = XLSX.utils.json_to_sheet(data)
                        const wb = XLSX.utils.book_new()
                        XLSX.utils.book_append_sheet(wb, ws, "Кандидаты")
                        XLSX.writeFile(wb, `кандидаты-${vacancyTitle}.xlsx`)
                        toast.success("Экспорт готов")
                      }}>
                        <Download className="size-3.5" />Экспорт Excel
                      </DropdownMenuItem>
                    )}
                    {apiCandidates.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem className="gap-2 cursor-pointer" disabled={duplicating} onClick={handleDuplicate}>
                      {duplicating ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}Создать похожую
                    </DropdownMenuItem>
                    {(status === "draft" || status === "paused") && (
                      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { updateVacancyStatus("closed_cancelled"); toast("В архив") }}>
                        <Archive className="size-3.5" />В архив
                      </DropdownMenuItem>
                    )}
                    {(status === "active" || status === "paused") && <DropdownMenuSeparator />}
                    {status === "active" && (
                      <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => { updateVacancyStatus("paused"); toast.warning("Вакансия приостановлена") }}>
                        <Pause className="size-3.5" />Остановить
                      </DropdownMenuItem>
                    )}
                    {(status === "active" || status === "paused") && (
                      <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => { updateVacancyStatus("closed_cancelled"); toast.warning("Вакансия отменена") }}>
                        <X className="size-3.5" />Закрыть вакансию
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* ═══ Шапка: Готовность (только для draft) ══ */}
            {status === "draft" && healthScore !== null && (
              <div className="mb-4 rounded-lg border p-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">Готовность вакансии</span>
                      <span className={cn(
                        "text-xs font-bold",
                        healthScore >= 80 ? "text-emerald-600" : healthScore >= 50 ? "text-amber-600" : "text-red-600"
                      )}>{healthScore}%</span>
                    </div>
                    <Progress value={healthScore} className={cn("h-1.5", healthScore >= 80 ? "[&>div]:bg-emerald-500" : healthScore >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500")} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {healthIssues.filter(i => i.severity !== "ok").map(i => (
                    <button key={i.type} type="button"
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border",
                        i.severity === "critical" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800" : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800"
                      )}
                      onClick={() => { if (i.tab) setActiveTab(i.tab) }}
                    >
                      {i.severity === "critical" ? "●" : "○"} {i.message}
                    </button>
                  ))}
                  {healthIssues.filter(i => i.severity === "ok").length > 0 && (
                    <span className="text-[11px] text-emerald-600 px-2 py-0.5">
                      ✓ {healthIssues.filter(i => i.severity === "ok").length} готово
                    </span>
                  )}
                </div>
                {healthNextStep && healthScore < 100 && (
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[11px] text-muted-foreground">Следующий шаг: {healthNextStep}</p>
                    {healthScore >= 40 && healthScore < 90 && !autoSetupDone && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] gap-1 shrink-0"
                        onClick={handleAutoSetup}
                        disabled={autoSetupRunning}
                        title="На основе анкеты: сгенерирует описание для hh.ru, создаст демонстрацию должности и настроит воронку найма"
                      >
                        {autoSetupRunning ? <><Loader2 className="w-3 h-3 animate-spin" />{autoSetupStep}</> : <><Sparkles className="w-3 h-3" />Создать описание, демо и воронку</>}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══ ТАБЫ + ВИД в одной строке ══════════════════ */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between gap-3 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabsList className="shrink-0">
                  {(status === "active" ? [
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "course", icon: BookOpen, label: "Демонстрация" },
                    { value: "anketa", icon: ClipboardList, label: "Анкета" },
                  ] : [
                    { value: "anketa", icon: ClipboardList, label: "Анкета" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "course", icon: BookOpen, label: "Демонстрация" },
                  ]).map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                      <tab.icon className="w-3.5 h-3.5" />{tab.label}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="settings" className="gap-1.5"><Settings className="w-3.5 h-3.5" />Настройки</TabsTrigger>
                </TabsList>

                {activeTab === "candidates" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {hhConnected === true && apiVacancy?.hhVacancyId && hhSyncMeta && (
                      <HhAutoProcess
                        vacancyId={id}
                        defaultMinScore={
                          ((apiVacancy?.aiProcessSettings as { minScore?: number } | null)?.minScore) ?? 70
                        }
                        onProcessed={() => { refetchCandidates(); handleHhSync() }}
                      />
                    )}
                    <CandidateFilters filters={filters} onFiltersChange={setFilters} candidates={columns.flatMap((c) => c.candidates)} />
                    <SortMenu sortMode={sortMode} onSortChange={setSortMode} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                          Ещё
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={screenAllNew} disabled={bulkScreening}>
                          {bulkScreening ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                          {bulkScreening ? "Скрининг..." : "AI-оценить новых"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCompare}>
                          <BarChart3 className="w-3.5 h-3.5 mr-2" />
                          Сравнить топ
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ViewSettings
                      settings={cardSettings}
                      onSettingsChange={setCardSettings}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                    />
                  </div>
                )}
                {activeTab === "anketa" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" disabled={pasteBusy}>
                          {pasteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Заполнить из...
                          <ChevronDown className="w-3 h-3 ml-0.5 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setTextDialogOpen(true)}>
                          <ClipboardList className="size-3.5" />Вставить текст
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setLibraryDialogOpen(true); loadLibrary() }}>
                          <BookOpen className="size-3.5" />Из библиотеки
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => anketaFileInputRef.current?.click()}>
                          <Upload className="size-3.5" />Загрузить файл
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setHhImportDialogOpen(true)}>
                          <Globe className="size-3.5" />Импорт с hh.ru
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                {activeTab === "course" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative">
                      <div className="flex items-center">
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 rounded-r-none border-r-0" onClick={() => courseEditorRef.current?.save()}>
                          {courseEditorSaveStatus === "saving" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Сохранить
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 px-2 rounded-l-none">
                              <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => courseEditorRef.current?.openSaveTemplate()}>
                              <Save className="w-3.5 h-3.5" />В библиотеку
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => courseEditorRef.current?.downloadTxt()}>
                              <Download className="w-3.5 h-3.5" />Скачать
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <span className={cn("absolute left-1/2 -translate-x-1/2 top-full mt-0.5 text-[10px] leading-none whitespace-nowrap transition-colors", courseEditorSaveStatus === "saving" ? "text-amber-500" : "text-muted-foreground/40")}>
                        {courseEditorSaveStatus === "saving" ? "Сохранение..." : "✓ Сохранено"}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                          <Sparkles className="w-3.5 h-3.5" />Создать из...
                          <ChevronDown className="w-3 h-3 ml-0.5 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => courseTabRef.current?.openAiGenerate()}>
                          <Sparkles className="w-3.5 h-3.5" />Сгенерировать с AI
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => courseEditorRef.current?.openLibrary()}>
                          <BookOpen className="w-3.5 h-3.5" />Из библиотеки
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => courseTabRef.current?.openFileUpload()}>
                          <Upload className="w-3.5 h-3.5" />Загрузить файл
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <AnketaTab vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} onTitleChange={(t) => { if (t) setInternalName(t) }} onNavigateTab={(tab) => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }) }} onScoreChange={setAdvisorScore} />
              </TabsContent>

              <TabsContent value="candidates">
                {/* Talent Pool radar */}
                {talentMatches.length > 0 && !talentRadarHidden && (
                  <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />В Talent Pool найдено {talentMatches.length} подходящих кандидатов</p>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setTalentRadarHidden(true)}><X className="w-3 h-3" /></Button>
                    </div>
                    <div className="space-y-1.5">
                      {talentMatches.map(c => (
                        <div key={c.id} className="flex items-center gap-3 bg-white dark:bg-gray-950 rounded-md px-3 py-2 border">
                          <span className="text-sm font-medium flex-1">{c.name}</span>
                          {c.city && <span className="text-xs text-muted-foreground">{c.city}</span>}
                          <Badge variant="secondary" className="text-xs">{c.matchPercent}% совпадение</Badge>
                          {c.aiScore != null && <Badge variant="outline" className="text-xs">AI {c.aiScore}</Badge>}
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => inviteFromPool(c.id)}>Пригласить</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bulkScreening && <div className="mb-3 text-xs text-muted-foreground">AI анализирует кандидатов...</div>}
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
                  }}
                  onAction={handleAction}
                  onToggleFavorite={handleToggleFavorite}
                  hideViewSwitcher
                  onAddCustomColumn={handleAddCustomColumn}
                  onRemoveColumn={handleRemoveColumn}
                  sortMode={sortMode}
                  listSort={listSort}
                  onListSortChange={setListSort}
                />
              </TabsContent>

              <TabsContent value="course">
                <CourseTab
                  vacancyId={id}
                  vacancyTitle={vacancyTitle}
                  editorRef={courseEditorRef}
                  tabRef={courseTabRef}
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

              <TabsContent value="settings">
                {/* Сабнав: Общие / Автоматизация */}
                <div className="flex items-center gap-1 mb-4 border-b">
                  {([
                    { value: "general" as const, label: "Общие", icon: Settings },
                    { value: "automation" as const, label: "Автоматизация", icon: Zap },
                  ]).map((s) => {
                    const Icon = s.icon
                    const active = settingsSection === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => {
                          setSettingsSection(s.value)
                          const sp = new URLSearchParams(window.location.search)
                          sp.set("tab", "settings")
                          if (s.value === "automation") sp.set("section", "automation")
                          else sp.delete("section")
                          router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                          active
                            ? "border-primary text-foreground font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {s.label}
                      </button>
                    )
                  })}
                </div>

                {settingsSection === "automation" && (
                  <div>
                    <AutomationSettings vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} vacancyTitle={apiVacancy?.title} salaryFrom={apiVacancy?.salaryMin} salaryTo={apiVacancy?.salaryMax} />
                    <div className="mt-6">
                      <VacancyAiProcessSettings
                        vacancyId={id}
                        initial={apiVacancy?.aiProcessSettings ?? null}
                        onSaved={() => refetchVacancy()}
                      />
                    </div>
                    <div className="mt-6">
                      <PostDemoSettings vacancyId={id} />
                    </div>
                  </div>
                )}

                {settingsSection === "general" && (
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
                        {apiVacancy?.hhVacancyId ? (
                          <div className="rounded-lg border bg-card p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#D6001C" }}>hh</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">hh.ru</p>
                                <p className="text-[11px] text-muted-foreground">Привязана к hh-вакансии {apiVacancy.hhVacancyId}</p>
                              </div>
                              <Badge variant="outline" className="text-xs h-6 bg-emerald-500/10 text-emerald-700 border-emerald-200 shrink-0">Привязана</Badge>
                              {apiVacancy.hhUrl && (
                                <a href={apiVacancy.hhUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1">
                                  Открыть на hh.ru <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                                onClick={() => setHhUnlinkOpen(true)}
                              >
                                Отвязать
                              </Button>
                            </div>
                            <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted text-[11px] text-muted-foreground">
                                <span aria-hidden>📥</span>
                                <span>Откликов:</span>
                                <span className="font-medium text-foreground">{hhStats ? (hhStats.totalResponses > 0 ? hhStats.totalResponses : "—") : "…"}</span>
                              </span>
                              <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted text-[11px] text-muted-foreground">
                                <span aria-hidden>🆕</span>
                                <span>Необраб.:</span>
                                <span className="font-medium text-foreground">{hhStats ? (hhStats.newResponses > 0 ? hhStats.newResponses : "—") : "…"}</span>
                              </span>
                              <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted text-[11px] text-muted-foreground">
                                <span aria-hidden>🔄</span>
                                <span>Синк:</span>
                                <span className="font-medium text-foreground">{hhStats ? formatHhSyncDate(hhStats.lastSyncAt) : "…"}</span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#D6001C" }}>hh</div>
                            <div className="flex-1 min-w-0"><p className="text-sm font-medium">hh.ru</p><p className="text-[11px] text-muted-foreground">Эта вакансия не привязана. Привязка делается в табе «Кандидаты».</p></div>
                            <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не привязана</Badge>
                          </div>
                        )}
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
                  </div>
                </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ═══ Bottom tab navigation ══════════════════ */}
            {(() => {
              const tabOrder = status === "active"
                ? ["candidates", "analytics", "course", "anketa", "settings"]
                : ["anketa", "analytics", "candidates", "course", "settings"]
              const tabLabels: Record<string, string> = { anketa: "Анкета", course: "Демонстрация", candidates: "Кандидаты", analytics: "Аналитика", settings: "Настройки" }
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

      {/* ── Paste text dialog ── */}
      <Dialog open={textDialogOpen} onOpenChange={(o) => { if (!pasteBusy) { setTextDialogOpen(o); if (!o) setPasteText("") } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Вставить текст</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Вставьте описание вакансии — AI заполнит анкету. Существующие поля будут перезаписаны.</p>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Скопируйте описание с hh.ru, SuperJob или любого сайта..."
              className="h-48 resize-none text-sm"
              autoFocus
              disabled={pasteBusy}
            />
            <Button className="w-full h-10" onClick={handlePasteAndFill} disabled={pasteBusy || !pasteText.trim()}>
              {pasteBusy ? <><Loader2 className="size-4 mr-1.5 animate-spin" />{pasteProgress || "AI работает..."}</> : <><Sparkles className="size-4 mr-1.5" />Заполнить анкету AI</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── hh.ru import dialog ── */}
      <Dialog open={hhImportDialogOpen} onOpenChange={(o) => { if (!hhImportBusy) { setHhImportDialogOpen(o); if (!o) setHhImportUrl("") } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Импорт с hh.ru</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Вставьте ссылку на вакансию с hh.ru — данные будут загружены и анкета заполнена автоматически.</p>
            <Input
              value={hhImportUrl}
              onChange={(e) => setHhImportUrl(e.target.value)}
              placeholder="Вставьте ссылку на вакансию с hh.ru (например https://hh.ru/vacancy/12345678)"
              className="h-10 text-sm"
              autoFocus
              disabled={hhImportBusy}
              onKeyDown={(e) => { if (e.key === "Enter" && hhImportUrl.trim() && !hhImportBusy) handleHhVacancyImport() }}
            />
            <Button className="w-full h-10" onClick={handleHhVacancyImport} disabled={hhImportBusy || !hhImportUrl.trim()}>
              {hhImportBusy ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Импорт...</> : <><Globe className="size-4 mr-1.5" />Импортировать</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Library dialog ── */}
      <Dialog open={libraryDialogOpen} onOpenChange={(o) => { if (!libraryBusy) { setLibraryDialogOpen(o); if (!o) setLibrarySearch("") } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Из библиотеки</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Выберите существующую вакансию, чтобы скопировать анкету в текущую. Существующие поля будут перезаписаны.</p>
            <Input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Поиск по названию..."
              className="h-9"
              autoFocus
            />
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {libraryLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />Загрузка...
                </div>
              ) : libraryItems.filter(v => !librarySearch || v.title.toLowerCase().includes(librarySearch.toLowerCase())).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {librarySearch ? "Ничего не найдено" : "Нет вакансий в библиотеке"}
                </p>
              ) : (
                libraryItems
                  .filter(v => !librarySearch || v.title.toLowerCase().includes(librarySearch.toLowerCase()))
                  .map(v => {
                    const statusLabel = v.status === "active" || v.status === "published" ? "Активная" : v.status?.startsWith("closed") ? "Архив" : "Черновик"
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleApplyTemplate(v.id)}
                        disabled={libraryBusy}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-accent/50 hover:border-primary/30 transition-colors text-left disabled:opacity-50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{v.title}</p>
                          <p className="text-xs text-muted-foreground">{v.createdAt ? new Date(v.createdAt).toLocaleDateString("ru-RU") : ""}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{statusLabel}</Badge>
                      </button>
                    )
                  })
              )}
            </div>
            {libraryBusy && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                <Loader2 className="w-4 h-4 animate-spin" />Применяю шаблон...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                  // Suggest talent pool for candidates with decent AI score
                  if (candidate?.aiScore != null && candidate.aiScore >= 50) {
                    setTalentPoolCandidate(candidate)
                    setTalentPoolDialogOpen(true)
                  }
                }
                setRejectDialogOpen(false)
              }}
            >
              Отказать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Talent Pool suggestion dialog */}
      <AlertDialog open={talentPoolDialogOpen} onOpenChange={setTalentPoolDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Добавить в Talent Pool?</AlertDialogTitle>
            <AlertDialogDescription>
              Кандидат {talentPoolCandidate?.name} набрал {talentPoolCandidate?.aiScore} баллов AI-скрининга. Хотите сохранить его в Talent Pool для будущих вакансий?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (talentPoolCandidate) {
                await updateStage(talentPoolCandidate.id, "talent_pool")
                toast.success(`${talentPoolCandidate.name} добавлен в Talent Pool`)
              }
              setTalentPoolDialogOpen(false)
            }}>
              Добавить в пул
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение отвязки от hh.ru */}
      <AlertDialog open={hhUnlinkOpen} onOpenChange={(o) => { if (!hhUnlinking) setHhUnlinkOpen(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отвязать от hh-вакансии {apiVacancy?.hhVacancyId}?</AlertDialogTitle>
            <AlertDialogDescription>
              Все импортированные кандидаты останутся, но новые отклики не будут приходить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hhUnlinking}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={hhUnlinking}
              onClick={(e) => { e.preventDefault(); handleHhUnlink() }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {hhUnlinking ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Отвязка…</> : "Отвязать"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Compare candidates modal ── */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Сравнение кандидатов</DialogTitle></DialogHeader>
          {compareLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : compareResult ? (
            <div className="space-y-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${compareResult.table.length}, 1fr)` }}>
                {compareResult.table.map(c => (
                  <div key={c.candidateName} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{c.candidateName}</p>
                      <Badge variant="secondary" className={cn("text-xs", c.fitScore >= 70 ? "bg-emerald-100 text-emerald-700" : c.fitScore >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>{c.fitScore}</Badge>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-emerald-600 mb-1">Сильные стороны</p>
                      {c.pros.map((p, i) => <p key={i} className="text-xs text-muted-foreground">+ {p}</p>)}
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-red-600 mb-1">Слабые стороны</p>
                      {c.cons.map((p, i) => <p key={i} className="text-xs text-muted-foreground">- {p}</p>)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-medium text-primary mb-1">Рекомендация AI</p>
                <p className="text-sm">{compareResult.recommendation}</p>
                <p className="text-xs text-muted-foreground mt-1">{compareResult.summary}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Interview questions modal ── */}
      <Dialog open={questionsOpen} onOpenChange={setQuestionsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Вопросы для собеседования — {questionsCandidate}</DialogTitle>
          </DialogHeader>
          {questionsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {questionsResult.map((q, i) => {
                const typeColors: Record<string, string> = { behavioral: "bg-blue-100 text-blue-700", technical: "bg-violet-100 text-violet-700", situational: "bg-amber-100 text-amber-700", personal: "bg-rose-100 text-rose-700" }
                const typeLabels: Record<string, string> = { behavioral: "Поведенческий", technical: "Технический", situational: "Ситуационный", personal: "Персональный" }
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-5 shrink-0 mt-0.5">{i + 1}.</span>
                      <div className="flex-1">
                        <p className="text-sm">{q.question}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className={cn("text-[10px] h-4", typeColors[q.type] || "bg-gray-100")}>{typeLabels[q.type] || q.type}</Badge>
                          <span className="text-[10px] text-muted-foreground">Проверяем: {q.purpose}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {questionsResult.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={async () => {
                  await navigator.clipboard.writeText(questionsResult.map((q, i) => `${i + 1}. ${q.question}`).join("\n"))
                  toast.success("Скопировано")
                }}>
                  <Copy className="w-3 h-3" />Копировать все
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reference check modal ── */}
      <Dialog open={refCheckOpen} onOpenChange={setRefCheckOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Проверка рекомендаций</DialogTitle></DialogHeader>
          {refCheckLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : refCheckResult ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs font-medium mb-1">Вступительная фраза</p>
                <p className="text-sm italic">{refCheckResult.intro}</p>
              </div>
              <div className="space-y-2">
                {refCheckResult.questions.map((q, i) => (
                  <p key={i} className="text-sm"><span className="text-muted-foreground mr-2">{i + 1}.</span>{q}</p>
                ))}
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">На что обратить внимание</p>
                {refCheckResult.redFlags.map((f, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">• {f}</p>)}
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={async () => {
                const text = `${refCheckResult.intro}\n\n${refCheckResult.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nНа что обратить внимание:\n${refCheckResult.redFlags.map(f => `• ${f}`).join("\n")}`
                await navigator.clipboard.writeText(text)
                toast.success("Скопировано")
              }}>
                <Copy className="w-3 h-3" />Копировать всё
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Offer modal ── */}
      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Оффер кандидату</DialogTitle></DialogHeader>
          {offerLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : offerEditing ? (
            <div className="space-y-3">
              <Textarea value={offerHtml} onChange={e => setOfferHtml(e.target.value)} rows={15} className="font-mono text-xs" />
              <Button size="sm" className="text-xs" onClick={() => setOfferEditing(false)}>Превью</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="prose prose-sm max-w-none border rounded-lg p-4 [&_h2]:text-base [&_h3]:text-sm" dangerouslySetInnerHTML={{ __html: offerHtml }} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setOfferEditing(true)}>
                  <Pencil className="w-3 h-3" />Редактировать
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={async () => {
                  await navigator.clipboard.writeText(offerHtml.replace(/<[^>]+>/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
                  toast.success("Скопировано")
                }}>
                  <Copy className="w-3 h-3" />Копировать
                </Button>
              </div>
            </div>
          )}
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
        onToggleFavorite={handleToggleFavorite}
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
