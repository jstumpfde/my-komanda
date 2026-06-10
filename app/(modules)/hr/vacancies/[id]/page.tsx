"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth, isPlatformRole } from "@/lib/auth"
import { useVacancy } from "@/hooks/use-vacancies"
import { useCandidates, usePaginatedCandidates, type ApiCandidate, type PaginatedSortKey } from "@/hooks/use-candidates"
import { Pagination } from "@/components/dashboard/pagination"
import { useUserPreferences } from "@/hooks/use-user-preferences"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { KanbanBoard, type ViewMode } from "@/components/dashboard/kanban-board"
import type { ListSortKey, ListSortState } from "@/components/dashboard/list-view"
import { type CardDisplaySettings } from "@/components/dashboard/card-settings"
import { ViewSettings } from "@/components/dashboard/view-settings"
import { CandidateFilters, DEFAULT_FUNNEL_STATUSES, type FilterState } from "@/components/dashboard/candidate-filters"
import { applyCandidateFilters } from "@/lib/candidate-filter"
import { SortMenu } from "@/components/dashboard/sort-menu"
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { CandidateSortMode } from "@/lib/candidate-sort"
import { CandidateDrawer } from "@/components/candidates/candidate-drawer"
import { CandidateTrashSheet } from "@/components/candidates/candidate-trash-sheet"
import { RediscoverySheet } from "@/components/candidates/rediscovery-sheet"
import { RubricRankPanel } from "@/components/candidates/rubric-rank-panel"
import { BulkActionsBar, type BulkAction } from "@/components/dashboard/bulk-actions-bar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { ContentBlocksTab } from "@/components/vacancies/content-blocks-tab"
import { AnketaTab, type AnketaTabHandle } from "@/components/vacancies/anketa-tab"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import {Clock, Settings, BookOpen, BarChart3, Kanban, Pencil, MessageCircle, MessageSquareText, Zap, Globe, AlertTriangle, TrendingUp, Filter, X, Link2, Copy, Save, Sparkles, Eye, Check, Loader2, Download, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Users, Upload, RefreshCw, Bot, Workflow, FilePlus, UserSearch, Trash2, Target} from "lucide-react"
import { AiChatbotSettings } from "@/components/vacancies/ai-chatbot-settings"
import { VacancyStopFactorsSettings } from "@/components/vacancies/vacancy-stop-factors-settings"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { defaultColumnColors, COLUMN_ORDER, type CandidateAction, getNextColumnId, PROGRESS_BY_COLUMN } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { VacancyStatusBadge } from "@/components/vacancies/vacancy-status-badge"
import { HhAutoProcess } from "@/components/hh/hh-auto-process"
import { AutomationSettings, type AutomationSectionId } from "@/components/vacancies/automation-settings"
import { ScheduleTab } from "@/components/vacancies/schedule-tab"
import { PublishTab } from "@/components/vacancies/publish-tab"
import { OutboundSourcingTab } from "@/components/vacancies/outbound-sourcing-tab"
import { VacancyActionsMenuItems } from "@/components/vacancies/vacancy-actions-menu"
import { ExportCandidatesDialog } from "@/components/vacancies/export-candidates-dialog"
import { PermanentDeleteDialog } from "@/components/vacancies/permanent-delete-dialog"
import {
  getVacancyState,
  VACANCY_STATUS_ON_PAUSE, VACANCY_STATUS_ON_RESUME,
  VACANCY_STATUS_ON_CLOSE, VACANCY_STATUS_ON_RESTORE,
} from "@/lib/vacancies/lifecycle"
import { MiniFormBuilder } from "@/components/vacancies/mini-form-builder"
import { UtmLinksSection } from "@/components/vacancies/utm-links-section"
import { TelegramPosting } from "@/components/vacancies/telegram-posting"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import { VacancyAiProcessSettings } from "@/components/vacancies/vacancy-ai-process-settings"
import { VacancyRequirementsSettings } from "@/components/vacancies/vacancy-requirements-settings"
import { VacancyFollowupSettings } from "@/components/vacancies/vacancy-followup-settings"
import { VacancyTestFollowupSettings } from "@/components/vacancies/vacancy-test-followup-settings"
import { VacancyPrequalificationSettings } from "@/components/vacancies/vacancy-prequalification-settings"
import { VacancyStopWordsSettings } from "@/components/vacancies/vacancy-stop-words-settings"
import { FinalScreensSettings, type FinalScreensConfig } from "@/components/vacancies/final-screens-settings"
import { RecoveryMessageSettings } from "@/components/vacancies/recovery-message-settings"
import { FirstMessagesChainEditor } from "@/components/vacancies/first-messages-chain-editor"
import { FunnelBuilder } from "@/components/vacancies/funnel-builder"
import { SpecEditor } from "@/components/vacancies/spec-editor"
import { FunnelTab } from "@/components/vacancies/funnel-tab"
import { parsePipeline, type CompanyStageHhActions, type CompanyStagePalette } from "@/lib/stages"
import { BrandingOverrideSwitch } from "@/components/vacancies/branding-override-switch"
import { VacancySettingsProvider, VacancyTabPendingDot, VacancyStickySaveBar, useVacancySectionRegister, useSafeSubTabSwitch, type VacancyTabKey } from "@/components/vacancies/vacancy-settings-context"
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

type VacancyStatus = "draft" | "active" | "published" | "paused" | "closed_success" | "closed_cancelled" | "archived"

// Источник правды — COLUMN_ORDER из lib/column-config.ts. Object.entries
// над defaultColumnColors не гарантирует порядок и включает rejected
// (терминальный стейдж, не нужен в kanban). COLUMN_ORDER даёт явный порядок
// и исключает rejected/wants_contact.
function emptyColumns(): ColumnData[] {
  return COLUMN_ORDER.map((id) => {
    const c = defaultColumnColors[id]
    return {
      id,
      title: c?.label ?? id,
      count: 0,
      colorFrom: c?.from ?? "#94a3b8",
      colorTo:   c?.to   ?? "#64748b",
      candidates: [],
    }
  })
}

const defaultSettings: CardDisplaySettings = {
  showSalary: false, showSalaryFull: true, showScore: true, showAge: false,
  showSource: true, showCity: true, showExperience: true, showSkills: true, showActions: true,
  showProgress: true, showResponseDate: true,
}


// Извлекаем возраст из anketa_answers (форма /apply сохраняет birthDate либо
// объектом {birthDate: "YYYY-MM-DD"}, либо массивом [{blockId/key, answer}]).
function deriveAge(anketaAnswers: unknown): number | undefined {
  if (!anketaAnswers || typeof anketaAnswers !== "object") return undefined
  let birthRaw: string | undefined
  if (Array.isArray(anketaAnswers)) {
    for (const e of anketaAnswers as Record<string, unknown>[]) {
      if (!e || typeof e !== "object") continue
      const key = (e.blockId ?? e.fieldKey ?? e.key) as string | undefined
      if (key === "birthDate" || key === "birth_date" || key === "birthday") {
        const a = e.answer
        if (typeof a === "string") { birthRaw = a; break }
        if (a && typeof a === "object" && "value" in a && typeof (a as { value: unknown }).value === "string") {
          birthRaw = (a as { value: string }).value
          break
        }
      }
    }
  } else {
    const obj = anketaAnswers as Record<string, unknown>
    const v = obj.birthDate ?? obj.birth_date ?? obj.birthday
    if (typeof v === "string") birthRaw = v
  }
  if (!birthRaw) return undefined
  const birth = new Date(birthRaw)
  if (Number.isNaN(birth.getTime())) return undefined
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--
  return age >= 0 && age < 150 ? age : undefined
}

// Map ApiCandidate → Candidate (for the kanban card)
function apiCandidateToCard(c: ApiCandidate, columnId: string): Candidate {
  const progress = PROGRESS_BY_COLUMN[columnId] ?? 10
  const wf = c.workFormat
  const workFormat: Candidate["workFormat"] =
    wf === "office" || wf === "hybrid" || wf === "remote" ? wf : undefined
  return {
    id: c.id,
    name: c.name,
    city: c.city ?? "",
    salaryMin: c.salaryMin ?? 0,
    salaryMax: c.salaryMax ?? 0,
    salaryCurrency: c.salaryCurrency ?? null,
    score: c.score ?? 50,
    progress,
    source: c.source ?? "Прямая ссылка",
    experience: c.experience ?? "",
    skills: c.skills ?? [],
    addedAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    lastSeen: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    workFormat,
    aiScore: c.aiScore ?? undefined,
    aiSummary: c.aiSummary ?? undefined,
    aiVerdict: c.aiScore != null ? (c.aiScore >= 70 ? "подходит" : c.aiScore >= 40 ? "возможно" : "не подходит") : undefined,
    resumeScore: c.resumeScore ?? null,
    rubricScore: c.rubricScore ?? null,
    testScore: c.testScore ?? null,
    testStatus: c.testStatus ?? null,
    isActive: (c as { isActive?: boolean }).isActive ?? false,
    demoProgressJson: c.demoProgressJson as Candidate["demoProgressJson"],
    demoTotalBlocks: (c as { demoTotalBlocks?: number }).demoTotalBlocks,
    demoCompletedBlocks: (c as { demoCompletedBlocks?: number }).demoCompletedBlocks,
    progressPercent: (c as { progressPercent?: number | null }).progressPercent,
    isFavorite: c.isFavorite ?? false,
    createdAt: c.createdAt,
    stage: c.stage ?? null,
    // HR-020: фильтр-поля
    birthDate: c.birthDate ?? undefined,
    experienceYears: c.experienceYears ?? null,
    educationLevel: c.educationLevel ?? null,
    languages: c.languages ?? null,
    keySkills: c.keySkills ?? null,
    industry: c.industry ?? null,
    relocationReady: c.relocationReady ?? null,
    businessTripsReady: c.businessTripsReady ?? null,
    photoUrl: c.photoUrl ?? null,
  }
}

// Пункт меню «Действия». Включённый — обычный DropdownMenuItem. Выключенный —
// серый div с тултипом (у Radix disabled-item отключены pointer-events, и
// hover-тултип на нём не срабатывает, поэтому рендерим div-обёртку).
// Пункты меню действий вынесены в общий компонент
// components/vacancies/vacancy-actions-menu.tsx (ActionMenuItem /
// VacancyActionsMenuItems) — переиспользуется и в строке списка вакансий.

export default function VacancyPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  // B5: роль поднята наверх — нужна в setCardSettings и useEffect для user-prefs
  const { role } = useAuth()

  // ── Real API data ──────────────────────────────────────────
  const { vacancy: apiVacancy, loading: vacancyLoading, error: vacancyError, refetch: refetchVacancy } = useVacancy(id)

  // Company-дефолты hh-маппинга воронки — чтобы редактор стадий показывал их
  // (а не платформенные) для вакансий без своей воронки.
  const [companyHhActions, setCompanyHhActions] = useState<CompanyStageHhActions | undefined>(undefined)
  const [companyPalette, setCompanyPalette] = useState<CompanyStagePalette | undefined>(undefined)
  useEffect(() => {
    fetch("/api/modules/hr/company/hiring-defaults").then(r => r.ok ? r.json() : null).then(j => {
      const hd = j?.hiringDefaults
      const sha = hd?.stageHhActions
      if (sha && typeof sha === "object") setCompanyHhActions(sha as CompanyStageHhActions)
      if (hd && (hd.stageLabels || hd.stageColors)) {
        setCompanyPalette({ labels: hd.stageLabels, colors: hd.stageColors })
      }
      // Загружаем список бренд-компаний для брендинг-секции
      if (hd && Array.isArray(hd.brandCompanies)) {
        setBrandCompaniesData(hd.brandCompanies.filter((c: { id: string; name: string }) => c?.name?.trim()))
      }
      // B5: колонки списка кандидатов единые для компании
      if (hd?.candidateColumns && typeof hd.candidateColumns === "object" && Object.keys(hd.candidateColumns).length > 0) {
        setCardSettingsLocal((prev) => ({ ...prev, ...hd.candidateColumns } as typeof prev))
      }
    }).catch(() => {})
  }, [])

  // Загружаем основные данные компании (brandName, logoUrl, website, subdomain)
  useEffect(() => {
    fetch("/api/companies").then(r => r.ok ? r.json() : null).then(j => {
      const c = j?.data ?? j
      if (!c) return
      setMainCompanyData({
        brandName: c.brandName || c.name || "",
        logoUrl: c.logoUrl || "",
        brandSlogan: c.brandSlogan || "",
        website: c.website || "",
        subdomain: c.subdomain || "",
      })
    }).catch(() => {})
  }, [])

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
        // AI-профиль кандидата — заполняем из AI, не затирая ручное непустым→[].
        aiIdealProfile: (parsed.aiIdealProfile as string) || existingAnketa.aiIdealProfile || "",
        aiRequiredHardSkills: Array.isArray(parsed.aiRequiredHardSkills) && parsed.aiRequiredHardSkills.length
          ? parsed.aiRequiredHardSkills : (existingAnketa.aiRequiredHardSkills ?? []),
        aiStopFactors: Array.isArray(parsed.aiStopFactors) && parsed.aiStopFactors.length
          ? parsed.aiStopFactors : (existingAnketa.aiStopFactors ?? []),
        aiWeights: {
          ...((existingAnketa.aiWeights as Record<string, unknown>) || {}),
          ...((parsed.aiWeights as Record<string, unknown>) || {}),
        },
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
      toast.success("Вакансия заполнена")
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
      toast.success(`Заполнено из «${src.title}»`)
      setLibraryDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setLibraryBusy(false)
    }
  }
  const searchParams = useSearchParams()

  // Сортировка списка кандидатов — состояние в URL, чтобы переживало refresh.
  // resumeScore был пропущен — единственный ListSortKey, отсутствовавший в
  // списке. Из-за этого legacy-парсер listSort отбраковывал сортировку по
  // «AI-резм» как невалидную, и стрелка на этой колонке не появлялась (тогда
  // как на остальных — появлялась). Добавлен для паритета со всеми колонками.
  const VALID_SORT_KEYS: ListSortKey[] = ["favorite", "name", "aiScore", "resumeScore", "testScore", "progress", "salary", "responseDate", "status", "city", "source"]
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

  // Стадия из URL (?stage=slug,slug) — для перехода из отчёта по клику на число.
  const stageFromUrl = searchParams?.get("stage")
  const initialFunnelStatuses = stageFromUrl ? stageFromUrl.split(",").filter(Boolean) : DEFAULT_FUNNEL_STATUSES.slice()
  const [filters, setFilters] = useState<FilterState>({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, scoreMinResume: 0, scoreMinAnketa: 0, sources: [], workFormats: [], relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20, funnelStatuses: initialFunnelStatuses, hideRejected: false, hideNoSalary: false, activeNow: false, demoProgress: [], dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [], skills: [], industries: [] })
  const [trashOpen, setTrashOpen] = useState(false) // Корзина кандидатов (Sheet)
  const [rediscoveryOpen, setRediscoveryOpen] = useState(false) // Поиск в базе (Sheet)

  // Маппинг русских лейблов фильтра прогресса демо → API-идентификаторы.
  // UI: candidate-filters.tsx:70 ["Не начал", "В процессе", "Завершил (≥85%)",
  // "Завершил (<85%)"]. API: route.ts ожидает not_started/in_progress/
  // completed_85/completed_below_85.
  const DEMO_PROGRESS_LABEL_TO_API: Record<string, string> = {
    "Не начал":         "not_started",
    "В процессе":       "in_progress",
    "Завершил (≥85%)":  "completed_85",
    "Завершил (<85%)":  "completed_below_85",
  }

  // Серверные фильтры — передаём в useCandidates, который шлёт их в API
  const candidatesFilters = useMemo(() => ({
    search: filters.searchText,
    minAge: filters.ageMin,
    maxAge: filters.ageMax,
    minExperience: filters.experienceMin,
    maxExperience: filters.experienceMax,
    workFormats: filters.workFormats,
    educationLevels: filters.education,
    languages: filters.languages,
    keySkills: filters.skills,
    industries: filters.industries,
    relocationReady: filters.relocation === "yes" ? true : filters.relocation === "no" ? false : null,
    businessTripsReady: filters.businessTrips === "yes" ? true : filters.businessTrips === "no" ? false : null,
    demoProgress: filters.demoProgress
      .map(l => DEMO_PROGRESS_LABEL_TO_API[l])
      .filter((v): v is string => !!v),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    salaryMin: filters.salaryMin,
    salaryMax: filters.salaryMax,
    sources: filters.sources,
    cities: filters.cities,
    scoreMin: filters.scoreMin,
    scoreMinResume: filters.scoreMinResume,
    scoreMinAnketa: filters.scoreMinAnketa,
    hideRejected: filters.hideRejected,
    hideNoSalary: filters.hideNoSalary,
    activeNow: filters.activeNow,
  }), [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  // viewMode поднят сюда (выше хуков), чтобы useCandidates умел пропускать
  // запрос в режиме list-paginated и не дублировал usePaginatedCandidates.
  // Сеттер-обёртка setViewMode (с persist в user-prefs) объявлена ниже.
  const [viewMode, setViewModeLocal] = useState<ViewMode>("list")
  // D12: «Скоро»-заглушки (источники Авито/SuperJob/Яндекс, CRM-интеграции)
  // скрываем от клиентов — показываем только платформенному админу.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setIsPlatformAdmin(!!(d?.data ?? d)?.isPlatformAdmin)).catch(() => {})
  }, [])
  const tabFromUrl = searchParams?.get("tab") ?? "candidates"
  // Режим серверной пагинации: только tab=candidates + viewMode=list.
  // В этом режиме useCandidates отключается (vacancyId=null), источником
  // строк списка становится usePaginatedCandidates. На остальных видах
  // (kanban/funnel/tiles) useCandidates снова работает и наполняет columns.
  const useListPaginated = tabFromUrl === "candidates" && viewMode === "list"

  // filters.funnelStatuses содержит slug'и стадий из PLATFORM_STAGES
  // (candidate-filters.tsx рендерит ALL_STAGE_SLUGS). Это уже совпадает с
  // candidates.stage в БД → передаём напрямую как stage-фильтр.
  // Раньше тут была мапа Russian-label → slug'и, но ключи (рус. метки) НЕ
  // пересекались с реальным содержимым funnelStatuses (slug'и), поэтому
  // flatMap всегда возвращал [] — фильтр статусов молча не применялся.
  const stageFilterFromFunnel: string[] | undefined = useMemo(() => {
    const slugs = filters.funnelStatuses ?? []
    return slugs.length > 0 ? slugs : undefined
  }, [filters.funnelStatuses])

  const { candidates: apiCandidates, updateStage, refetch: refetchCandidates, toggleFavorite } = useCandidates(
    useListPaginated ? null : id,
    stageFilterFromFunnel,
    listSort ? { sort: listSort.key, order: listSort.dir } : undefined,
    candidatesFilters,
  )

  // Пагинированный список — отдельный запрос с серверной пагинацией.
  const paginated = usePaginatedCandidates({
    vacancyId: useListPaginated ? id : null,
    filters: candidatesFilters,
    stageFilter: stageFilterFromFunnel,
  })

  const handleToggleFavorite = useCallback(async (candidateId: string, isFavorite: boolean) => {
    // В режиме list-paginated видимые кандидаты приходят из paginated.candidates
    // (useCandidates отключён, vacancyId=null). Оптимистичный апдейт должен
    // менять локальный state именно того хука, который рендерится; иначе UI
    // не обновляется до полного refetch.
    const fn = useListPaginated ? paginated.toggleFavorite : toggleFavorite
    const ok = await fn(candidateId, isFavorite)
    if (!ok) toast.error("Не удалось обновить избранное")
  }, [useListPaginated, paginated.toggleFavorite, toggleFavorite])

  const [status, setStatus] = useState<VacancyStatus>("draft")
  const [columns, setColumns] = useState<ColumnData[]>(emptyColumns())

  // Load funnel stages from API. Таблица funnel_stages в БД может быть
  // устаревшей (после расширения воронки в drizzle/0083 в ней нет
  // primary_contact/demo_opened/anketa_filled). Поэтому всегда дополняем
  // ответ API недостающими системными стейджами из COLUMN_ORDER —
  // иначе кандидаты с этими стейджами теряются (filter c.stage===col.id
  // не находит совпадения).
  useEffect(() => {
    fetch("/api/funnel-stages")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((stages: Array<{ slug: string; title: string; color: string; sortOrder: number }>) => {
        if (stages.length > 0) {
          const apiCols: ColumnData[] = stages.map(s => ({
            id: s.slug,
            title: s.title,
            count: 0,
            colorFrom: s.color,
            colorTo: s.color,
            candidates: [],
          }))
          const existing = new Set(apiCols.map(c => c.id))
          const missing: ColumnData[] = COLUMN_ORDER
            .filter(id => !existing.has(id))
            .map(id => {
              const c = defaultColumnColors[id]
              return {
                id,
                title: c?.label ?? id,
                count: 0,
                colorFrom: c?.from ?? "#94a3b8",
                colorTo:   c?.to   ?? "#64748b",
                candidates: [],
              }
            })
          // Сливаем: сначала API-порядок, потом недостающие в порядке COLUMN_ORDER.
          setColumns([...apiCols, ...missing])
        }
      })
      .catch(() => {})
  }, [])

  // Однократный guard для авто-переключения таба при первой загрузке статуса:
  // после ручного клика юзера на «Анкета» refetch apiVacancy не должен снова
  // выкидывать его на «Кандидаты».
  const tabAutoSyncedRef = useRef(false)

  // Sync vacancy status + custom columns from API
  useEffect(() => {
    if (apiVacancy?.status) {
      const s = apiVacancy.status as VacancyStatus
      setStatus(s)
      const isActive = s === "active" || s === "published"
      // URL-таб «застрял» (anketa/settings/analytics) от прошлого визита,
      // но вакансия уже опубликована — принудительно открываем «Кандидаты»
      // и чистим ?tab, чтобы при следующем визите дефолт не залипал.
      // Q1 (deep-link): явный ?tab= в URL — намеренный диплинк/закладка,
      // его уважаем даже для активной вакансии (activeTab уже инициализирован
      // в urlTab при mount — переопределять не нужно). Дефолт «Кандидаты»
      // (active) / «Настройки» (черновик) — только когда ?tab отсутствует.
      // Ref-guard оставляет это на ПЕРВЫЙ mount, чтобы refetch apiVacancy
      // (напр. после сохранения брендинга) не выкидывал юзера с его таба.
      if (!tabAutoSyncedRef.current) {
        tabAutoSyncedRef.current = true
        if (!urlTab) {
          setActiveTab(isActive ? "candidates" : "settings")
        }
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
      if (branding.website) setBrandWebsite(branding.website)
    }
    // Читаем brandCompanyId из anketa (источник правды — AnketaTab)
    const anketa = desc?.anketa as Record<string, unknown> | undefined
    if (typeof anketa?.brandCompanyId === "string") {
      setVacancyBrandCompanyId(anketa.brandCompanyId)
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
  // B5: persistColumns намеренно убран — колонки per-company хранятся
  // в hiring-defaults, не в user-preferences. setColumns из хука не вызываем.
  const { prefs: userPrefs, loaded: userPrefsLoaded, setViewMode: persistViewMode, setListSort: persistListSort } = useUserPreferences()
  // viewMode объявлен выше (перед useCandidates) для условного отключения запроса.
  const [sortMode, setSortMode] = useState<CandidateSortMode>("date_desc")
  const [cardSettings, setCardSettingsLocal] = useState(defaultSettings)

  // ─── При первой загрузке user-prefs — гидратируем UI ─────────────────────
  useEffect(() => {
    if (!userPrefsLoaded) return
    // Не-админам доступен только «Список» (см. ViewSettings). Сохранённый
    // kanban/funnel не гидратируем, иначе застрянут без переключателя режимов.
    setViewModeLocal((role === "platform_admin" ? userPrefs.viewMode : "list") as ViewMode)
    // B5: колонки теперь per-company (hiring-defaults), не per-user.
    // userPrefs.columns намеренно НЕ гидратируем в cardSettings.
  }, [userPrefsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeLocal(mode)
    persistViewMode(mode)
  }, [persistViewMode])

  const setCardSettings = useCallback((next: CardDisplaySettings) => {
    setCardSettingsLocal(next)
    // B5: колонки per-company — сохраняем в hiring-defaults только если директор/platform_admin.
    // Остальные HR могут видеть колонки, но менять не могут (гард также на сервере).
    if (["director", "client", "platform_admin", "admin"].includes(role)) {
      fetch("/api/modules/hr/company/hiring-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateColumns: next as unknown as Record<string, boolean> }),
      }).catch(() => {})
    }
  }, [role])
// filters перемещён выше — см. строку перед useCandidates
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerAnketa = useMemo(() => {
    const a = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.anketa as Record<string, unknown> | undefined
    if (!a) return null
    return {
      aiIdealProfile: typeof a.aiIdealProfile === "string" && a.aiIdealProfile.trim() ? a.aiIdealProfile.trim() : null,
      aiRequiredHardSkills: Array.isArray(a.aiRequiredHardSkills) && (a.aiRequiredHardSkills as string[]).length > 0 ? a.aiRequiredHardSkills as string[] : null,
      aiStopFactors: Array.isArray(a.aiStopFactors) && (a.aiStopFactors as string[]).length > 0 ? a.aiStopFactors as string[] : null,
    }
  }, [apiVacancy])
  // Bulk-selection state (только список — выделение между кандидатами)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Окно «Отправить тест»: показывает/редактирует текст приглашения перед отправкой.
  const [testInviteOpen, setTestInviteOpen] = useState(false)
  const [testInviteText, setTestInviteText] = useState("")
  const [testInviteIds, setTestInviteIds] = useState<string[]>([])
  const [testInviteSending, setTestInviteSending] = useState(false)
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
  const [brandWebsite, setBrandWebsite] = useState("")
  const [editingSlug, setEditingSlug] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  // Данные основной компании (для дефолтов брендинга)
  const [mainCompanyData, setMainCompanyData] = useState<{
    brandName: string; logoUrl: string; brandSlogan: string; website: string; subdomain: string
  }>({ brandName: "", logoUrl: "", brandSlogan: "", website: "", subdomain: "" })
  const [brandCompaniesData, setBrandCompaniesData] = useState<Array<{
    id: string; name: string; slogan?: string; logo?: string; website?: string
  }>>([])
  // brandCompanyId вакансии (берём из descriptionJson.anketa — источник правды в AnketaTab)
  const [vacancyBrandCompanyId, setVacancyBrandCompanyId] = useState("")
  // Дефолтный таб по статусу:
  //   active/published → «Кандидаты» (главная работа с вакансией)
  //   draft и прочее   → «Настройки» (вакансия ещё не настроена)
  const defaultTab = (status === "active" || status === "published") ? "candidates" : "settings"
  const rawUrlTab = searchParams?.get("tab") ?? null
  // Старая ссылка `?tab=automation` → новая `?tab=settings&section=ai`
  // Старые `?tab=course` / `?tab=test` → объединённый таб `content` (+ под-таб).
  const urlTab = rawUrlTab === "automation" ? "settings"
    : (rawUrlTab === "course" || rawUrlTab === "test") ? "content"
    : rawUrlTab
  const rawUrlSection = rawUrlTab === "automation" ? "ai" : (searchParams?.get("section") ?? null)
  // Миграция старых section-значений на новые 6 табов.
  // general → page (стартовая вкладка с брендингом), automation → ai.
  const SETTINGS_SECTION_IDS = ["page", "sources", "messages", "funnel", "funnel-builder", "spec", "followup", "aichatbot", "ai", "integrations"] as const
  type SettingsSectionId = typeof SETTINGS_SECTION_IDS[number]
  // Скрытые legacy-секции: при прямой ссылке (?section=funnel|messages|followup|aichatbot)
  // перенаправляем на funnel-builder — их контент теперь живёт внутри Конструктора воронки.
  const LEGACY_SECTIONS_REDIRECT_TO_FUNNEL_BUILDER = ["funnel", "messages", "followup", "aichatbot"] as const
  const initialSettingsSection: SettingsSectionId =
    rawUrlSection === "general" ? "page" :
    rawUrlSection === "automation" ? "ai" :
    rawUrlSection && (LEGACY_SECTIONS_REDIRECT_TO_FUNNEL_BUILDER as readonly string[]).includes(rawUrlSection) ? "funnel-builder" :
    rawUrlSection && (SETTINGS_SECTION_IDS as readonly string[]).includes(rawUrlSection)
      ? (rawUrlSection as SettingsSectionId)
      : "page"
  // Если ?tab есть в URL — используем его; иначе "_pending" до загрузки статуса.
  // tabAutoSyncedRef установит правильный дефолт (candidates/settings) при
  // первой загрузке apiVacancy — после чего URL-sync запишет его в адресную строку.
  // Это исключает прыжок таба: без ?tab не фиксируем "settings" до получения статуса.
  const [activeTab, setActiveTab] = useState(urlTab ?? "_pending")

  // URL-sync: при любом изменении activeTab (клик таба → Tabs onValueChange →
  // setActiveTab, и т.п.) обновляем ?tab=… в адресной строке. Без этого
  // tabFromUrl на line 441 не обновляется → useListPaginated может остаться
  // false при переключении на «Кандидаты», и список грузится без пагинации.
  // "_pending" не пишем в URL — дожидаемся реального дефолта от tabAutoSyncedRef.
  useEffect(() => {
    if (activeTab === "_pending") return
    const current = searchParams?.get("tab") ?? null
    if (current === activeTab) return
    const sp = new URLSearchParams(searchParams?.toString() ?? "")
    sp.set("tab", activeTab)
    router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>(initialSettingsSection)
  const [anPeriod, setAnPeriod] = useState("all")
  // Аналитика: серверная агрегация по ВСЕЙ вакансии (источник истины — БД,
  // а не выгруженный на клиент массив columns). Период anPeriod дёргает
  // endpoint заново; маппинг today→7d (серверный фильтр работает по дням).
  const [analytics, setAnalytics] = useState<{
    total: number
    inProgress: number
    rejected: number
    hired: number
    avgScore: number
    vacancyCreatedAt: string | null
    stageCounts: Record<string, number>
    funnelStages: { stage: string; count: number; color: string }[]
    sourceData: { source: string; count: number; avgScore: number; pct: number }[]
    scoreRanges: { range: string; count: number; color: string }[]
  } | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  useEffect(() => {
    if (activeTab !== "analytics") return
    const periodMap: Record<string, string> = { all: "all", today: "7d", "7d": "7d", "30d": "30d", "90d": "90d" }
    const period = periodMap[anPeriod] ?? "all"
    let cancelled = false
    setAnalyticsLoading(true)
    fetch(`/api/modules/hr/vacancies/${id}/analytics?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setAnalytics(data) })
      .catch(() => { if (!cancelled) setAnalytics(null) })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, id, anPeriod])

  const [anSources, setAnSources] = useState<string[]>([])
  const [anCities, setAnCities] = useState<string[]>([])
  const [anFormats, setAnFormats] = useState<string[]>([])
  const [anSalaryMin, setAnSalaryMin] = useState(0)
  const [anSalaryMax, setAnSalaryMax] = useState(300000)
  const [anScoreMin, setAnScoreMin] = useState(0)
  const [anStages, setAnStages] = useState<string[]>([])
  // Export dialog state (выбор охвата + полей)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
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

  // Таб «Контент» = динамические блоки (ContentBlocksTab со встроенным
  // редактором/тулбаром). Прежние course/test refs и состояние под-таба удалены.

  // Anketa external save handle: AnketaTab вызывает registerHandle({save})
  // при mount, мы держим ссылку и зелёная кнопка «Сохранить» в шапке таба
  // её дёргает. Через useState (не useRef), чтобы re-render шапки случался
  // когда handle становится доступен.
  const [anketaHandle, setAnketaHandle] = useState<AnketaTabHandle | null>(null)
  const [anketaSaving, setAnketaSaving] = useState(false)
  const registerAnketaHandle = useCallback((h: AnketaTabHandle) => setAnketaHandle(h), [])

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
  const [hhSyncing, setHhSyncing] = useState(false)

  // Сводные счётчики для шапки. Отдельный endpoint, не зависящий от фильтров,
  // чтобы «всего кандидатов» всегда показывало COUNT по vacancy_id, а не
  // длину apiCandidates (которая ужимается фильтрами / задержкой загрузки).
  // #13/#14: единый endpoint /stats — те же цифры в шапке, аналитике
  // и дашборде. Сохранили старые поля total/pending/freshCount/demoOpened/
  // rejected плюс hhTotal/hhNew/inProgress/anketaFilled/hired. freshCount
  // берётся из старого /candidate-stats — он использует user_vacancy_views
  // (отдельная логика «свежести с прошлого захода»), которой нет в общей
  // функции.
  const [headerStats, setHeaderStats] = useState<{
    total: number; pending: number; freshCount: number;
    demoOpened: number; rejected: number;
    hhTotal: number; hhNew: number; inProgress: number;
    anketaFilled: number; hired: number;
  } | null>(null)
  const loadHeaderStats = useCallback(async () => {
    if (!id) return
    try {
      const [statsRes, candRes] = await Promise.all([
        fetch(`/api/modules/hr/vacancies/${id}/stats`),
        fetch(`/api/modules/hr/vacancies/${id}/candidate-stats`),
      ])
      if (!statsRes.ok) return
      const stats = await statsRes.json() as {
        total: number; hhTotal: number; hhNew: number;
        inProgress: number; rejected: number; hired: number;
        demoOpened: number; anketaFilled: number;
      }
      const cand = candRes.ok
        ? await candRes.json() as { pending: number; freshCount: number }
        : { pending: 0, freshCount: 0 }
      setHeaderStats({
        total:        stats.total,
        pending:      cand.pending,
        freshCount:   cand.freshCount,
        demoOpened:   stats.demoOpened,
        rejected:     stats.rejected,
        hhTotal:      stats.hhTotal,
        hhNew:        stats.hhNew,
        inProgress:   stats.inProgress,
        anketaFilled: stats.anketaFilled,
        hired:        stats.hired,
      })
    } catch { /* silent */ }
  }, [id])
  useEffect(() => {
    if (!id) return
    // P0-9: сначала забираем freshCount (он считается ОТ предыдущего last_seen),
    // и только потом UPSERT'им last_seen=NOW(). Иначе бейдж всегда был бы 0.
    let cancelled = false
    ;(async () => {
      await loadHeaderStats()
      if (cancelled) return
      fetch(`/api/modules/hr/vacancies/${id}/mark-seen`, { method: "POST" }).catch(() => {})
    })()
    return () => { cancelled = true }
  }, [id, loadHeaderStats])

  const loadHhSyncMeta = useCallback(async () => {
    const hhVacId = apiVacancy?.hhVacancyId
    if (!hhVacId) return
    try {
      const res = await fetch("/api/integrations/hh/vacancies")
      const data = await res.json() as { vacancies?: Array<{ hhVacancyId: string; responsesCount: number; syncedAt: string; createdAt: string; localVacancyId: string | null }> }
      setHhSyncMeta((data.vacancies ?? []).find(v => v.hhVacancyId === hhVacId) ?? null)
    } catch { /* silent */ }
  }, [apiVacancy?.hhVacancyId])

  // headerStats.pending (hh-отклики со статусом 'response') используется
  // на кнопке «Разобрать», freshCount — на бейдже «+N новых» в шапке.
  // Раньше тут был loadHhPending, который тянул /api/integrations/hh/responses
  // (~13.8 МБ — все hh-отклики компании) только ради этой цифры. Убран.

  useEffect(() => {
    if (hhConnected !== true || !apiVacancy?.hhVacancyId) return
    loadHhSyncMeta()
  }, [hhConnected, apiVacancy?.hhVacancyId, loadHhSyncMeta])

  const handleHhSync = async () => {
    setHhSyncing(true)
    try {
      // GET /api/integrations/hh/responses — это серверный синк с hh API
      // (тянет negotiations + резюме). Запускаем только по явному клику кнопки.
      await Promise.all([
        fetch("/api/integrations/hh/vacancies"),
        fetch("/api/integrations/hh/responses"),
      ])

      // P0-54: cron делает 2 шага (импорт + processQueue), но ручной handleHhSync
      // раньше делал только импорт. В результате свежие hh_responses оставались
      // в status='response' до следующего cron-прогона, и первое сообщение
      // не уходило сразу после нажатия «Синхронизировать». Дёргаем разбор
      // fire-and-forget — endpoint async, отдаёт {jobId, status:queued}
      // мгновенно; реальная обработка идёт в фоне.
      void fetch("/api/integrations/hh/process-queue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ vacancyId: id, limit: 50, delaySeconds: 2 }),
      }).catch(() => { /* silent — основной toast о синке всё равно покажем */ })

      await Promise.all([loadHhSyncMeta(), loadHeaderStats()])
      refetchCandidates(); refetchVacancy()
      toast.success("Синхронизировано с hh.ru. Разбор запущен в фоне.")
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
      await refetchVacancy()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка отвязки")
    } finally {
      setHhUnlinking(false)
    }
  }

  // ─── Авито-интеграция (статус компании) ─────────────────────────────────────
  const [avitoStatus, setAvitoStatus] = useState<{
    configured: boolean
    isEnabled?: boolean
    isActive?:  boolean
    userId?:    string | null
    createdAt?: string | null
    hasToken?:  boolean
  } | null>(null)
  useEffect(() => {
    fetch("/api/integrations/avito")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAvitoStatus(d as typeof avitoStatus) })
      .catch(() => {})
  }, [])

  // Авито-канал включён на этой вакансии (channelSources contains 'avito').
  const vacancyAvitoEnabled = Array.isArray(
    (apiVacancy as { channelSources?: Array<"hh" | "avito"> } | undefined)?.channelSources,
  ) && ((apiVacancy as { channelSources?: Array<"hh" | "avito"> }).channelSources ?? []).includes("avito")

  // Авито полностью подключено на уровне компании.
  const avitoCompanyConnected = avitoStatus?.configured && avitoStatus?.isEnabled && avitoStatus?.isActive

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

  const canAdd = isPlatformRole(role)
  // Удалять кандидатов могут только администратор / менеджер-админ / директор.
  const canDeleteCandidates = (["platform_admin", "platform_manager", "director"] as string[]).includes(role)
  const [duplicating, setDuplicating] = useState(false)
  const [permDeleteOpen, setPermDeleteOpen] = useState(false)

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

  // ── Действия жизненного цикла (см. lib/vacancies/lifecycle.ts) ──
  const handlePauseVacancy   = () => { updateVacancyStatus(VACANCY_STATUS_ON_PAUSE);   toast.warning("Вакансия приостановлена") }
  const handleResumeVacancy  = () => { updateVacancyStatus(VACANCY_STATUS_ON_RESUME);  toast.success("Вакансия возобновлена") }
  const handleCloseVacancy   = () => { updateVacancyStatus(VACANCY_STATUS_ON_CLOSE);   toast("Вакансия закрыта и отправлена в архив") }

  // Восстановить: из архива → status active; из корзины → очистка deleted_at (PATCH).
  const handleRestoreVacancy = async () => {
    if (apiVacancy?.deletedAt) {
      try {
        const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
        })
        if (!res.ok) throw new Error()
        toast.success("Вакансия восстановлена из корзины")
        refetchVacancy()
      } catch { toast.error("Не удалось восстановить вакансию") }
    } else {
      updateVacancyStatus(VACANCY_STATUS_ON_RESTORE)
      toast.success("Вакансия восстановлена из архива")
    }
  }

  // В корзину: soft-delete (deleted_at = now). Вакансия уходит из активных/архива.
  const handleMoveToTrash = async () => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия перемещена в корзину")
      router.push("/hr/vacancies")
    } catch { toast.error("Не удалось переместить в корзину") }
  }

  // Экспорт кандидатов в Excel — серверный endpoint отдаёт .xlsx с
  // Content-Disposition; якорь скачивает файл с именем от сервера.
  // Открываем диалог выбора охвата (все/выделенные/по статусам) и полей.
  const handleExportExcel = () => setExportDialogOpen(true)

  const totalCandidates = columns.reduce((acc, col) => acc + col.candidates.length, 0)

  const saveBranding = async (updates?: { companyName?: string; color?: string; slogan?: string; logo?: string; website?: string }) => {
    setBrandSaving(true)
    const branding = {
      companyName: updates?.companyName ?? brandCompanyName,
      color: updates?.color ?? brandColor,
      slogan: updates?.slogan ?? brandSlogan,
      logo: updates?.logo ?? brandLogo,
      website: updates?.website ?? brandWebsite,
      domainLevel: brandDomainLevel,
      companySlug: brandCompanySlug,
      customDomain: brandCustomDomain,
    }
    try {
      // P0-50 hotfix: PATCH делает server-side merge по корню descriptionJson
      // (см. /api/modules/hr/vacancies/[id]/route.ts:148). Передаём только
      // branding, остальные ключи descriptionJson сервер сохранит сам.
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { branding } }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        const msg = body?.error || "Не удалось сохранить брендинг"
        toast.error(msg)
        throw new Error(msg)
      }
      // refetchVacancy перечитает descriptionJson — initial-load эффект
      // (page.tsx:577) ещё раз выставит state из БД, гарантируя что после
      // Cmd+R пользователь увидит то же самое.
      refetchVacancy()
      toast.success("Брендинг сохранён")
    } finally {
      setBrandSaving(false)
    }
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
    // В режиме пагинированного списка (Вид: Список) видимые строки приходят из
    // `paginated.*`, а НЕ из kanban-state `columns` (там колонки по стадиям, без
    // синтетической "all"). Старый код искал кандидата в `columns` по columnId
    // "all", не находил и молча выходил — кнопки ✓/✗/→ в строке не работали.
    // Здесь отдельная ветка: меняем стадию через paginated.updateStage (она же
    // оптимистично обновляет видимый список) и рефетчим, чтобы переехали фильтры.
    if (useListPaginated) {
      const cand = paginatedColumns?.[0]?.candidates.find((c) => c.id === candidateId)
      if (!cand) return
      if (action === "reject") {
        setRejectCandidateId(candidateId)
        setRejectColumnId("all")
        setRejectReason("")
        setRejectDialogOpen(true)
        return
      }
      const apply = async (target: string, msg: string) => {
        const ok = await paginated.updateStage(candidateId, target)
        if (ok) { toast.success(msg); paginated.refetch() }
        else toast.error("Не удалось обновить статус")
      }
      switch (action) {
        case "reserve":     return apply("talent_pool", `${cand.name} — в резерв`)
        case "think":       return apply("pending", "🤔 Подумаем над кандидатом")
        case "preboarding": return apply("preboarding", `${cand.name} — пребординг`)
        case "hire":        return apply("hired", `🎉 ${cand.name} — нанят!`)
        case "advance": {
          const nextId = getNextColumnId(cand.stage ?? "new")
          return apply(nextId ?? "hired", nextId ? `${cand.name} → следующий этап` : `🎉 ${cand.name} — нанят!`)
        }
        default: return
      }
    }

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

  // ─── Bulk actions (плавающая панель) ────────────────────────────────────
  const handleBulkAction = useCallback(
    async (action: BulkAction, payload?: { stage?: string }) => {
      if (selectedCandidateIds.size === 0 || bulkBusy) return
      const ids = Array.from(selectedCandidateIds)
      // «Отправить тест» → открываем окно с текстом приглашения (предзаполнено
      // шаблоном вакансии). Отправка — по кнопке окна (confirmSendTest).
      // Выделение пока не сбрасываем.
      // «Сравнить» → открываем страницу сравнения ответов по выделенным.
      if (action === "compare") {
        if (ids.length < 2) {
          toast.error("Выделите минимум двух кандидатов для сравнения")
          return
        }
        // Короткая ссылка: сохраняем набор на сервере → /compare?set=<token>.
        // При сбое — фолбэк на длинную ?ids=, чтобы сравнение всё равно открылось.
        try {
          const r = await fetch(`/api/modules/hr/vacancies/${id}/compare/set`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          })
          const j = await r.json().catch(() => null)
          const token = j?.data?.token ?? j?.token
          if (r.ok && token) {
            window.location.href = `/hr/vacancies/${id}/compare?set=${encodeURIComponent(token)}`
            return
          }
        } catch { /* фолбэк ниже */ }
        window.location.href = `/hr/vacancies/${id}/compare?ids=${ids.join(",")}`
        return
      }
      if (action === "send_test") {
        let msg = ""
        try {
          const r = await fetch(`/api/modules/hr/vacancies/${id}/send-test`)
          const j = await r.json().catch(() => null)
          msg = (j?.message ?? "") as string
        } catch { /* откроем с пустым — дефолт подставит бэкенд */ }
        setTestInviteText(msg)
        setTestInviteIds(ids)
        setTestInviteOpen(true)
        return
      }
      setBulkBusy(true)
      try {
        const res = await fetch("/api/modules/hr/candidates/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds: ids, action, payload }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string }
          toast.error(err.error || "Не удалось выполнить массовое действие")
          return
        }
        const data = (await res.json()) as { affected?: number; isFavorite?: boolean }
        const n = data.affected ?? ids.length
        switch (action) {
          case "reject":
            toast.success(`Отказано: ${n}`)
            break
          case "invite":
            toast.success(`Приглашено на интервью: ${n}`)
            break
          case "talent_pool":
            toast.success(`В резерв: ${n}`)
            break
          case "set_stage":
            toast.success(`Перемещено: ${n}`)
            break
          case "toggle_favorite":
            toast.success(data.isFavorite ? `В избранном: ${n}` : `Снято с избранного: ${n}`)
            break
          case "restore":
            toast.success(`Возвращено в воронку: ${n}`)
            break
          case "trash":
            toast.success(`Удалено в корзину: ${n}`)
            break
          case "untrash":
            toast.success(`Восстановлено из корзины: ${n}`)
            break
          case "hard_delete":
            toast.success(`Удалено навсегда: ${n}`)
            break
        }
        setSelectedCandidateIds(new Set())
        // В режиме списка видимые строки из paginated.* — рефетчим его,
        // иначе таблица не обновится после массового действия.
        await (useListPaginated ? paginated.refetch() : refetchCandidates())
      } catch {
        toast.error("Ошибка сети")
      } finally {
        setBulkBusy(false)
      }
    },
    [selectedCandidateIds, bulkBusy, refetchCandidates, useListPaginated, paginated, id],
  )

  // Подтверждение из окна «Отправить тест»: шлёт выбранным + сохраняет текст
  // как шаблон вакансии (если отредактирован).
  const confirmSendTest = useCallback(async () => {
    if (testInviteSending || testInviteIds.length === 0) return
    setTestInviteSending(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: testInviteIds, message: testInviteText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error || "Не удалось поставить тест в очередь")
        return
      }
      const d = (await res.json()) as { scheduled?: number; alreadyQueued?: number; noHhLink?: number }
      const queued = d.scheduled ?? 0, dup = d.alreadyQueued ?? 0, noHh = d.noHhLink ?? 0
      if (queued === 0 && noHh > 0) {
        toast.error(`Не отправлено: ${noHh} без hh-чата (нет отклика для отправки).`)
      } else {
        toast.success(
          `Тест в очереди: ${queued}` + (dup > 0 ? ` (уже стояло: ${dup})` : "") +
          (noHh > 0 ? ` · ${noHh} без hh-чата пропущено` : "") +
          ". Отправка по очереди, с паузой между сообщениями.",
        )
      }
      setTestInviteOpen(false)
      setSelectedCandidateIds(new Set())
      await (useListPaginated ? paginated.refetch() : refetchCandidates())
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setTestInviteSending(false)
    }
  }, [id, testInviteIds, testInviteText, testInviteSending, useListPaginated, paginated, refetchCandidates])

  const filteredColumns = applyCandidateFilters(columns, filters)

  // ─── Пагинированный список (только для tab=candidates + viewMode=list) ───
  // useListPaginated объявлен выше (перед useCandidates).

  // 20 строк paginated → одна синтетическая «колонка-всё», kanban-board
  // её просто скормит ListView (см. KanbanBoard:299). stage у каждого
  // кандидата свой (для отображения «Статус»-колонки в ряду).
  const paginatedColumns = useMemo(() => {
    if (!useListPaginated) return null
    const items = paginated.candidates.map(c => apiCandidateToCard(c, c.stage ?? "new"))
    return [{
      id: "all",
      title: "Кандидаты",
      count: items.length,
      colorFrom: "#a78bfa",
      colorTo: "#c084fc",
      candidates: items,
    }]
  }, [useListPaginated, paginated.candidates])

  // Маппинг клиентских sort-ключей (ListView) → серверных (paginated API).
  // Ключи без сервера (favorite/city/source) остаются клиентскими — ListView
  // отсортирует 20 строк локально.
  const SERVER_SORT_MAP: Partial<Record<ListSortKey, PaginatedSortKey>> = {
    name: "name",
    aiScore: "aiScore",
    resumeScore: "resumeScore",
    testScore: "testScore",
    salary: "salary",
    responseDate: "createdAt",
    status: "stage",
    progress: "progress",
    city: "city",
    source: "source",
    favorite: "favorite",
    // P0-8: «Очередь HR» — приоритет anketa_filled первыми.
    // ListView не имеет колонки hrQueue, key используется только как
    // невидимый дефолт первого открытия (см. инжект user-prefs ниже).
    hrQueue: "hrQueue",
  }

  const handleListSortChange = useCallback((next: ListSortState | null) => {
    // Persist выбора в user-prefs — на следующем визите без ?sort/?sortBy
    // в URL значение поднимется обратно (см. инжект-эффект ниже).
    persistListSort(next ? { key: next.key, dir: next.dir } : null)
    if (useListPaginated) {
      // ВАЖНО: НЕ вызываем setListSort здесь. paginated.clearSort/setSort
      // сами пишут URL (?sortBy/?order) и заодно чистят legacy ?sort. Вызов
      // setListSort делал второй router.replace, который читал ещё не
      // обновлённый window.location.search и затирал только что записанный
      // ?sortBy → стрелка не появлялась, хотя данные сортировались.
      if (next === null) {
        // 3-й клик — сброс сортировки. Сервер вернёт дефолт (createdAt desc),
        // ListView не подсветит заголовок (effectiveListSort вернёт null).
        paginated.clearSort()
        return
      }
      const serverKey = SERVER_SORT_MAP[next.key]
      if (serverKey) {
        paginated.setSort(serverKey, next.dir)
        return
      }
    }
    setListSort(next)
  }, [useListPaginated, paginated, setListSort, persistListSort]) // eslint-disable-line react-hooks/exhaustive-deps

  // Эффективная сортировка для ListView. В пагинированном режиме источник
  // правды — серверный sortBy/order (через usePaginatedCandidates), потому
  // что handleListSortChange зануляет listSort, чтобы не было двух
  // конфликтующих URL-параметров. Без этого мэппинга после клика по
  // заголовку стрелка ▲/▼ не появлялась — клик казался не сработавшим
  // (юзер кликал ещё раз — отсюда «залипание»).
  const effectiveListSort = useMemo<ListSortState | null>(() => {
    if (!useListPaginated) return listSort
    // 3-state цикл (ASC → DESC → null) требует уметь показывать состояние
    // «нет активной сортировки» — без подсветки заголовка. Источник правды —
    // URL: если ?sortBy не задан, юзер явно сбросил сортировку. paginated
    // продолжит фетчить с дефолтом (createdAt desc), но визуально стрелка
    // не появится.
    const urlSortBy = searchParams?.get("sortBy")
    if (!urlSortBy) return null
    const entry = (Object.entries(SERVER_SORT_MAP) as [ListSortKey, PaginatedSortKey][])
      .find(([, v]) => v === paginated.sortBy)
    const listKey: ListSortKey = entry?.[0] ?? (paginated.sortBy as ListSortKey)
    return { key: listKey, dir: paginated.order }
  }, [useListPaginated, listSort, paginated.sortBy, paginated.order, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Инжект сохранённой сортировки из user-prefs (per-user persistence) ───
  // Однократный guard: при первом успешном входе в режим list-paginated с
  // загруженными prefs — подмешиваем в URL сохранённый выбор. Если в URL уже
  // есть ?sort/?sortBy — пропускаем (явная ссылка имеет приоритет). Если в
  // prefs ничего нет — материализуем дефолт progress desc (новый юзер сразу
  // видит самых продвинутых кандидатов сверху). Существующие prefs с
  // {key:"responseDate"} оставляем как есть — это явный выбор пользователя.
  const listSortPrefsAppliedRef = useRef(false)
  useEffect(() => {
    if (!userPrefsLoaded || listSortPrefsAppliedRef.current) return
    if (!useListPaginated) return
    listSortPrefsAppliedRef.current = true
    const hasUrlSort = !!(searchParams?.get("sort") || searchParams?.get("sortBy"))
    if (hasUrlSort) return
    const stored = userPrefs.listSort
    // P0-8: дефолт первого открытия — hrQueue asc (anketa_filled первыми).
    // Сохранённый выбор HR (stored) уважаем — это сделанный им явный выбор.
    const toApply: ListSortState = stored
      ? { key: stored.key as ListSortKey, dir: stored.dir }
      : { key: "hrQueue" as ListSortKey, dir: "asc" }
    handleListSortChange(toApply)
  }, [userPrefsLoaded, useListPaginated, userPrefs.listSort, searchParams, handleListSortChange])

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
    { stage: "Демо", count: totalCandidates - (newCol?.candidates.length || 0), color: "#3b82f6" },
    { stage: "Решение", count: (decisionCol?.candidates.length || 0) + afterDecision, color: "#ef4444" },
    { stage: "Интервью", count: (interviewCol?.candidates.length || 0) + (finalDecisionCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#8b5cf6" },
    { stage: "Финальное решение", count: (finalDecisionCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#f97316" },
    { stage: "Нанято", count: hiredCol?.candidates.length || 0, color: "#22c55e" },
  ]

  const funnelData = funnelStages

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
    toast.success("Кандидат приглашён из резерва")
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
          candidates: top.map(c => ({ id: c.id, name: c.name, skills: c.skills, experience: c.experience, aiScore: c.aiScore })),
          vacancyRequirements: String(anketa.requirements || ""),
          vacancyId: id,
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
  // Публичный URL вакансии: домен берётся из настроек компании (companies.subdomain).
  // Выбор домена на вакансии убран — он настраивается в профиле компании.
  const publicPageUrl = mainCompanyData.subdomain
    ? `https://${mainCompanyData.subdomain}.company24.pro/vacancy/${vacancySlugOrId}`
    : `https://company24.pro/vacancy/${vacancySlugOrId}`

  // ── Loading / 404 guard ────────────────────────────────────
  const isLoadingVacancy = vacancyLoading || (!apiVacancy && !vacancyError)

  if (isLoadingVacancy) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 overflow-auto bg-background">
            <div className="py-6 px-4 sm:px-14 space-y-4 animate-pulse">
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
            <div className="py-6 px-4 sm:px-14 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
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
              "fixed top-14 right-0 z-40 bg-background border-b shadow-sm py-2 transition-all duration-200 px-4 sm:px-14",
              showStickyHeader ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
            )}
            style={{ left: "var(--sidebar-effective-width, var(--sidebar-width, 16rem))", transition: "left 200ms ease-linear" }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <h2 className="text-sm font-medium text-foreground truncate">{internalName || vacancyTitle}</h2>
                <VacancyStatusBadge status={status} size="sm" />
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

          <div className="py-6 px-4 sm:px-14">
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
                  <VacancyStatusBadge status={status} />
                  {status === "active" && apiVacancy?.createdAt && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" />{Math.floor((Date.now() - new Date(apiVacancy.createdAt).getTime()) / 86400000)} дн.</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  {activeTab === "candidates" && <>
                    {/* #13: две логические группы метрик. Слева — hh.ru
                        (синхрон с hh-кабинетом), вертикальная черта,
                        справа — наши данные после разбора. Если вакансия
                        не привязана к hh — hh-блок скрыт. */}
                    {headerStats?.hhTotal !== undefined && headerStats.hhTotal + headerStats.hhNew > 0 && (
                      <>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <span className="font-medium text-foreground">{headerStats.hhTotal}</span> откликов всего
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Всего откликов с hh.ru, синхронизировано с hh-кабинетом</TooltipContent>
                        </UITooltip>
                        <span>·</span>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <span className="font-medium text-foreground">{headerStats.hhNew}</span> новых
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Новые отклики, ещё не разобраны (status = response)</TooltipContent>
                        </UITooltip>
                        <span className="mx-1 inline-block h-3 w-px bg-border" aria-hidden="true" />
                      </>
                    )}
                    {/* Блок наших данных после разбора */}
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help"><span className="font-medium text-foreground">{headerStats?.demoOpened ?? "—"}</span> открыли демо</span>
                      </TooltipTrigger>
                      <TooltipContent>Кандидаты, добравшиеся до стадии «demo_opened» и далее</TooltipContent>
                    </UITooltip>
                    <span>·</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help"><span className="font-medium text-foreground">{headerStats?.anketaFilled ?? "—"}</span> анкет заполнено</span>
                      </TooltipTrigger>
                      <TooltipContent>Кандидаты, сдавшие финальную анкету (anketa_filled и далее)</TooltipContent>
                    </UITooltip>
                    <span>·</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help"><span className="font-medium text-foreground">{headerStats?.rejected ?? "—"}</span> отказ</span>
                      </TooltipTrigger>
                      <TooltipContent>Кандидаты со статусом «Отказ» в воронке</TooltipContent>
                    </UITooltip>
                    {/* P0-9: бейдж дельты «свежих» — оставлен (отдельная семантика
                        «с прошлого захода»), но переехал в конец, чтобы не мешать
                        основным метрикам. */}
                    {(headerStats?.freshCount ?? 0) > 0 && <>
                      <span>·</span>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 cursor-help">
                            +{headerStats?.freshCount} новых анкет
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Новые заполненные анкеты с прошлого захода в вакансию</TooltipContent>
                      </UITooltip>
                    </>}
                    {useListPaginated && paginated.total > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-foreground">
                          Стр. <span className="font-medium tabular-nums">{paginated.page}</span> из{" "}
                          <span className="font-medium tabular-nums">{paginated.totalPages}</span>{" "}
                          (<span className="tabular-nums">
                            {(paginated.page - 1) * paginated.pageSize + 1}
                            –
                            {Math.min(paginated.total, paginated.page * paginated.pageSize)}
                          </span>)
                        </span>
                      </>
                    )}
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
                  <DropdownMenuContent align="end" className="w-56">
                    {/* Унифицированное меню действий — общий компонент
                        VacancyActionsMenuItems (тот же в строке списка). */}
                    <VacancyActionsMenuItems
                      lifecycle={getVacancyState({ status, deletedAt: apiVacancy?.deletedAt })}
                      duplicating={duplicating}
                      handlers={{
                        onDuplicate:       handleDuplicate,
                        onExport:          handleExportExcel,
                        onPause:           handlePauseVacancy,
                        onResume:          handleResumeVacancy,
                        onArchive:         handleCloseVacancy,
                        onRestore:         handleRestoreVacancy,
                        onTrash:           handleMoveToTrash,
                        onPermanentDelete: () => setPermDeleteOpen(true),
                      }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
                <PermanentDeleteDialog
                  open={permDeleteOpen}
                  onOpenChange={setPermDeleteOpen}
                  vacancyId={id}
                  vacancyTitle={apiVacancy?.title ?? ""}
                  onDeleted={() => router.push("/hr/vacancies")}
                />
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
              <div className="mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="flex items-center justify-between gap-3 min-w-max">
                <TabsList className="shrink-0">
                  {/* B8: группируем по смыслу. Активная — сначала работа с людьми
                      (Кандидаты → Аналитика → Исходящий подбор), потом настройка
                      (Вакансия → Контент). Черновик — сначала настройка
                      (Вакансия → Контент), потом работа с людьми. Настройки всегда
                      последними (рендерятся отдельным TabsTrigger ниже). */}
                  {((status === "active" || status === "published") ? [
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "outbound", icon: UserSearch, label: "Исходящий подбор" },
                    { value: "anketa", icon: ClipboardList, label: "Вакансия" },
                    { value: "content", icon: BookOpen, label: "Контент" },
                  ] : [
                    { value: "anketa", icon: ClipboardList, label: "Вакансия" },
                    { value: "content", icon: BookOpen, label: "Контент" },
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "outbound", icon: UserSearch, label: "Исходящий подбор" },
                  ]).map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                      <tab.icon className="w-3.5 h-3.5" />{tab.label}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="settings" className="gap-1.5"><Settings className="w-3.5 h-3.5" />Настройки</TabsTrigger>
                </TabsList>

                {activeTab === "candidates" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeTab === "candidates" && hhConnected === true && apiVacancy?.hhVacancyId && hhSyncMeta && (
                      <HhAutoProcess
                        vacancyId={id}
                        onProcessed={() => { refetchCandidates(); handleHhSync() }}
                      />
                    )}
                    <CandidateFilters
                      filters={filters}
                      onFiltersChange={(f) => { setFilters(f); if (useListPaginated) paginated.setPage(1) }}
                      // Источник фасетов (города/источники в фильтре). В режиме
                      // списка kanban-`columns` пуст — берём видимые из paginated,
                      // иначе секция «Города» не показывается.
                      candidates={useListPaginated ? (paginatedColumns?.[0]?.candidates ?? []) : columns.flatMap((c) => c.candidates)}
                    />
                    {false && <SortMenu sortMode={sortMode} onSortChange={setSortMode} />}
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
                        <DropdownMenuItem onClick={() => setTrashOpen(true)}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Корзина
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRediscoveryOpen(true)}>
                          <Users className="w-3.5 h-3.5 mr-2" />
                          Поискать в базе
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ViewSettings
                      settings={cardSettings}
                      onSettingsChange={setCardSettings}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      testTableHref={`/hr/vacancies/${id}/test-table`}
                      onReset={() => setCardSettings(defaultSettings)}
                    />
                  </div>
                )}
                {activeTab === "anketa" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Зелёная Save-кнопка (как в Демо-табе) — дёргает save()
                        внутри AnketaTab через handle, который компонент
                        регистрирует при mount. */}
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => anketaHandle?.save()}
                      disabled={!anketaHandle || anketaSaving}
                    >
                      {anketaSaving
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5" />}
                      Сохранить
                    </Button>
                    {/* Предпросмотр описания вакансии на весь экран (тот же
                        контент, что в нижней кнопке «Предпросмотр вакансии», но
                        полноэкранно). Открывает диалог внутри AnketaTab. */}
                    <Button
                      variant="outline" size="sm" className="gap-1.5 text-xs h-8"
                      onClick={() => anketaHandle?.openPreview()}
                      disabled={!anketaHandle}
                    >
                      <Eye className="w-3.5 h-3.5" />Предпросмотр
                    </Button>
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
              </div>

              <TabsContent value="anketa">
                <AnketaTab
                  vacancyId={id}
                  descriptionJson={apiVacancy?.descriptionJson}
                  aiQualityDetails={(apiVacancy as { aiQualityDetails?: unknown } | undefined)?.aiQualityDetails}
                  aiQualityAnalyzedAt={(apiVacancy as { aiQualityAnalyzedAt?: string | null } | undefined)?.aiQualityAnalyzedAt ?? null}
                  onTitleChange={(t) => { if (t) setInternalName(t) }}
                  onNavigateTab={(tab) => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                  onScoreChange={setAdvisorScore}
                  onSavingChange={setAnketaSaving}
                  registerHandle={registerAnketaHandle}
                />
              </TabsContent>

              <TabsContent value="candidates">
                {/* Рубричное ранжирование (shadow) */}
                <RubricRankPanel
                  vacancyId={id}
                  onOpenCandidate={(cid) => { setDrawerCandidateId(cid); setDrawerOpen(true) }}
                />

                {/* Talent Pool radar */}
                {talentMatches.length > 0 && !talentRadarHidden && (
                  <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />В резерве найдено {talentMatches.length} подходящих кандидатов</p>
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
                  columns={paginatedColumns ?? filteredColumns}
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
                  listSort={effectiveListSort}
                  onListSortChange={handleListSortChange}
                  selectedIds={selectedCandidateIds}
                  onSelectionChange={setSelectedCandidateIds}
                  listStartIndex={useListPaginated ? (paginated.page - 1) * paginated.pageSize : undefined}
                  listServerSorted={useListPaginated}
                />
                {useListPaginated && (
                  <div className="mt-3">
                    <Pagination
                      page={paginated.page}
                      pageSize={paginated.pageSize}
                      total={paginated.total}
                      totalPages={paginated.totalPages}
                      onPageChange={paginated.setPage}
                      onPageSizeChange={paginated.setPageSize}
                    />
                  </div>
                )}
              </TabsContent>

              {/* Таб «Контент»: динамический список блоков (имя+тип+редактор).
                  Фаза 1 — легаси demo/test показываются как первые блоки,
                  рантайм их по-прежнему читает по kind. */}
              <TabsContent value="content">
                <ContentBlocksTab vacancyId={id} vacancyTitle={vacancyTitle} />
              </TabsContent>

              <TabsContent value="outbound">
                <OutboundSourcingTab
                  vacancyId={id}
                  vacancyTitle={apiVacancy?.title ?? null}
                  vacancyCity={apiVacancy?.city ?? null}
                  vacancySalaryMin={apiVacancy?.salaryMin ?? null}
                  vacancySalaryMax={apiVacancy?.salaryMax ?? null}
                  vacancyRequiredExperience={(apiVacancy as { requiredExperience?: string | null } | undefined)?.requiredExperience ?? null}
                  anketaWorkFormats={(() => {
                    const a = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.anketa as Record<string, unknown> | undefined
                    return Array.isArray(a?.workFormats) ? (a!.workFormats as string[]) : null
                  })()}
                  anketaEmployment={(() => {
                    const a = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.anketa as Record<string, unknown> | undefined
                    return Array.isArray(a?.employment) ? (a!.employment as string[]) : null
                  })()}
                  anketaLanguages={(() => {
                    const a = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.anketa as Record<string, unknown> | undefined
                    return Array.isArray(a?.aiLanguages) ? (a!.aiLanguages as { lang: string; level: string }[]) : null
                  })()}
                  anketaEducation={(() => {
                    const a = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.anketa as Record<string, unknown> | undefined
                    return typeof a?.educationLevel === "string" ? (a!.educationLevel as string) : null
                  })()}
                />
              </TabsContent>

              <TabsContent value="analytics">
                {(() => {
                  const ttStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }

                  // ─── Источник истины — серверная агрегация по ВСЕЙ вакансии ───
                  // (endpoint /analytics, фетчится при открытии таба и смене
                  // периода). Раньше всё считалось из columns — на вакансиях с
                  // серверной пагинацией выборка неполная → цифры занижались и
                  // расходились с шапкой. Период единый для всех блоков.
                  const anTotal = analytics?.total ?? 0
                  // Воронка/источники/распределение — напрямую из server payload.
                  const funnelStages = analytics?.funnelStages ?? []
                  const funnelData = funnelStages
                  const srcColors: Record<string, string> = { "hh.ru": "#D6001C", "hh": "#D6001C", "Avito": "#00AAFF", "avito": "#00AAFF", "SuperJob": "#0066CC", "superjob": "#0066CC", "Telegram": "#26A5E4", "telegram": "#26A5E4", "WhatsApp": "#25D366", "whatsapp": "#25D366", "Сайт": "#F59E0B", "site": "#F59E0B", "Реферал": "#8B5CF6", "referral": "#8B5CF6", "LinkedIn": "#0A66C2" }
                  const sourceData = (analytics?.sourceData ?? []).map((s) => ({
                    ...s, color: srcColors[s.source] || "#94a3b8",
                  }))
                  const scoreRanges = analytics?.scoreRanges ?? []
                  const avgScore = analytics?.avgScore ?? 0
                  const daysActive = analytics?.vacancyCreatedAt
                    ? Math.floor((Date.now() - new Date(analytics.vacancyCreatedAt).getTime()) / 86400000)
                    : (apiVacancy?.createdAt ? Math.floor((Date.now() - new Date(apiVacancy.createdAt).getTime()) / 86400000) : 0)

                  // Минимальный «значимый» объём, при котором конверсия имеет смысл.
                  const ALARM_MIN_PREV = 5
                  const ALARM_MAX_PCT = 30
                  const transitions = funnelStages.slice(1).map((s, i) => {
                    const prev = funnelStages[i].count
                    const hasData = prev > 0
                    const pct = hasData ? Math.round((s.count / prev) * 100) : 0
                    return {
                      from: funnelStages[i].stage,
                      to: s.stage,
                      pct,
                      hasData,
                      eligibleForAlarm: hasData && prev >= ALARM_MIN_PREV && pct <= ALARM_MAX_PCT && s.count >= 1,
                    }
                  })
                  const eligibleAlarms = transitions.filter((t) => t.eligibleForAlarm)
                  const minPct = eligibleAlarms.length > 0
                    ? Math.min(...eligibleAlarms.map((t) => t.pct))
                    : -1
                  const overallConv = anTotal > 0 && funnelStages.length > 0
                    ? ((funnelStages[funnelStages.length - 1].count / anTotal) * 100).toFixed(1)
                    : "0"

                  return (
                    <div className="space-y-4">
                      {/* Период — единый серверный фильтр для ВСЕХ блоков ниже */}
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {analyticsLoading
                            ? "Загрузка аналитики…"
                            : `Данные по всей вакансии${anPeriod === "all" ? "" : " за выбранный период"}`}
                        </p>
                        <Select value={anPeriod} onValueChange={setAnPeriod}>
                          <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                            <SelectValue placeholder="Период" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Всё время</SelectItem>
                            <SelectItem value="7d">Последние 7 дней</SelectItem>
                            <SelectItem value="30d">Последние 30 дней</SelectItem>
                            <SelectItem value="90d">Последние 90 дней</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

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
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Всего кандидатов</p><p className="text-2xl font-bold text-blue-600 mt-1">{anTotal}</p></CardContent></Card>
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Конверсия воронки</p><p className="text-2xl font-bold text-emerald-600 mt-1">{overallConv}%</p></CardContent></Card>
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ср. AI-скор</p><p className="text-2xl font-bold text-purple-600 mt-1">{avgScore}</p></CardContent></Card>
                          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Дней активна</p><p className="text-2xl font-bold text-amber-600 mt-1">{daysActive}</p></CardContent></Card>
                        </div>
                      </div>

                      {/* БЛОК 2: Конверсия между этапами */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-muted-foreground" />Конверсия между этапами</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5">
                          {transitions.map((t) => {
                            // #54: смягчённая шкала цвета. Раньше любая
                            // конверсия <30% подсвечивалась как «бутылочное
                            // горло» красным — для свежей вакансии 4% это
                            // нормально, не надо пугать.
                            //  < 1%   — оранжевый (есть проблема)
                            //  1–5%   — нейтральный серый (норма для свежих)
                            //  5–20%  — зелёный (хорошо)
                            //  > 20%  — emerald (отлично)
                            // Подсветка «теряем больше всего» теперь только
                            // для самой низкой и только если она в зоне <1%.
                            const tone =
                              !t.hasData       ? "empty"   :
                              t.pct < 1        ? "warn"    :
                              t.pct <= 5       ? "neutral" :
                              t.pct <= 20      ? "good"    :
                                                 "great"
                            const isWorst = tone === "warn" && t.eligibleForAlarm && t.pct === minPct && eligibleAlarms.length > 1
                            const barClass = {
                              empty:   "bg-muted",
                              warn:    "bg-orange-500",
                              neutral: "bg-slate-400",
                              good:    "bg-emerald-500",
                              great:   "bg-emerald-600",
                            }[tone]
                            const textClass = {
                              empty:   "text-muted-foreground",
                              warn:    "text-orange-700 dark:text-orange-400",
                              neutral: "text-foreground",
                              good:    "text-emerald-700 dark:text-emerald-400",
                              great:   "text-emerald-700 dark:text-emerald-400",
                            }[tone]
                            const rowClass = isWorst
                              ? "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
                              : "bg-muted/30"
                            return (
                              <div key={t.from + t.to} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm", rowClass)}>
                                <span className="text-muted-foreground w-[200px] shrink-0 text-xs">{t.from} → {t.to}</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={cn("h-full rounded-full", barClass)} style={{ width: `${t.hasData ? t.pct : 0}%` }} />
                                </div>
                                <span className={cn("text-xs font-semibold w-12 text-right", textClass)}>
                                  {t.hasData ? `${t.pct}%` : "—"}
                                </span>
                                {isWorst && <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 shrink-0"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-xs font-medium">Здесь теряем больше всего</span></div>}
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
                            <div className="flex-1">
                              <DataTable>
                                <DataHead>
                                  <DataHeadCell>Источник</DataHeadCell>
                                  <DataHeadCell align="right">Кол-во</DataHeadCell>
                                  <DataHeadCell align="right">%</DataHeadCell>
                                  <DataHeadCell align="right">Ср. AI-скор</DataHeadCell>
                                </DataHead>
                                <tbody>
                                  {sourceData.map((s) => (
                                    <DataRow key={s.source}>
                                      <DataCell><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /><span className="font-medium">{s.source}</span></div></DataCell>
                                      <DataCell align="right" className="font-medium">{s.count}</DataCell>
                                      <DataCell align="right" className="text-muted-foreground">{s.pct}%</DataCell>
                                      <DataCell align="right">
                                        <Badge variant="outline" className={cn("text-xs", s.avgScore >= 75 ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : s.avgScore >= 60 ? "bg-amber-500/10 text-amber-700 border-amber-200" : "bg-red-500/10 text-red-700 border-red-200")}>{s.avgScore}</Badge>
                                      </DataCell>
                                    </DataRow>
                                  ))}
                                </tbody>
                              </DataTable>
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
                <VacancySettingsProvider>
                {/* Сабнав: 6 табов настроек вакансии */}
                <div className="mb-4 border-b overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <div className="flex items-center gap-1 min-w-max">
                  {/* #18: Воронка перед Сообщениями — HR сначала проектирует
                      стадии и AI-фильтр, потом уже настраивает тексты. */}
                  {([
                    { value: "page"           as const, label: "Брендинг",   icon: Globe },
                    { value: "funnel-builder" as const, label: "Воронка",     icon: Workflow },
                    // R4 Candidate Spec (новый контур): единый экран «Кого ищем».
                    { value: "spec"           as const, label: "Кого ищем",   icon: Target },
                    { value: "sources"        as const, label: "Источники",   icon: Link2 },
                    { value: "ai"             as const, label: "Расписание",  icon: Clock },
                    { value: "integrations"   as const, label: "Интеграции",  icon: Settings },
                    // Скрыты (контент доступен по прямой ?section=, настройки — внутри блоков «Воронки»):
                    // funnel (старые стадии), messages, followup, aichatbot — покрыты блоками Конструктора.
                  ] satisfies { value: VacancyTabKey; label: string; icon: typeof Globe }[]).map((s) => (
                    <SettingsSubNavButton
                      key={s.value}
                      tab={s.value}
                      label={s.label}
                      Icon={s.icon}
                      active={settingsSection === s.value}
                      currentTab={settingsSection as VacancyTabKey}
                      onSwitch={() => {
                        setSettingsSection(s.value)
                        const sp = new URLSearchParams(window.location.search)
                        sp.set("tab", "settings")
                        sp.set("section", s.value)
                        router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                      }}
                    />
                  ))}
                  </div>
                </div>

                {/* ───────── ТАБ «Страница и брендинг» ───────── */}
                {settingsSection === "page" && (
                <div className="space-y-6 max-w-3xl">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Публичная страница</h3>
                    <p className="text-sm text-muted-foreground">Настройка страницы вакансии для кандидатов</p>
                  </div>

                    {/* P0-50: регистрируем секцию «Брендинг» в sticky-bar.
                        logo НЕ включаем в watchedValues — он сохраняется авто-
                        магически при upload/remove, sticky-бар на него не реагирует. */}
                    <BrandingStickyRegister
                      vacancyId={id}
                      loaded={apiVacancy !== undefined && apiVacancy !== null}
                      branding={{
                        companyName: brandCompanyName,
                        color: brandColor,
                        slogan: brandSlogan,
                        website: brandWebsite,
                        logo: "",
                        domainLevel: brandDomainLevel,
                        companySlug: brandCompanySlug,
                        customDomain: brandCustomDomain,
                      }}
                      save={() => saveBranding()}
                    />

                    {/* Группа 38: переключатель «использовать брендинг компании». */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Источник брендинга</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <BrandingOverrideSwitch vacancyId={id} />
                      </CardContent>
                    </Card>

                    {/* Брендинг страницы */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Брендинг страницы
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Индикатор выбранной компании-бренда */}
                        {(() => {
                          const selectedBrand = !vacancyBrandCompanyId || vacancyBrandCompanyId === "__main__"
                            ? { name: mainCompanyData.brandName, logo: mainCompanyData.logoUrl, slogan: mainCompanyData.brandSlogan, website: mainCompanyData.website }
                            : brandCompaniesData.find(c => c.id === vacancyBrandCompanyId) ?? null
                          const brandName = selectedBrand?.name || ""
                          return (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Компания:</span>
                              <span>{brandName || "Основная компания"}</span>
                              <span className="ml-auto text-[10px]">Выбирается во вкладке «Вакансия»</span>
                            </div>
                          )
                        })()}
                        {/* Название компании — плейсхолдер из выбранного бренда */}
                        {(() => {
                          const selectedBrand = !vacancyBrandCompanyId || vacancyBrandCompanyId === "__main__"
                            ? { name: mainCompanyData.brandName, logo: mainCompanyData.logoUrl, slogan: mainCompanyData.brandSlogan, website: mainCompanyData.website }
                            : brandCompaniesData.find(c => c.id === vacancyBrandCompanyId) ?? null
                          const defaultName = selectedBrand?.name || ""
                          const defaultSlogan = selectedBrand?.slogan || ""
                          const defaultWebsite = selectedBrand?.website || ""
                          return (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Название компании</Label>
                                <Input
                                  value={brandCompanyName}
                                  onChange={(e) => setBrandCompanyName(e.target.value)}
                                  placeholder={defaultName || "Название компании"}
                                  className="h-9 text-sm"
                                />
                                {defaultName && !brandCompanyName && (
                                  <p className="text-[10px] text-muted-foreground">Из профиля компании: {defaultName}</p>
                                )}
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
                              {/* #56: современный UX — клик прямо на картинку
                                  открывает file dialog, hover показывает overlay
                                  с кнопками «Заменить»/«Удалить». Если пусто —
                                  плейсхолдер тоже кликабельный (label.htmlFor). */}
                              <div className="space-y-1.5">
                                <Label className="text-xs">Логотип</Label>
                                <div className="flex items-center gap-3">
                                  <input
                                    id="brand-logo-input"
                                    type="file"
                                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (!file) return
                                      if (file.size > 2 * 1024 * 1024) {
                                        toast.error("Файл слишком большой (макс. 2 МБ)")
                                        e.target.value = ""
                                        return
                                      }
                                      const fd = new FormData()
                                      fd.append("file", file)
                                      fetch("/api/upload/vacancy-logo", { method: "POST", body: fd })
                                        .then(r => r.ok ? r.json() : Promise.reject(r))
                                        .then((data: { logoUrl: string }) => {
                                          setBrandLogo(data.logoUrl)
                                          saveBranding({ logo: data.logoUrl })
                                        })
                                        .catch(() => toast.error("Не удалось загрузить логотип"))
                                      e.target.value = ""
                                    }}
                                  />
                                  {brandLogo ? (
                                    <div className="relative group">
                                      <img
                                        src={brandLogo}
                                        alt="Логотип"
                                        className="max-h-[60px] min-h-[60px] object-contain rounded-md border bg-background px-2"
                                      />
                                      <div className="absolute inset-0 rounded-md bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <label
                                          htmlFor="brand-logo-input"
                                          className="px-2 py-1 rounded bg-white/90 text-foreground text-[11px] font-medium cursor-pointer hover:bg-white"
                                        >
                                          Заменить
                                        </label>
                                        <button
                                          type="button"
                                          className="px-2 py-1 rounded bg-red-500 text-white text-[11px] font-medium hover:bg-red-600"
                                          onClick={() => { setBrandLogo(""); saveBranding({ logo: "" }) }}
                                        >
                                          Удалить
                                        </button>
                                      </div>
                                    </div>
                                  ) : selectedBrand?.logo ? (
                                    <div className="flex flex-col gap-1">
                                      <img
                                        src={selectedBrand.logo}
                                        alt="Логотип компании"
                                        className="max-h-[60px] min-h-[60px] object-contain rounded-md border bg-background px-2 opacity-60"
                                      />
                                      <p className="text-[10px] text-muted-foreground text-center">Из профиля</p>
                                    </div>
                                  ) : (
                                    <label
                                      htmlFor="brand-logo-input"
                                      className="h-14 w-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center bg-muted/50 cursor-pointer hover:bg-muted hover:border-primary/40 transition-colors"
                                    >
                                      <Upload className="w-4 h-4 text-muted-foreground mb-0.5" />
                                      <span className="text-[10px] text-muted-foreground">Загрузить</span>
                                    </label>
                                  )}
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-muted-foreground">PNG, SVG, JPG до 2 МБ</span>
                                    {!brandLogo && (
                                      <label
                                        htmlFor="brand-logo-input"
                                        className="text-[10px] text-primary cursor-pointer hover:underline"
                                      >
                                        {selectedBrand?.logo ? "Загрузить своё" : "Загрузить"}
                                      </label>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Слоган / подзаголовок</Label>
                                <Input
                                  value={brandSlogan}
                                  onChange={(e) => setBrandSlogan(e.target.value)}
                                  placeholder={defaultSlogan || "Мы строим будущее вместе"}
                                  className="h-9 text-sm"
                                />
                                {defaultSlogan && !brandSlogan && (
                                  <p className="text-[10px] text-muted-foreground">Из профиля компании: {defaultSlogan}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Сайт компании</Label>
                                <Input
                                  value={brandWebsite}
                                  onChange={(e) => setBrandWebsite(e.target.value)}
                                  placeholder={defaultWebsite || "https://example.ru"}
                                  className="h-9 text-sm"
                                  type="url"
                                />
                                {defaultWebsite && !brandWebsite && (
                                  <p className="text-[10px] text-muted-foreground">Из профиля компании: {defaultWebsite}</p>
                                )}
                              </div>
                            </>
                          )
                        })()}
                        {/* Ссылка на публичную страницу */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Публичная страница вакансии</Label>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border text-xs font-mono text-muted-foreground">
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
                          {mainCompanyData.subdomain && (
                            <p className="text-[10px] text-muted-foreground">Домен настроен в профиле компании: <span className="font-mono">{mainCompanyData.subdomain}.company24.pro</span></p>
                          )}
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
                      </CardContent>
                    </Card>
                </div>
                )}

                {/* ───────── ТАБ «Источники» ───────── */}
                {settingsSection === "sources" && (
                <div className="space-y-6 max-w-3xl">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Источники кандидатов</h3>
                    <p className="text-sm text-muted-foreground mb-3">Подключение сервисов для импорта откликов</p>
                    <div className="space-y-3">
                        {apiVacancy?.hhVacancyId ? (
                          <div className="rounded-lg border bg-card p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#D6001C" }}>hh</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">Интеграция с hh.ru</p>
                                <p className="text-[11px] text-muted-foreground">
                                  ID вакансии:{" "}
                                  <a
                                    href={apiVacancy.hhUrl ?? `https://hh.ru/vacancy/${apiVacancy.hhVacancyId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline font-mono"
                                  >
                                    {apiVacancy.hhVacancyId}
                                  </a>
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs h-6 bg-emerald-500/10 text-emerald-700 border-emerald-200 shrink-0">Подключено</Badge>
                              <a
                                href={apiVacancy.hhUrl ?? `https://hh.ru/vacancy/${apiVacancy.hhVacancyId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                              >
                                Открыть на hh.ru <ExternalLink className="w-3 h-3" />
                              </a>
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
                                <span aria-hidden>🔗</span>
                                <span>Подключена:</span>
                                <span className="font-medium text-foreground">{hhSyncMeta?.createdAt ? formatHhSyncDate(hhSyncMeta.createdAt) : "—"}</span>
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
                            <div className="flex-1 min-w-0"><p className="text-sm font-medium">hh.ru</p><p className="text-[11px] text-muted-foreground">Эта вакансия не привязана к hh.ru. Нажмите «Привязать», чтобы выбрать вакансию из аккаунта.</p></div>
                            <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => setHhImportDialogOpen(true)}>Привязать</Button>
                          </div>
                        )}
                      {/* Авито Работа — карточка источника */}
                      {avitoCompanyConnected ? (
                        /* Авито подключено на уровне компании */
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#00AAFF" }}>А</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Авито Работа</p>
                            <p className="text-[11px] text-muted-foreground">
                              {vacancyAvitoEnabled
                                ? "Принимаем отклики из Авито Мессенджера"
                                : "Канал Авито отключён для этой вакансии"}
                            </p>
                          </div>
                          {vacancyAvitoEnabled ? (
                            <Badge variant="outline" className="text-xs h-6 bg-emerald-500/10 text-emerald-700 border-emerald-200 shrink-0">Активно</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Отключено</Badge>
                          )}
                          <span className="text-xs text-muted-foreground shrink-0">0 кандидатов</span>
                        </div>
                      ) : avitoStatus?.configured ? (
                        /* Настроено, но выключено */
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#00AAFF" }}>А</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Авито Работа</p>
                            <p className="text-[11px] text-muted-foreground">Интеграция настроена, но выключена. Включите в Настройки → Интеграции.</p>
                          </div>
                          <Badge variant="outline" className="text-xs h-6 text-amber-700 border-amber-200 bg-amber-50 shrink-0">Выключено</Badge>
                          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => window.open("/hr/settings?tab=integrations", "_blank")}>Включить</Button>
                        </div>
                      ) : (
                        /* Не настроено — ведём в Интеграции */
                        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#00AAFF" }}>А</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Авито Работа</p>
                            <p className="text-[11px] text-muted-foreground">Подключите Авито Мессенджер в Настройки → Интеграции, чтобы получать отклики.</p>
                          </div>
                          <Badge variant="outline" className="text-xs h-6 text-muted-foreground shrink-0">Не подключено</Badge>
                          <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => window.open("/hr/settings?tab=integrations", "_blank")}>Подключить</Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Telegram-постинг */}
                  <TelegramPosting vacancyId={id} />

                  {/* Источники и UTM-ссылки */}
                  <UtmLinksSection vacancyId={id} vacancySlug={id} />

                  {/* Поля мини-формы (перенесено из «Брендинг» по P0-38) */}
                  <MiniFormBuilder vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} />

                  {/* HTML-страница (перенесено из «Брендинг» по P0-38) */}
                  <PublishTab
                    vacancyTitle={internalName || vacancyTitle}
                    vacancySlug={id}
                    vacancyCity={apiVacancy?.city ?? "Москва"}
                    salaryFrom={apiVacancy?.salaryMin}
                    salaryTo={apiVacancy?.salaryMax}
                    brandOverride={{ companyName: brandCompanyName, color: brandColor, logo: brandLogo, slogan: brandSlogan }}
                    formFields={Array.isArray((apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.miniFormFields)
                      ? (apiVacancy!.descriptionJson as Record<string, unknown>).miniFormFields as Array<{ id: string; label: string; type: string; required: boolean; placeholder?: string; options?: string[] }>
                      : undefined}
                  />
                </div>
                )}

                {/* ───────── ТАБ «Сообщения» ───────── */}
                {settingsSection === "messages" && (
                <div className="space-y-6 max-w-3xl">
                  {(apiVacancy as { funnelBuilderEnabled?: boolean } | undefined)?.funnelBuilderEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        Конструктор воронки активен. Изменения здесь синхронизируются с конструктором.
                      </div>
                    </div>
                  )}
                  {/* #62: предупреждение для случая когда включён AI-агент.
                      Обработка пока не подключена (см. ai-chatbot tab), но
                      когда заработает — все блоки ниже будут заглушены
                      AI-агентом. Сейчас они продолжают работать. */}
                  {(apiVacancy as { aiChatbotEnabled?: boolean } | undefined)?.aiChatbotEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        <strong>AI чат-бот включён для этой вакансии.</strong> Когда
                        обработка заработает (на следующей неделе), блоки ниже
                        будут отключены — за общение с кандидатом отвечает агент.
                        Сейчас они продолжают работать как обычно.
                      </div>
                    </div>
                  )}
                  {/* #21: серия первых сообщений. Рендерится первой — это
                      замена старого блока «Первое сообщение» (он останется
                      в AutomationSettings как fallback для backward compat,
                      его текстовый шаблон используется как chain[0] если
                      chain пустой). Цепочка пишет также в
                      ai_process_settings.inviteMessage, поэтому
                      процесс отправки msg1 продолжает работать. */}
                  <FirstMessagesChainEditor
                    vacancyId={id}
                    initial={(apiVacancy as { firstMessagesChain?: Array<{ enabled: boolean; delaySeconds: number; text: string }> } | undefined)?.firstMessagesChain ?? []}
                    fallbackFirstMessage={(apiVacancy?.aiProcessSettings as { inviteMessage?: string } | null | undefined)?.inviteMessage ?? ""}
                    fallbackFirstDelaySeconds={(() => {
                      const dj = apiVacancy?.descriptionJson as { automation?: { delaySeconds?: number; delayMinutes?: number } } | null | undefined
                      const a = dj?.automation
                      if (typeof a?.delaySeconds === "number") return a.delaySeconds
                      if (typeof a?.delayMinutes === "number") return a.delayMinutes * 60
                      return 180
                    })()}
                    initialOffHoursEnabled={(apiVacancy as { firstMessageOffHoursEnabled?: boolean } | undefined)?.firstMessageOffHoursEnabled ?? false}
                    initialOffHoursDelaySeconds={(apiVacancy as { firstMessageOffHoursDelaySeconds?: number } | undefined)?.firstMessageOffHoursDelaySeconds ?? 15}
                    initialOffHoursText={(apiVacancy as { firstMessageOffHoursText?: string | null } | undefined)?.firstMessageOffHoursText ?? ""}
                    onSaved={() => refetchVacancy()}
                  />
                  <AutomationSettings
                    vacancyId={id}
                    descriptionJson={apiVacancy?.descriptionJson}
                    vacancyTitle={apiVacancy?.title}
                    salaryFrom={apiVacancy?.salaryMin}
                    salaryTo={apiVacancy?.salaryMax}
                    aiProcessSettings={apiVacancy?.aiProcessSettings as { inviteMessage?: string; reInviteMessage?: string } | null | undefined}
                    // #60: чтобы блок «Минимальная задержка» мог скрыться,
                    // когда серия первых сообщений активна.
                    firstMessagesChain={(apiVacancy as { firstMessagesChain?: Array<{ enabled: boolean; delaySeconds: number; text: string }> } | undefined)?.firstMessagesChain ?? []}
                    sections={["firstMessage", "callIntent", "templates"] satisfies AutomationSectionId[]}
                    tabKey="messages"
                  />
                  {/* #46: «Аварийное повторное сообщение» — opt-in под спойлером. */}
                  <RecoveryMessageSettings
                    vacancyId={id}
                    initialEnabled={(apiVacancy as { recoveryMessageEnabled?: boolean } | undefined)?.recoveryMessageEnabled ?? false}
                    initialText={(apiVacancy as { recoveryMessageText?: string } | undefined)?.recoveryMessageText ?? ""}
                    onSaved={() => refetchVacancy()}
                  />
                </div>
                )}

                {/* ───────── ТАБ «Демо и воронка» ───────── */}
                {settingsSection === "funnel" && (
                <div className="space-y-6 max-w-3xl">
                  {(apiVacancy as { funnelBuilderEnabled?: boolean } | undefined)?.funnelBuilderEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        Конструктор воронки активен. Изменения здесь синхронизируются с конструктором.
                      </div>
                    </div>
                  )}
                  {/* Редактор стадий воронки (стадии/цвета/названия + действие в hh.ru
                      на каждую стадию). Дефолты hh — из company-маппинга. */}
                  <FunnelTab
                    key={`funnel-${companyHhActions ? "co" : "pf"}-${companyPalette ? "pa" : "np"}`}
                    vacancyId={id}
                    initialPipeline={parsePipeline((apiVacancy?.descriptionJson as { pipeline?: unknown } | undefined)?.pipeline, companyHhActions, companyPalette)}
                    companyPalette={companyPalette}
                    onSaved={() => refetchVacancy()}
                  />
                  <VacancyPrequalificationSettings
                    vacancyId={id}
                    initial={apiVacancy?.aiProcessSettings ?? null}
                    onSaved={() => refetchVacancy()}
                  />
                  {/* #61: per-vacancy стоп-факторы. Логика применения в
                      process-queue пока не подключена — это отдельная
                      задача. Сейчас компонент только хранит конфиг. */}
                  <VacancyStopFactorsSettings
                    vacancyId={id}
                    initial={(apiVacancy as { stopFactorsJson?: import("@/lib/db/schema").VacancyStopFactors } | undefined)?.stopFactorsJson ?? null}
                    onSaved={() => refetchVacancy()}
                  />
                  {/* P0-22: editable стоп-слова, единый источник для дожима и hh-чата. */}
                  <VacancyStopWordsSettings
                    vacancyId={id}
                    initial={(apiVacancy as { stopWordsJson?: string[] } | undefined)?.stopWordsJson ?? null}
                    onSaved={() => refetchVacancy()}
                  />
                  {/* #16/#25: тексты двух финальных экранов демо. */}
                  <FinalScreensSettings
                    vacancyId={id}
                    initial={((apiVacancy?.descriptionJson as { finalScreens?: FinalScreensConfig } | null | undefined)?.finalScreens) ?? null}
                  />
                  <PostDemoSettings vacancyId={id} />
                </div>
                )}

                {/* ───────── ТАБ «Конструктор воронки [Beta]» ───────── */}
                {settingsSection === "funnel-builder" && (
                <div className="space-y-6 max-w-3xl">
                  <FunnelBuilder vacancyId={id} />
                </div>
                )}

                {/* ───────── ТАБ «Кого ищем» (R4 Candidate Spec, новый контур) ───────── */}
                {settingsSection === "spec" && (
                  <SpecEditor vacancyId={id} />
                )}

                {/* ───────── ТАБ «Дожим» ───────── */}
                {settingsSection === "followup" && (
                <div className="space-y-6 max-w-3xl">
                  {(apiVacancy as { funnelBuilderEnabled?: boolean } | undefined)?.funnelBuilderEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        Конструктор воронки активен. Изменения здесь синхронизируются с конструктором.
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Настройки дожима</h3>
                    <p className="text-sm text-muted-foreground">AI-фильтр откликов и цепочка касаний кандидатов, которые не открыли или не дошли до конца демо.</p>
                  </div>
                  {/* #62: предупреждение когда AI-агент включён. */}
                  {(apiVacancy as { aiChatbotEnabled?: boolean } | undefined)?.aiChatbotEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        <strong>AI чат-бот включён.</strong> Когда обработка заработает,
                        цепочка дожима будет отключена для этой вакансии — общение
                        ведёт агент. Сейчас цепочка продолжает работать.
                      </div>
                    </div>
                  )}
                  {/* Группа 25: структурированные требования + двухпроходный
                      AI-скоринг v2. При must_have ≥ 1 — параллельно с v1 для A/B. */}
                  <VacancyRequirementsSettings
                    vacancyId={id}
                    initial={(apiVacancy as { requirementsJson?: import("@/lib/db/schema").VacancyRequirements } | undefined)?.requirementsJson ?? null}
                    onSaved={() => refetchVacancy()}
                  />
                  <VacancyAiProcessSettings
                    vacancyId={id}
                    initial={apiVacancy?.aiProcessSettings ?? null}
                    initialAiScoringEnabled={apiVacancy?.aiScoringEnabled ?? true}
                    onSaved={() => refetchVacancy()}
                  />
                  <VacancyFollowupSettings vacancyId={id} />
                  <VacancyTestFollowupSettings vacancyId={id} />
                </div>
                )}

                {/* ───────── ТАБ «AI чат-бот» ───────── */}
                {settingsSection === "aichatbot" && (
                <div className="space-y-6 max-w-3xl">
                  {(apiVacancy as { funnelBuilderEnabled?: boolean } | undefined)?.funnelBuilderEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        Конструктор воронки активен. Изменения здесь синхронизируются с конструктором.
                      </div>
                    </div>
                  )}
                  <AiChatbotSettings vacancyId={id} onSaved={() => refetchVacancy()} />
                </div>
                )}

                {/* ───────── ТАБ «Расписание» (бывший «AI сценарии») ───────── */}
                {settingsSection === "ai" && <ScheduleTab vacancyId={id} />}

                {/* ───────── ТАБ «Интеграции» ───────── */}
                {settingsSection === "integrations" && (
                <div className="space-y-6 max-w-3xl">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">CRM-интеграции</h3>
                    <p className="text-sm text-muted-foreground mb-3">Синхронизация воронки с CRM</p>
                    <div className="space-y-3">
                      {isPlatformAdmin ? (<>
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
                      </>) : (
                      <p className="text-sm text-muted-foreground">CRM-интеграции скоро будут доступны.</p>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">Любые webhook/API-настройки появятся здесь после подключения CRM.</p>
                  </div>

                  {/* AI-агент (перенесён из «AI сценарии» по ТЗ-1 Часть 1.2; #24: переименован с «Бот-звонарь») */}
                  <AutomationSettings
                    vacancyId={id}
                    descriptionJson={apiVacancy?.descriptionJson}
                    vacancyTitle={apiVacancy?.title}
                    salaryFrom={apiVacancy?.salaryMin}
                    salaryTo={apiVacancy?.salaryMax}
                    aiProcessSettings={apiVacancy?.aiProcessSettings as { inviteMessage?: string; reInviteMessage?: string } | null | undefined}
                    sections={["dialer"] satisfies AutomationSectionId[]}
                    tabKey="integrations"
                  />
                </div>
                )}

                {/* Единая sticky-кнопка сохранения + beforeunload-защита */}
                <VacancyStickySaveBar />
                </VacancySettingsProvider>
              </TabsContent>
            </Tabs>

            {/* ═══ Bottom tab navigation ══════════════════ */}
            {(() => {
              const tabOrder = status === "active"
                ? ["candidates", "analytics", "content", "anketa", "settings"]
                : ["anketa", "analytics", "candidates", "content", "settings"]
              const tabLabels: Record<string, string> = { anketa: "Вакансия", content: "Контент", candidates: "Кандидаты", analytics: "Аналитика", settings: "Настройки" }
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
            <DialogTitle>Привязать вакансию с hh.ru</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Вставьте ссылку на вакансию с hh.ru — она будет привязана, данные подтянутся, и платформа начнёт получать отклики.</p>
            <Input
              value={hhImportUrl}
              onChange={(e) => setHhImportUrl(e.target.value)}
              placeholder="Ссылка на вакансию с hh.ru (например https://hh.ru/vacancy/12345678)"
              className="h-10 text-sm"
              autoFocus
              disabled={hhImportBusy}
              onKeyDown={(e) => { if (e.key === "Enter" && hhImportUrl.trim() && !hhImportBusy) handleHhVacancyImport() }}
            />
            <Button className="w-full h-10" onClick={handleHhVacancyImport} disabled={hhImportBusy || !hhImportUrl.trim()}>
              {hhImportBusy ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Привязка...</> : <><Globe className="size-4 mr-1.5" />Привязать вакансию</>}
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
      <ExportCandidatesDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        vacancyId={id}
        selectedIds={Array.from(selectedCandidateIds)}
      />

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
                  if (useListPaginated) {
                    // Пагинированный список: кандидат в paginated.*, не в columns.
                    const candidate = paginatedColumns?.[0]?.candidates.find(c => c.id === rejectCandidateId)
                    toast.success(`${candidate?.name ?? "Кандидат"} отклонён`)
                    const ok = await paginated.updateStage(rejectCandidateId, "rejected")
                    if (ok) paginated.refetch(); else toast.error("Не удалось отказать")
                    if (candidate?.aiScore != null && candidate.aiScore >= 50) {
                      setTalentPoolCandidate(candidate)
                      setTalentPoolDialogOpen(true)
                    }
                  } else {
                    const candidate = columns.find(c => c.id === rejectColumnId)?.candidates.find(c => c.id === rejectCandidateId)
                    setColumns(p => p.map(c => c.id !== rejectColumnId ? c : { ...c, candidates: c.candidates.filter(x => x.id !== rejectCandidateId), count: c.candidates.filter(x => x.id !== rejectCandidateId).length }))
                    toast.success(`${candidate?.name ?? "Кандидат"} отклонён`)
                    await updateStage(rejectCandidateId, "rejected")
                    // Suggest talent pool for candidates with decent AI score
                    if (candidate?.aiScore != null && candidate.aiScore >= 50) {
                      setTalentPoolCandidate(candidate)
                      setTalentPoolDialogOpen(true)
                    }
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
            <AlertDialogTitle>Добавить в резерв?</AlertDialogTitle>
            <AlertDialogDescription>
              Кандидат {talentPoolCandidate?.name} набрал {talentPoolCandidate?.aiScore} баллов AI-скрининга. Хотите сохранить его в резерв для будущих вакансий?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (talentPoolCandidate) {
                await updateStage(talentPoolCandidate.id, "talent_pool")
                toast.success(`${talentPoolCandidate.name} добавлен в резерв`)
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
        vacancyAnketa={drawerAnketa}
        onStageChange={(candidateId, newStage) => {
          // Sync kanban columns when stage changes in drawer
          setColumns((prev) => {
            const targetStage = newStage
            return prev.map((col) => {
              // Remove from old column
              const filtered = col.candidates.filter((c) => c.id !== candidateId)
              // Add to new column
              if (col.id === targetStage) {
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

      {/* Корзина кандидатов вакансии — восстановление / удаление навсегда. */}
      <CandidateTrashSheet
        vacancyId={id}
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onChanged={() => { (useListPaginated ? paginated.refetch() : refetchCandidates()) }}
      />

      {/* F1 Rediscovery — поиск кандидатов из базы компании. */}
      <RediscoverySheet
        vacancyId={id}
        open={rediscoveryOpen}
        onOpenChange={setRediscoveryOpen}
        onAdded={() => { useListPaginated ? paginated.refetch() : refetchCandidates() }}
      />

      {/* Bulk actions floating bar — visible only when кандидаты выделены
          И активен таб «Кандидаты». На других табах (Аналитика, Контент,
          Вакансия, Настройки) бар скрывается, т.к. там нет списка и
          выделение кандидатов не имеет смысла.
          allRejected включает режим bulk-restore: если ВСЕ выделенные
          сейчас в 'rejected', вместо «Отказать/Пригласить/...» показываем
          только «Вернуть в воронку». Считаем по уже подгруженным карточкам
          (paginated.candidates + filtered.columns) — оба варианта режима
          списка кладут кандидата в один из этих источников. */}
      {activeTab === "candidates" && <BulkActionsBar
        count={selectedCandidateIds.size}
        stages={columns.map((c) => ({ id: c.id, title: c.title }))}
        allRejected={(() => {
          if (selectedCandidateIds.size === 0) return false
          const stageById = new Map<string, string>()
          for (const c of paginated.candidates) stageById.set(c.id, c.stage ?? "")
          for (const col of columns) for (const cand of col.candidates) {
            if (!stageById.has(cand.id)) stageById.set(cand.id, col.id)
          }
          for (const id of selectedCandidateIds) {
            if (stageById.get(id) !== "rejected") return false
          }
          return true
        })()}
        canDelete={canDeleteCandidates}
        onClear={() => setSelectedCandidateIds(new Set())}
        onAction={handleBulkAction}
      />}

      {/* Окно «Отправить тест»: текст приглашения (предзаполнен), можно
          отредактировать — правка сохраняется как шаблон вакансии. */}
      <Dialog open={testInviteOpen} onOpenChange={(o) => { if (!testInviteSending) setTestInviteOpen(o) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Отправить тест · {testInviteIds.length} кандидат(ов)</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Это сообщение уйдёт кандидату в hh-чат со ссылкой на тест. Плейсхолдеры:
              {" "}<code>{"{{name}}"}</code>, <code>{"{{vacancy}}"}</code>, <code>{"{{test_link}}"}</code>.
            </p>
            <Textarea
              value={testInviteText}
              onChange={(e) => setTestInviteText(e.target.value)}
              rows={6}
              placeholder="Текст приглашения к тесту…"
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground/70">
              Отправка по очереди, с паузой между сообщениями. Кандидаты без hh-чата будут пропущены.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestInviteOpen(false)} disabled={testInviteSending}>Отмена</Button>
            <Button onClick={confirmSendTest} disabled={testInviteSending || !testInviteText.trim()}>
              {testInviteSending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-1.5" />}
              Отправить тест
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

// P0-50 final: маленький register-компонент. Рендерится ВНУТРИ <VacancySettingsProvider>
// в карточке «Брендинг», вызывает useVacancySectionRegister с актуальными
// значениями + save-функцией главной страницы. Возвращает null — UI у него нет.
//
// Вынесен наружу, потому что useVacancySectionRegister должен видеть Provider
// через useVacancySettings(). Главный компонент VacancyDetailPage этот provider
// НЕ оборачивает целиком — только таб настроек. Поэтому регистрируем брендинг
// здесь, через дочерний компонент, мониящийся при открытии таба «Брендинг».
function BrandingStickyRegister({
  vacancyId, loaded, branding, save,
}: {
  vacancyId: string
  loaded: boolean
  branding: {
    companyName: string; color: string; slogan: string; website: string; logo: string
    domainLevel: "free" | "subdomain" | "custom"
    companySlug: string; customDomain: string
  }
  save: () => Promise<void>
}) {
  useVacancySectionRegister({
    sectionKey: `branding:${vacancyId}`,
    tabKey: "page",
    loaded,
    watchedValues: branding,
    save,
  })
  return null
}

// #11: кнопка саб-таба настроек, перехватывающая клик через
// useSafeSubTabSwitch. Если в текущем подтабе есть несохранённые
// изменения — confirm-диалог даёт три исхода: сохранить и перейти,
// перейти без сохранения, остаться. Компонент рендерится внутри
// <VacancySettingsProvider>, поэтому hook сработает.
function SettingsSubNavButton({
  tab, label, Icon, active, currentTab, onSwitch,
}: {
  tab: VacancyTabKey
  label: string
  Icon: typeof Globe
  active: boolean
  currentTab: VacancyTabKey
  onSwitch: () => void
}) {
  const safeSwitch = useSafeSubTabSwitch(currentTab)
  return (
    <button
      type="button"
      data-vacancy-tab
      onClick={() => safeSwitch(tab, onSwitch)}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      <VacancyTabPendingDot tab={tab} />
    </button>
  )
}
