"use client"

import { useState, useRef, useEffect, useCallback, useMemo, Suspense, type ReactNode } from "react"
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
import { type CardDisplaySettings, relevantColumnKeys } from "@/components/dashboard/card-settings"
import { ViewSettings } from "@/components/dashboard/view-settings"
import { CandidateFilters, DEFAULT_FUNNEL_STATUSES, type FilterState } from "@/components/dashboard/candidate-filters"
import { applyCandidateFilters } from "@/lib/candidate-filter"
import { SortMenu } from "@/components/dashboard/sort-menu"
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { CandidateSortMode } from "@/lib/candidate-sort"
import { CandidateDrawer } from "@/components/candidates/candidate-drawer"
import { CandidateTrashSheet } from "@/components/candidates/candidate-trash-sheet"
import { RediscoverySheet } from "@/components/candidates/rediscovery-sheet"
import { InterviewInviteConfirm, shouldSkipInterviewInviteConfirm, type InterviewMeetMode } from "@/components/candidates/interview-invite-confirm"
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
import {Clock, Settings, BookOpen, BarChart3, Kanban, Pencil, MessageCircle, MessageSquare, MessageSquareText, Zap, Globe, AlertTriangle, CheckCircle2, TrendingUp, Filter, FilterX, X, Link2, Copy, Save, Sparkles, Eye, Check, Loader2, Download, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Users, Upload, Plus, RefreshCw, Bot, Workflow, FilePlus, UserSearch, Trash2, Target, Inbox, CalendarDays, Plug} from "lucide-react"
import { InterviewsView } from "@/app/(modules)/hr/interviews/page"
import { AiChatbotSettings } from "@/components/vacancies/ai-chatbot-settings"
import { ApplyRoleTemplateDialog } from "@/components/vacancies/apply-role-template-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { defaultColumnColors, COLUMN_ORDER, type CandidateAction, getNextColumnId, PROGRESS_BY_COLUMN } from "@/lib/column-config"
import type { Candidate } from "@/components/dashboard/candidate-card"
import { VacancyStatusBadge } from "@/components/vacancies/vacancy-status-badge"
import { HhAutoProcess } from "@/components/hh/hh-auto-process"
import { AutomationSettings, type AutomationSectionId } from "@/components/vacancies/automation-settings"
import { ScheduleTab } from "@/components/vacancies/schedule-tab"
import { PublishTab } from "@/components/vacancies/publish-tab"
import { OutboundSourcingTab } from "@/components/vacancies/outbound-sourcing-tab"
import { PublishTimeHeatmapCard } from "@/components/vacancies/publish-time-heatmap"
import { VacancyActionsMenuItems } from "@/components/vacancies/vacancy-actions-menu"
import { ExportCandidatesDialog } from "@/components/vacancies/export-candidates-dialog"
import { PermanentDeleteDialog } from "@/components/vacancies/permanent-delete-dialog"
import { HhBroadcastDialog } from "@/components/vacancies/hh-broadcast-dialog"
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
import { ScheduleInviteSettings } from "@/components/vacancies/schedule-invite-settings"
import { InterviewNotificationMessagesSettings } from "@/components/vacancies/interview-notification-messages-settings"
import { InterviewBookedScreenSettings } from "@/components/vacancies/interview-booked-screen-settings"
import { FirstMessagesChainEditor } from "@/components/vacancies/first-messages-chain-editor"
import { FirstContactSettings } from "@/components/vacancies/first-contact-settings"
import { RejectionTextsSummary } from "@/components/vacancies/rejection-texts-summary"
import { CommsAgentToggle } from "@/components/vacancies/comms-agent-toggle"
import { FunnelBuilder } from "@/components/vacancies/funnel-builder"
import { FunnelV2Builder } from "@/components/vacancies/funnel-v2-builder"
import { FunnelV3Editor } from "@/components/vacancies/funnel-v3-editor"
import { SpecEditor } from "@/components/vacancies/spec-editor"
import { FunnelTab } from "@/components/vacancies/funnel-tab"
import { MessageQueueSection } from "@/components/vacancies/message-queue-section"
import { InboxTab } from "@/components/vacancies/inbox-tab"
import { OutboundPauseMenuItem } from "@/components/vacancies/outbound-pause-control"
import { parsePipeline, resolveVacancyStageOptions, DEMO_OPENED_STAGE_SLUGS, type CompanyStageHhActions, type CompanyStagePalette, type FunnelV2StageLite } from "@/lib/stages"
import { BrandingOverrideSwitch } from "@/components/vacancies/branding-override-switch"
import { VacancySettingsProvider, VacancyTabPendingDot, VacancyTabFooter, useVacancySectionRegister, useSafeSubTabSwitch, type VacancyTabKey } from "@/components/vacancies/vacancy-settings-context"
import { SettingsTabShell } from "@/components/vacancies/settings-tab-shell"
import { isOwnerEmail } from "@/lib/owner"
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

// Компактное форматирование числа токенов: ≥1M → «1.2M», ≥1K → «350K», иначе число.
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`
  return String(n)
}

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
  // Все колонки списка ВКЛЮЧЕНЫ по умолчанию (решение Юрия) — пишем явно, без undefined.
  showResumeScore: true, showPortraitScore: true, showAnswersScore: true,
  showTestScore: true, showNextInterview: true,
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
    aiScoreV2: c.aiScoreV2 ?? null,
    demoAnswersScore: c.demoAnswersScore ?? null,
    anketaPartsAnswered: c.anketaPartsAnswered,
    anketaPartsTotal: c.anketaPartsTotal,
    completedDemoBlockIndexes: (c as { completedDemoBlockIndexes?: number[] }).completedDemoBlockIndexes ?? [],
    demoBlockTooltip: (c as { demoBlockTooltip?: string | null }).demoBlockTooltip ?? null,
    nameUncertain: c.nameUncertain === true,
    testScore: c.testScore ?? null,
    testStatus: c.testStatus ?? null,
    testScoringStatus: c.testScoringStatus ?? null,
    interviewScore: c.interviewScore ?? null,
    isActive: (c as { isActive?: boolean }).isActive ?? false,
    demoProgressJson: c.demoProgressJson as Candidate["demoProgressJson"],
    demoTotalBlocks: (c as { demoTotalBlocks?: number }).demoTotalBlocks,
    demoCompletedBlocks: (c as { demoCompletedBlocks?: number }).demoCompletedBlocks,
    progressPercent: (c as { progressPercent?: number | null }).progressPercent,
    demoCompletedByAnswers: (c as { demoCompletedByAnswers?: boolean }).demoCompletedByAnswers,
    isFavorite: c.isFavorite ?? false,
    createdAt: c.createdAt,
    lastRespondedAt: c.lastRespondedAt ?? null,
    pendingRejectionReason: (c as { pendingRejectionReason?: string | null }).pendingRejectionReason ?? null,
    pendingRejectionAt: (c as { pendingRejectionAt?: string | null }).pendingRejectionAt ?? null,
    // Разведка 14.07: см. Candidate.autoProcessingStoppedReason (candidate-card.tsx).
    autoProcessingStoppedReason: (c as { autoProcessingStoppedReason?: string | null }).autoProcessingStoppedReason ?? null,
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
    funnelV2StateJson: (c.funnelV2StateJson as { stageId?: string | null } | null) ?? null,
    // «2-я часть демо»: override-блок → контекстный ярлык «2-я часть» в статусе.
    overrideContentBlockId: (c as { overrideContentBlockId?: string | null }).overrideContentBlockId ?? null,
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
  const { role, user } = useAuth()
  // «Воронка 3» — owner-only (обкатывается; Юрий 03.07 оставил под гейтом,
  // остальные фичи раскрыты). API funnel-v2 тоже owner-gated.
  const funnelV3Visible = isOwnerEmail(user?.email)

  // «Рабочий стол» (/hr/workspace) открывает последнюю посещённую вакансию.
  useEffect(() => {
    try { localStorage.setItem("hr:last-vacancy", id) } catch {}
  }, [id])

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
        setBrandCompaniesData(hd.brandCompanies.filter((c: { id: string; name: string; description?: string }) => c?.name?.trim()))
      }
      // B5: колонки списка кандидатов единые для компании
      if (hd?.candidateColumns && typeof hd.candidateColumns === "object" && Object.keys(hd.candidateColumns).length > 0) {
        setCardSettingsLocal((prev) => ({ ...prev, ...hd.candidateColumns } as typeof prev))
      }
      // Уровень 2: сохраняем company webhook URL для отображения в секции интеграций вакансии
      if (typeof hd?.webhooks?.url === "string") {
        setCompanyWebhookUrl(hd.webhooks.url)
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
        description: c.companyDescription || "",
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
  // Привязывать ли вакансию к hh (получать отклики) — отдельный шаг. По умолчанию
  // СНЯТО (просто заполнить поля); путь «Привязать» выставляет галочку явно.
  const [hhImportBind, setHhImportBind] = useState(false)
  // Q3: предложение добавить компанию-работодателя из hh в список брендов HR
  const [newBrandPrompt, setNewBrandPrompt] = useState<{ name: string; description: string } | null>(null)
  const [addBrandBusy, setAddBrandBusy] = useState(false)
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
        positionCategory: parsed.positionCategory ? [parsed.positionCategory] : (Array.isArray(existingAnketa.positionCategory) ? existingAnketa.positionCategory : (existingAnketa.positionCategory ? [existingAnketa.positionCategory] : [])),
        workFormats: parsed.workFormats ?? existingAnketa.workFormats ?? [],
        employment: parsed.employment ?? existingAnketa.employment ?? [],
        positionCity: parsed.positionCity ?? existingAnketa.positionCity ?? "",
        salaryFrom: parsed.salaryFrom ?? existingAnketa.salaryFrom ?? "",
        salaryTo: parsed.salaryTo ?? existingAnketa.salaryTo ?? "",
        bonus: parsed.bonus ?? existingAnketa.bonus ?? "",
        responsibilities: parsed.responsibilities ?? existingAnketa.responsibilities ?? "",
        requirements: parsed.requirements ?? existingAnketa.requirements ?? "",
        // vacancySkills: parse-vacancy уже объединяет requiredSkills+desiredSkills в vacancySkills.
        // Мёрджим через Set, чтобы не затереть уже введённые вручную навыки.
        vacancySkills: Array.from(new Set([
          ...((existingAnketa.vacancySkills as string[]) ?? []),
          ...((parsed.vacancySkills as string[]) ?? []),
        ])),
        // legacy-поля оставляем как есть (не перезаписываем, миграция склеит их позже)
        requiredSkills: existingAnketa.requiredSkills ?? [],
        desiredSkills: existingAnketa.desiredSkills ?? [],
        unacceptableSkills: parsed.unacceptableSkills ?? existingAnketa.unacceptableSkills ?? [],
        experienceMin: parsed.experienceMin ?? existingAnketa.experienceMin ?? "",
        experienceIdeal: parsed.experienceIdeal ?? existingAnketa.experienceIdeal ?? "",
        conditions: parsed.conditions ?? existingAnketa.conditions ?? [],
        conditionsText: parsed.conditionsText ?? existingAnketa.conditionsText ?? "",
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
        // Точечный payload (только anketa) — сервер root-мёржит с БД, поэтому НЕ
        // шлём весь ...existing: устаревший снапшот затирал бы независимые секции
        // (funnelV2/finalScreens/…). Баг Юрия 08.07.
        description_json: { anketa: newAnketa },
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
        body: JSON.stringify({ hhUrl: url, bind: hhImportBind }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; data?: { companyName?: string }; companyAbout?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await refetchVacancy()
      toast.success(hhImportBind ? "✅ Заполнено и привязано к hh.ru" : "✅ Поля заполнены из hh.ru")
      setHhImportDialogOpen(false)
      setHhImportUrl("")
      maybeOfferNewCompany(data.data?.companyName, data.companyAbout)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка импорта")
    } finally {
      setHhImportBusy(false)
    }
  }

  // Q3: если компания с hh не совпадает ни с основной, ни с брендами — предложить добавить.
  const maybeOfferNewCompany = (companyName?: string, description?: string) => {
    const name = (companyName || "").trim()
    if (!name) return
    const known = new Set<string>()
    if (mainCompanyData?.brandName) known.add(mainCompanyData.brandName.trim().toLowerCase())
    brandCompaniesData.forEach(c => { if (c?.name) known.add(c.name.trim().toLowerCase()) })
    if (known.has(name.toLowerCase())) return
    setNewBrandPrompt({ name, description: (description || "").trim() })
  }

  const handleAddBrandCompany = async () => {
    if (!newBrandPrompt) return
    setAddBrandBusy(true)
    try {
      // Свежий список брендов с сервера (не state с mount) — чтобы не затереть
      // правки логотипов/слоганов, сделанные в другой вкладке (Настройки HR).
      const hdRes = await fetch("/api/modules/hr/company/hiring-defaults")
      const hdJson = hdRes.ok ? await hdRes.json() : null
      const currentBrands = Array.isArray(hdJson?.hiringDefaults?.brandCompanies)
        ? (hdJson.hiringDefaults.brandCompanies as typeof brandCompaniesData)
        : brandCompaniesData
      const newBrand = { id: `brand_${Date.now()}`, name: newBrandPrompt.name, description: newBrandPrompt.description }
      const next = [...currentBrands, newBrand]
      const res = await fetch("/api/modules/hr/company/hiring-defaults", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandCompanies: next }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить компанию")
      setBrandCompaniesData(next)
      // Выбрать новую компанию для этой вакансии (anketa.brandCompanyId).
      const existing = (apiVacancy?.descriptionJson as Record<string, unknown>) || {}
      const existingAnketa = (existing.anketa as Record<string, unknown>) || {}
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { anketa: { ...existingAnketa, brandCompanyId: newBrand.id } } }),
      })
      await refetchVacancy()
      toast.success(`Компания «${newBrand.name}» добавлена и выбрана`)
      setNewBrandPrompt(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setAddBrandBusy(false)
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
      if (src.descriptionJson) {
        body.description_json = src.descriptionJson
        // Применение шаблона ОСОЗНАННО копирует все секции, включая защищённые
        // (funnelV2/finalScreens/…) — иначе mergeDescriptionJson их отбросит и
        // воронка/экраны шаблона не скопируются. Обычные сейвы флаг НЕ ставят.
        body.copy_managed_keys = true
      }
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
  const VALID_SORT_KEYS: ListSortKey[] = ["favorite", "name", "aiScore", "resumeScore", "answersScore", "testScore", "progress", "salary", "responseDate", "status", "city", "source"]
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
  const [filters, setFilters] = useState<FilterState>({ searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, scoreMinResume: 0, scoreMinAnketa: 0, scoreMinTest: 0, sources: [], workFormats: [], relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20, funnelStatuses: initialFunnelStatuses, hideRejected: true, hideNoSalary: false, activeNow: false, reviewQueue: false, demoAnswered: false, demoProgress: [], demoBlock: [], dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [], skills: [], industries: [] })
  // #18: фасеты фильтра (города/источники) по ВСЕЙ вакансии — серверная агрегация.
  const [candidateFacets, setCandidateFacets] = useState<{ cities: { city: string; count: number }[]; sources: { source: string; count: number }[] } | null>(null)
  useEffect(() => {
    let off = false
    fetch(`/api/modules/hr/vacancies/${id}/candidate-facets`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!off && d) setCandidateFacets((d.data ?? d) as { cities: { city: string; count: number }[]; sources: { source: string; count: number }[] }) })
      .catch(() => {})
    return () => { off = true }
  }, [id])
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
    scoreMinTest: filters.scoreMinTest,
    hideRejected: filters.hideRejected,
    hideNoSalary: filters.hideNoSalary,
    activeNow: filters.activeNow,
    anketaFilled: filters.anketaFilled,
    demoAnswered: filters.demoAnswered,
    secondDemoPassed: filters.secondDemoPassed,
    ctaClicked: filters.ctaClicked,
    hhPublication: filters.hhPublication,
    reviewQueue: filters.reviewQueue,
    demoBlock: filters.demoBlock,
  }), [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Legacy pipeline текущей вакансии — для кастомных лейблов стадий в ListView. */
  const vacancyPipeline = useMemo(
    () => parsePipeline(
      (apiVacancy?.descriptionJson as { pipeline?: unknown } | undefined)?.pipeline,
      companyHhActions,
      companyPalette,
    ),
    [apiVacancy?.descriptionJson, companyHhActions, companyPalette],
  )

  /** Стадии funnel-v2 текущей вакансии (id + title) — для отображения в ListView. */
  const funnelV2Stages = useMemo(() => {
    const raw = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.funnelV2
    if (!raw || typeof raw !== "object") return undefined
    const stages = (raw as { stages?: unknown }).stages
    if (!Array.isArray(stages)) return undefined
    return (stages as Array<{ id?: string; title?: string | null }>)
      .filter((s) => typeof s.id === "string")
      .map((s) => ({ id: s.id as string, title: s.title ?? null }))
  }, [apiVacancy?.descriptionJson])

  /** 14.07 (витрина «Отказы»): сколько стадий Воронки v2 имеют свой текст
   *  отказа — либо rule.rejectText (обычный редактор, funnel-v2-builder.tsx),
   *  либо top-level rejectText (Воронка 3, funnel-v3-editor.tsx). 0 → строку
   *  в RejectionTextsSummary не показываем (см. компонент). */
  const funnelV2RejectStagesCount = useMemo(() => {
    const raw = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.funnelV2
    if (!raw || typeof raw !== "object") return 0
    const stages = (raw as { stages?: unknown }).stages
    if (!Array.isArray(stages)) return 0
    return (stages as Array<{ rejectText?: unknown; rule?: { rejectText?: unknown } }>)
      .filter((s) => {
        const top = typeof s.rejectText === "string" ? s.rejectText.trim() : ""
        const rule = typeof s.rule?.rejectText === "string" ? s.rule.rejectText.trim() : ""
        return top.length > 0 || rule.length > 0
      })
      .length
  }, [apiVacancy?.descriptionJson])

  /** Вид встречи по умолчанию для диалога «Пригласить на интервью» — из первой
   *  стадии воронки v2 с action="interview". Нет воронки/стадии → undefined
   *  (диалог сам возьмёт 'zoom'). */
  const defaultInterviewMode = useMemo((): InterviewMeetMode | undefined => {
    const raw = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.funnelV2
    if (!raw || typeof raw !== "object") return undefined
    const stages = (raw as { stages?: unknown }).stages
    if (!Array.isArray(stages)) return undefined
    const interviewStage = (stages as Array<{ action?: string; interviewMode?: string }>)
      .find((s) => s.action === "interview" && typeof s.interviewMode === "string")
    const mode = interviewStage?.interviewMode
    return mode === "phone" || mode === "zoom" || mode === "office" ? mode : undefined
  }, [apiVacancy?.descriptionJson])

  /**
   * #42: ЕДИНЫЙ источник списка стадий вакансии — и для дропдауна «Стадия» в
   * карточке кандидата, и для секции «Статус в воронке» фильтра. Приоритет:
   * воронка v2 (funnelV2.stages) → legacy pipeline → дефолт-пресет.
   * resolveVacancyStageOptions (lib/stages.ts) сам разбирает fallback-цепочку.
   */
  const stageOptions = useMemo(() => {
    const raw = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.funnelV2
    let v2: FunnelV2StageLite[] | null = null
    if (raw && typeof raw === "object") {
      const stages = (raw as { stages?: unknown }).stages
      if (Array.isArray(stages)) {
        v2 = (stages as Array<{ id?: unknown; action?: unknown; title?: unknown }>)
          .filter((s) => typeof s.id === "string" && typeof s.action === "string")
          .map((s) => ({
            id: s.id as string,
            action: s.action as string,
            title: typeof s.title === "string" ? s.title : null,
          }))
      }
    }
    return resolveVacancyStageOptions(v2, vacancyPipeline)
  }, [apiVacancy?.descriptionJson, vacancyPipeline])

  /**
   * #34: актуальные для ЭТОЙ вакансии тумблеры колонок «Вид → Настройки
   * отображения». Считаем по конфигу воронки (funnel_config_json блоки +
   * funnelV2-стадии) и legacy-флагам скоринга. null → показать все тумблеры
   * (вакансия без сигнала о воронке — безопасный дефолт, прежнее поведение).
   */
  const availableColumnKeys = useMemo(
    () =>
      relevantColumnKeys(
        apiVacancy as {
          funnelConfigJson?: { blocks?: Array<{ type?: string; enabled?: boolean }> } | null
          descriptionJson?: unknown
          portraitScoring?: boolean
          aiScoringEnabled?: boolean
          aiChatbotEnabled?: boolean
        } | null,
      ),
    [apiVacancy],
  )

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
  // v2-навигация теперь ДЕФОЛТ: сжатый таб-бар + плоский ряд настроек +
  // переключатель вакансий + контекст по статусу. Старый legacy-вид остаётся
  // фолбэком за ?nav=legacy (на случай отката). ?nav=v2 — синоним дефолта.
  const navV2 = searchParams?.get("nav") !== "legacy"
  const [v2Vacancies, setV2Vacancies] = useState<{ id: string; title: string }[]>([])
  // v2: текущий под-раздел вкладки «Настройки» (второй ряд табов)
  const [v2SettingsSub, setV2SettingsSub] = useState<"anketa" | "content" | "queue" | "outbound" | "settings">("anketa")
  useEffect(() => {
    if (!navV2) return
    fetch("/api/modules/hr/vacancies?limit=200&scope=active")
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const vs = (j?.vacancies ?? j?.data?.vacancies ?? []) as Array<{ id: string; title: string }>
        setV2Vacancies(vs.map(v => ({ id: v.id, title: v.title })))
      })
      .catch(() => {})
  }, [navV2])
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

  // #43 (07.07, Юрий): кликабельные счётчики шапки вакансии — клик по числу
  // фильтрует список кандидатов ПО ТОМУ ЖЕ критерию, по которому счётчик
  // считается. Второй клик по тому же счётчику снимает фильтр (toggle).
  //   - hhTotal: сброс до дефолта (funnelStatuses=[], hideRejected=true)
  //   - hhTotalCurrent/hhTotalPrevious (доделка 07.07, разбивка «508+126=634»):
  //     hhPublication="current"/"previous" — см. критерий в route.ts
  //     (candidates.id IN hh_responses.local_candidate_id по hh_vacancy_id)
  //   - demoOpened: стадии DEMO_OPENED_STAGE_SLUGS (lib/stages.ts — тот же
  //     источник, что и группа demoOpened в lib/vacancy-stats.ts)
  //   - anketa: НЕ стадии, а demoAnswered=true — счётчик «N анкет» в шапке
  //     это stats.demoAnswered = COUNT(demo_answers_score IS NOT NULL)
  //     (lib/vacancy-stats.ts), балл появляется уже при первом ответе, даже
  //     если кандидат остался на стадии demo_opened. Фильтр по стадиям
  //     ANKETA_FILLED_STAGE_SLUGS дал бы ДРУГОЕ множество (guard-major 07.07).
  //   - demo2 (доделка 07.07): secondDemoPassed=true — ≥2 ключей в
  //     demo_block_scores, тот же критерий, что у stats.secondDemoPassed.
  //   - cta (доделка 07.07): ctaClicked=true — demo_progress_json.ctaClicks
  //     непустой, тот же критерий, что у stats.ctaClicked.
  //   - interview: scheduled + interview + interviewed (legacy) — как
  //     interviewCount в loadHeaderStats
  //   - offer: offer_sent + offer (legacy) — как offerCount
  //   - hired (доделка 07.07): hired + started_work — как hiredCount
  //   - rejected: rejected (требует hideRejected=false, иначе excludeRejected
  //     на сервере вычеркнет rejected из результата несмотря на stage-фильтр)
  // «Новых» — НЕ фильтр списка: это неразобранные hh-отклики (кандидатов
  // ещё нет в списке); клик открывает поповер «Настройки разбора» вместо
  // фильтрации (см. hhNewPopoverOpen ниже).
  const HEADER_STAT_STAGE_MAP: Record<string, string[]> = {
    demoOpened: DEMO_OPENED_STAGE_SLUGS,
    interview:  ["scheduled", "interview", "interviewed"],
    offer:      ["offer_sent", "offer"],
    hired:      ["hired", "started_work"],
    rejected:   ["rejected"],
  }
  // Спец-флаги (НЕ стадии воронки) — каждый счётчик активирует ровно один
  // из них, все остальные при этом гасятся (детерминированность, guard 07.07).
  const HEADER_STAT_SPECIAL_FLAG: Record<string, "demoAnswered" | "secondDemoPassed" | "ctaClicked"> = {
    anketa: "demoAnswered",
    demo2:  "secondDemoPassed",
    cta:    "ctaClicked",
  }
  /** Активен ли счётчик key при текущих filters (для подсветки/toggle). */
  const isHeaderStatActive = useCallback((key: string): boolean => {
    if (key === "hhTotal") {
      return (filters.funnelStatuses?.length ?? 0) === 0 && filters.hideRejected === true
        && !filters.demoAnswered && !filters.secondDemoPassed && !filters.ctaClicked && !filters.hhPublication
    }
    if (key === "hhTotalCurrent")  return filters.hhPublication === "current"
    if (key === "hhTotalPrevious") return filters.hhPublication === "previous"
    const specialFlag = HEADER_STAT_SPECIAL_FLAG[key]
    if (specialFlag) return filters[specialFlag] === true
    const target = HEADER_STAT_STAGE_MAP[key]
    if (!target) return false
    const current = filters.funnelStatuses ?? []
    if (current.length !== target.length) return false
    const targetSet = new Set(target)
    return current.every((s) => targetSet.has(s))
  }, [filters.funnelStatuses, filters.hideRejected, filters.demoAnswered, filters.secondDemoPassed, filters.ctaClicked, filters.hhPublication])
  /** Клик по счётчику шапки — применяет/снимает фильтр и сбрасывает пагинацию. */
  const handleHeaderStatClick = useCallback((key: string) => {
    const alreadyActive = isHeaderStatActive(key)
    // Базовый сброс спец-флагов — применяется к КАЖДОМУ клику (детерминированность:
    // ровно один активный фильтр-набор за раз, guard-major 07.07).
    const resetSpecial = {
      demoAnswered: false, secondDemoPassed: false, ctaClicked: false,
      hhPublication: undefined as "current" | "previous" | undefined,
    }
    if (key === "hhTotal" || alreadyActive) {
      // «Откликов всего» — всегда сброс; повторный клик по активному счётчику
      // — тоже сброс (снять фильтр, вернуться к дефолту).
      setFilters((f) => ({ ...f, funnelStatuses: [], hideRejected: true, ...resetSpecial }))
    } else if (key === "hhTotalCurrent" || key === "hhTotalPrevious") {
      setFilters((f) => ({
        ...f, funnelStatuses: [], hideRejected: true, ...resetSpecial,
        hhPublication: key === "hhTotalCurrent" ? "current" : "previous",
      }))
    } else if (HEADER_STAT_SPECIAL_FLAG[key]) {
      // «Анкет»/«демо-2»/«перешли по ссылке» — по критерию счётчика, не по стадиям.
      setFilters((f) => ({
        ...f, funnelStatuses: [], hideRejected: true, ...resetSpecial,
        [HEADER_STAT_SPECIAL_FLAG[key]]: true,
      }))
    } else {
      const target = HEADER_STAT_STAGE_MAP[key]
      if (!target) return
      setFilters((f) => ({
        ...f,
        funnelStatuses: target.slice(),
        ...resetSpecial,
        // «Отказ» должен реально показать отказников — excludeRejected на
        // сервере иначе вычеркнет rejected несмотря на stage-фильтр.
        // Не наследуем hideRejected с прошлого клика (guard-minor 07.07):
        // «отказ» → «интервью» оставлял тумблер «Показать отказы» включённым.
        hideRejected: key === "rejected" ? false : true,
      }))
    }
    if (useListPaginated) paginated.setPage(1)
  }, [isHeaderStatActive, useListPaginated, paginated])

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

  // Стадии воронки: колонки инициализируются из COLUMN_ORDER в emptyColumns()
  // (см. useState выше). Раньше здесь был fetch("/api/funnel-stages") — но этот
  // роут удалён (404 на каждой загрузке вакансии), а ответ всё равно проглатывался
  // catch'ем и колонки не менялись. Мёртвый вызов убран (битая связка, найдена
  // живым обходом сайта 28.06).

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
          // v2: черновик открываем на «Вакансия» (anketa), не на «settings»
          setActiveTab(isActive ? "candidates" : (navV2 ? "anketa" : "settings"))
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
      if (branding.description) setBrandDescription(branding.description)
    }
    // Читаем brandCompanyId из anketa (источник правды — AnketaTab)
    const anketa = desc?.anketa as Record<string, unknown> | undefined
    if (typeof anketa?.brandCompanyId === "string") {
      setVacancyBrandCompanyId(anketa.brandCompanyId)
    }
    // Уровень 3 интеграций: инициализируем форму из integrationsOverride вакансии
    const integrOvr = (apiVacancy as Record<string, unknown> | undefined)?.integrationsOverride as {
      enabled?: boolean
      webhooks?: { url?: string; events?: Record<string, boolean> }
      bitrix?:   { url?: string; trigger?: string }
    } | null | undefined
    if (integrOvr) {
      setIntegrEnabled(integrOvr.enabled === true)
      setIntegrWebhookUrl(integrOvr.webhooks?.url ?? "")
      setIntegrEventNewCandidate(integrOvr.webhooks?.events?.new_candidate === true)
      setIntegrEventAiScreening(integrOvr.webhooks?.events?.ai_screening === true)
      setIntegrBitrixUrl(integrOvr.bitrix?.url ?? "")
      setIntegrBitrixTrigger(integrOvr.bitrix?.trigger ?? "")
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
    // Все режимы доступны админу платформы и директору (см. ViewSettings).
    // Остальным — только «Список»; сохранённый kanban/funnel не гидратируем,
    // иначе застрянут без переключателя режимов.
    // Виды Канбан/Плитки/Воронка — owner-only (Юрий 03.07 оставил под гейтом).
    const canAllViews = isOwnerEmail(user?.email)
    setViewModeLocal((canAllViews ? userPrefs.viewMode : "list") as ViewMode)
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
  const [drawerInitialTab, setDrawerInitialTab] = useState<string | null>(null)
  // Deep-link из глобального виджета «Чаты»: ?candidate=<id> открывает карточку
  // кандидата (drawer сам грузит данные по id — дёшево, без ожидания списка).
  const candidateFromUrl = searchParams?.get("candidate") ?? null
  useEffect(() => {
    if (!candidateFromUrl) return
    setDrawerCandidateId(candidateFromUrl)
    setDrawerOpen(true)
  }, [candidateFromUrl])
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
  // Окно «Рассылка через hh»: полу-ручной мастер прохода по кандидатам.
  const [hhBroadcastOpen, setHhBroadcastOpen] = useState(false)
  const [hhBroadcastIds, setHhBroadcastIds] = useState<string[]>([])
  // Режим «Рассылка через hh»: в списке появляется иконка чата в каждой строке
  // для одиночной полу-ручной рассылки (актуально для архивных hh-вакансий).
  const [hhBroadcastMode, setHhBroadcastMode] = useState(false)
  // Открыть мастер рассылки на ОДНОГО кандидата (клик по иконке в строке).
  const openHhBroadcastForCandidate = useCallback((candidateId: string) => {
    setHhBroadcastIds([candidateId])
    setHhBroadcastOpen(true)
  }, [])

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
        description_json: { anketa: { ...existingAnketa, vacancyTitle: trimmed } },
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
  // Сохранение per-vacancy override интеграций (уровень 3)
  const saveIntegrations = async () => {
    setIntegrSaving(true)
    try {
      const body = {
        integrations_override: {
          enabled: integrEnabled,
          webhooks: {
            url: integrWebhookUrl.trim() || undefined,
            events: {
              new_candidate: integrEventNewCandidate,
              ai_screening: integrEventAiScreening,
            },
          },
          bitrix: {
            url: integrBitrixUrl.trim() || undefined,
            trigger: integrBitrixTrigger.trim() || undefined,
          },
        },
      }
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || "Не удалось сохранить")
      }
      await refetchVacancy()
      toast.success("Интеграции сохранены")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIntegrSaving(false)
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
  // Зона 3: per-vacancy override описания компании (descriptionJson.branding.description).
  const [brandDescription, setBrandDescription] = useState("")
  const [editingSlug, setEditingSlug] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  // Уровень 3 интеграций: per-vacancy override
  const [integrEnabled, setIntegrEnabled] = useState(false)
  const [integrWebhookUrl, setIntegrWebhookUrl] = useState("")
  const [integrEventNewCandidate, setIntegrEventNewCandidate] = useState(false)
  const [integrEventAiScreening, setIntegrEventAiScreening] = useState(false)
  const [integrBitrixUrl, setIntegrBitrixUrl] = useState("")
  const [integrBitrixTrigger, setIntegrBitrixTrigger] = useState("")
  const [integrSaving, setIntegrSaving] = useState(false)
  // Company-level webhook URL для отображения в режиме наследования
  const [companyWebhookUrl, setCompanyWebhookUrl] = useState("")
  // Данные основной компании (для дефолтов брендинга)
  const [mainCompanyData, setMainCompanyData] = useState<{
    brandName: string; logoUrl: string; brandSlogan: string; website: string; subdomain: string; description: string
  }>({ brandName: "", logoUrl: "", brandSlogan: "", website: "", subdomain: "", description: "" })
  const [brandCompaniesData, setBrandCompaniesData] = useState<Array<{
    id: string; name: string; slogan?: string; logo?: string; website?: string; description?: string
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
  const SETTINGS_SECTION_IDS = ["page", "sources", "communications", "funnel", "funnel-builder", "funnel-v2", "funnel-v3", "spec", "aichatbot", "ai", "integrations"] as const
  type SettingsSectionId = typeof SETTINGS_SECTION_IDS[number]
  // Скрытые legacy-секции: при прямой ссылке (?section=funnel|aichatbot)
  // перенаправляем на funnel-builder.
  const LEGACY_SECTIONS_REDIRECT_TO_FUNNEL_BUILDER = ["funnel", "aichatbot"] as const
  // «Сообщения» и «Дожим» объединены в один таб «Коммуникации» (08.07,
  // консолидация) — старые deep-link'и (?section=messages / ?section=followup)
  // ведут туда же, ничего не теряя.
  const LEGACY_SECTIONS_REDIRECT_TO_COMMUNICATIONS = ["messages", "followup"] as const
  const initialSettingsSection: SettingsSectionId =
    rawUrlSection === "general" ? "page" :
    rawUrlSection === "automation" ? "ai" :
    rawUrlSection && (LEGACY_SECTIONS_REDIRECT_TO_COMMUNICATIONS as readonly string[]).includes(rawUrlSection) ? "communications" :
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

  // Deep-link ?section=funnel-v3 у не-владельца: секция скрыта из навигации,
  // но прямая ссылка дала бы пустую панель. Как для скрытых legacy-секций —
  // редиректим на дефолтную. Ждём загрузки user (email известен), чтобы не
  // выкинуть владельца при первом рендере без сессии.
  useEffect(() => {
    if (settingsSection === "funnel-v3" && user?.email && !funnelV3Visible) {
      setSettingsSection("page")
    }
  }, [settingsSection, user?.email, funnelV3Visible])

  // #20 — единый канонический порядок табов вакансии для нижней панели действий.
  // Совпадает с плоским рядом под-табов v2 (settingsSubTabs ниже). Каждый шаг —
  // это либо верхний таб (kind:"tab"), либо секция настроек (kind:"section").
  // Из этого ряда нижняя панель (VacancyTabFooter) вычисляет «Далее»/«Назад».
  type VacancyStep = { kind: "tab" | "section"; value: string; section: SettingsSectionId | null; label: string }
  const vacancySteps = useMemo<VacancyStep[]>(() => {
    const all: VacancyStep[] = [
      { kind: "tab",     value: "anketa",   section: null,             label: "Вакансия" },
      { kind: "section", value: "settings", section: "spec",           label: "Портрет" },
      { kind: "tab",     value: "content",  section: null,             label: "Контент" },
      { kind: "section", value: "settings", section: "funnel-builder", label: "Воронка" },
      { kind: "section", value: "settings", section: "communications", label: "Коммуникации" },
      { kind: "section", value: "settings", section: "funnel-v2",      label: "Воронка v2" },
      { kind: "section", value: "settings", section: "funnel-v3",      label: "Воронка 3" },
      { kind: "section", value: "settings", section: "sources",        label: "Источники" },
      { kind: "section", value: "settings", section: "ai",             label: "Расписание" },
      { kind: "section", value: "settings", section: "integrations",   label: "Интеграции" },
      { kind: "section", value: "settings", section: "page",           label: "Брендинг" },
      { kind: "tab",     value: "outbound", section: null,             label: "Исходящий подбор" },
      { kind: "tab",     value: "queue",    section: null,             label: "Очередь" },
    ]
    // «Воронка» (старый funnel-builder) видна только платформенному администратору.
    // «Воронка 3» — только владельцу-полигону (owner-only, как API funnel-v2).
    return all
      .filter(s => isPlatformAdmin || s.section !== "funnel-builder")
      .filter(s => funnelV3Visible || s.section !== "funnel-v3")
  }, [isPlatformAdmin, funnelV3Visible])

  // #44 (03.07, финал №2): карты ширин футера по табам удалены — нижняя
  // панель (VacancyTabFooter) везде фиксированной ширины max-w-6xl, кнопки
  // на одной позиции на всех табах (решение Юрия). Ширину КОНТЕНТА табов
  // по-прежнему задают SettingsTabShell-обёртки на местах рендера.

  // Переход к шагу канонического ряда (используется «Далее»/«Назад» нижней панели).
  const goToVacancyStep = useCallback((step: VacancyStep) => {
    if (step.kind === "section") {
      setActiveTab("settings")
      setSettingsSection(step.section as SettingsSectionId)
      const sp = new URLSearchParams(window.location.search)
      sp.set("tab", "settings")
      sp.set("section", step.section as string)
      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
    } else {
      setV2SettingsSub(step.value as typeof v2SettingsSub)
      setActiveTab(step.value)
      const sp = new URLSearchParams(window.location.search)
      sp.set("tab", step.value)
      sp.delete("section")
      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

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

  // Диалог подтверждения «Пригласить на интервью» (advance → interview,
  // Юрий 03.07). Пропускается, если localStorage skipInterviewInviteConfirm=1.
  const [interviewConfirmOpen, setInterviewConfirmOpen] = useState(false)
  const [interviewConfirmCandidateId, setInterviewConfirmCandidateId] = useState<string | null>(null)
  const [interviewConfirmCandidateName, setInterviewConfirmCandidateName] = useState<string>("")
  // Колбэк реального перемещения карточки — заполняется в момент открытия
  // диалога тем же кодом, что раньше выполнял advance молча.
  const interviewConfirmApplyRef = useRef<((opts: { messageOverride: string; interviewMode: InterviewMeetMode }) => Promise<void>) | null>(null)

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
  // Flush несохранённого контента (ContentBlocksTab.registerFlush) — вызывается
  // кнопкой «Далее» единого нижнего ряда перед переходом (Юрий 03.07).
  const contentFlushRef = useRef<(() => void) | null>(null)
  const registerContentFlush = useCallback((fn: () => void) => { contentFlushRef.current = fn }, [])
  const registerAnketaHandle = useCallback((h: AnketaTabHandle) => setAnketaHandle(h), [])
  // «Сохранить анкету в библиотеку» из дропдауна «Действия» доступно с любой вкладки:
  // если AnketaTab ещё не смонтирован (другая вкладка) — переключаемся на «anketa»
  // и открываем диалог, как только handle зарегистрируется.
  const [pendingLibSave, setPendingLibSave] = useState(false)
  useEffect(() => {
    if (pendingLibSave && anketaHandle) {
      anketaHandle.saveToLibrary()
      setPendingLibSave(false)
    }
  }, [pendingLibSave, anketaHandle])

  // HH.ru integration state
  const [hhConnected, setHhConnected] = useState<boolean | null>(null)
  // #43 (доделка 07.07): клик по «N новых» в шапке открывает поповер «Настройки
  // разбора hh-откликов» (HhAutoProcess) — «новых» не фильтр списка (это
  // неразобранные hh-отклики, кандидатов ещё нет), честное действие — разбор.
  const [hhNewPopoverOpen, setHhNewPopoverOpen] = useState(false)
  // Под каким hh-аккаунтом (employer) подключена компания — чтобы было честно видно
  // ЧЕЙ это аккаунт (а не просто «Подключено»). Критично для партнёров/клиентов.
  const [hhEmployerName, setHhEmployerName] = useState<string | null>(null)
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
    // Разбивка hhTotal по публикациям hh (Юрий 07.07): текущая/прошлые.
    // hhTotal = hhTotalCurrent + hhTotalPrevious. Окно откликов прошлых
    // публикаций (по датам откликов) — для бейджа «N дн.».
    hhTotal: number; hhTotalCurrent: number; hhTotalPrevious: number;
    hhPrevWindowFrom: string | null; hhPrevWindowTo: string | null;
    hhNew: number; inProgress: number;
    anketaFilled: number; demoAnswered: number; hired: number;
    // #15: интервью (scheduled + interview + legacy interviewed) и оферы
    // (offer_sent + legacy offer) — считаются из byStage стадий кандидатов.
    interview: number; offer: number;
    ctaClicked: number;
    // «2-я часть демо» (Путь менеджера): приглашены / прошли (балл 2-го блока).
    secondDemoInvited: number; secondDemoPassed: number;
    aiTokensIn: number; aiTokensOut: number;
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
        total: number; hhTotal: number; hhTotalCurrent?: number; hhTotalPrevious?: number;
        hhPrevWindowFrom?: string | null; hhPrevWindowTo?: string | null; hhNew: number;
        inProgress: number; rejected: number; hired: number;
        demoOpened: number; anketaFilled: number; demoAnswered: number;
        ctaClicked: number;
        secondDemoInvited?: number; secondDemoPassed?: number;
        byStage?: Record<string, number>;
        aiTokensIn: number; aiTokensOut: number;
      }
      const cand = candRes.ok
        ? await candRes.json() as { pending: number; freshCount: number }
        : { pending: 0, freshCount: 0 }
      // #15: интервью и оферы из byStage. scheduled = «Интервью назначено»,
      // interview = «Интервью прошло»; legacy-slug interviewed/offer — вторая
      // система статусов (B9), учитываем чтобы не терять исторические числа.
      const bs = stats.byStage ?? {}
      const interviewCount = (bs["scheduled"] ?? 0) + (bs["interview"] ?? 0) + (bs["interviewed"] ?? 0)
      const offerCount = (bs["offer_sent"] ?? 0) + (bs["offer"] ?? 0)
      setHeaderStats({
        total:        stats.total,
        pending:      cand.pending,
        freshCount:   cand.freshCount,
        demoOpened:   stats.demoOpened,
        rejected:     stats.rejected,
        hhTotal:      stats.hhTotal,
        // Fallback на «всё текущее» для старого API-ответа без разбивки.
        hhTotalCurrent:  stats.hhTotalCurrent ?? stats.hhTotal,
        hhTotalPrevious: stats.hhTotalPrevious ?? 0,
        hhPrevWindowFrom: stats.hhPrevWindowFrom ?? null,
        hhPrevWindowTo:   stats.hhPrevWindowTo ?? null,
        hhNew:        stats.hhNew,
        inProgress:   stats.inProgress,
        anketaFilled: stats.anketaFilled,
        demoAnswered: stats.demoAnswered,
        interview:    interviewCount,
        offer:        offerCount,
        ctaClicked:   stats.ctaClicked ?? 0,
        secondDemoInvited: stats.secondDemoInvited ?? 0,
        secondDemoPassed:  stats.secondDemoPassed ?? 0,
        hired:        stats.hired,
        aiTokensIn:   stats.aiTokensIn  ?? 0,
        aiTokensOut:  stats.aiTokensOut ?? 0,
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

  // #16: синк БЕЗ разбора — для кнопки «Синхронизировать» в поповере «Настройки
  // разбора». Сам разбор после синка запускает HhAutoProcess по своим настройкам
  // (скорость/лимит/ручной-авто), т.е. «по сценарию», а не зашитыми 50/2с.
  const syncHhResponses = async () => {
    setHhSyncing(true)
    try {
      await Promise.all([
        fetch("/api/integrations/hh/vacancies"),
        fetch("/api/integrations/hh/responses"),
      ])
      await Promise.all([loadHhSyncMeta(), loadHeaderStats()])
      refetchCandidates(); refetchVacancy()
      toast.success("Синхронизировано с hh.ru")
    } catch (e) {
      toast.error("Ошибка синхронизации")
      throw e
    } finally {
      setHhSyncing(false)
    }
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

  // hh-статус-бейдж в шапке: связь с hh + архив + недавние падения отправки.
  // Лёгкий БД-роут (не дёргает hh API). level: none|ok|warn|error.
  const [hhStatus, setHhStatus] = useState<{
    linked: boolean; archived: boolean
    sendFailedRecent: number; invalidVacancyRecent: number
    level: "ok" | "warn" | "error" | "none"; message: string
  } | null>(null)
  const loadHhStatus = useCallback(async () => {
    if (!apiVacancy?.hhVacancyId) { setHhStatus(null); return }
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}/hh-status`)
      if (!res.ok) { setHhStatus(null); return }
      const data = await res.json() as {
        linked: boolean; archived: boolean
        sendFailedRecent: number; invalidVacancyRecent: number
        level: "ok" | "warn" | "error" | "none"; message: string
      }
      setHhStatus(data)
    } catch { setHhStatus(null) }
  }, [apiVacancy?.hhVacancyId, id])

  useEffect(() => {
    if (!apiVacancy?.hhVacancyId) { setHhStatus(null); return }
    loadHhStatus()
  }, [apiVacancy?.hhVacancyId, loadHhStatus])

  // «Индекс вежливости» — свой расчёт (hh.ru официальный API его не отдаёт,
  // см. комментарий в API-роуте). Доля откликов с ответом + медианное время
  // ответа, по вакансии и по компании. Кэш на сервере 1 час — грузим один раз.
  const [politenessIndex, setPolitenessIndex] = useState<{
    vacancy: { totalCandidates: number; respondedCandidates: number; responseRate: number; medianResponseHours: number | null }
    company: { totalCandidates: number; respondedCandidates: number; responseRate: number; medianResponseHours: number | null }
  } | null>(null)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${id}/politeness-index`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) setPolitenessIndex(data) })
      .catch(() => { if (!cancelled) setPolitenessIndex(null) })
    return () => { cancelled = true }
  }, [id])

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

  // M3: тумблер канала Авито на уровне ЭТОЙ вакансии (channel_sources).
  const [avitoToggleBusy, setAvitoToggleBusy] = useState(false)
  const toggleVacancyAvito = async (on: boolean) => {
    setAvitoToggleBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_sources: on ? ["hh", "avito"] : ["hh"] }),
      })
      if (!res.ok) throw new Error()
      await refetchVacancy()
      toast.success(on ? "Авито включён для этой вакансии" : "Авито отключён для этой вакансии")
    } catch {
      toast.error("Не удалось переключить Авито")
    } finally {
      setAvitoToggleBusy(false)
    }
  }

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

  // Вернулись с подключения hh ИЗ этой вакансии (callback дал ?hhConnected=1):
  // сразу открываем «Привязать», чтобы для пользователя это был один поток —
  // подключил аккаунт → тут же выбрал вакансию, без поиска второй кнопки.
  useEffect(() => {
    if (searchParams?.get("hhConnected") !== "1") return
    setHhImportBind(true)
    setHhImportDialogOpen(true)
    const sp = new URLSearchParams(searchParams?.toString() ?? "")
    sp.delete("hhConnected")
    router.replace(`/hr/vacancies/${id}${sp.toString() ? `?${sp.toString()}` : ""}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Fetch hh.ru connection status
    fetch("/api/integrations/hh/status")
      .then((r) => r.json())
      .then((data) => { setHhConnected(data.connected); setHhEmployerName(data.employerName ?? null) })
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
  // Запуск из черновика: статус → active. Появляются «Кандидаты» + разбор откликов.
  const handleLaunchVacancy  = () => { updateVacancyStatus("active");                 toast.success("Вакансия запущена") }
  const handlePauseVacancy   = () => { updateVacancyStatus(VACANCY_STATUS_ON_PAUSE);   toast.warning("Вакансия приостановлена") }
  const handleResumeVacancy  = () => { updateVacancyStatus(VACANCY_STATUS_ON_RESUME);  toast.success("Вакансия возобновлена") }
  // Закрытие вакансии — открывает диалог подтверждения с опцией «отказать
  // оставшимся» (guard-находка 05.07, чекбокс по умолчанию выключен).
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeRejectRemaining, setCloseRejectRemaining] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)
  const handleCloseVacancy = () => { setCloseRejectRemaining(false); setCloseDialogOpen(true) }
  const handleCloseVacancyConfirm = async () => {
    setCloseBusy(true)
    try {
      await updateVacancyStatus(VACANCY_STATUS_ON_CLOSE)
      toast("Вакансия закрыта и отправлена в архив")
      if (closeRejectRemaining) {
        try {
          const res = await fetch(`/api/modules/hr/vacancies/${id}/reject-remaining`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "vacancy_closed_reject_remaining" }),
          })
          if (res.ok) {
            const data = await res.json().catch(() => ({})) as { scheduled?: number }
            const n = data.scheduled ?? 0
            toast.success(n > 0
              ? `Запланирован отказ оставшимся кандидатам: ${n}`
              : "Активных кандидатов для отказа не найдено")
          } else {
            toast.error("Вакансия закрыта, но не удалось запланировать отказ оставшимся кандидатам")
          }
        } catch {
          toast.error("Вакансия закрыта, но не удалось запланировать отказ оставшимся кандидатам")
        }
      }
    } finally {
      setCloseBusy(false)
      setCloseDialogOpen(false)
    }
  }

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

  const saveBranding = async (updates?: { companyName?: string; color?: string; slogan?: string; logo?: string; website?: string; description?: string }) => {
    setBrandSaving(true)
    const branding = {
      companyName: updates?.companyName ?? brandCompanyName,
      color: updates?.color ?? brandColor,
      slogan: updates?.slogan ?? brandSlogan,
      logo: updates?.logo ?? brandLogo,
      website: updates?.website ?? brandWebsite,
      // Зона 3: описание компании — per-vacancy override публичного блока «О компании».
      description: updates?.description ?? brandDescription,
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
        body: JSON.stringify({ description_json: { customColumns } }),
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
        body: JSON.stringify({ description_json: { hiddenColumns } }),
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
      const apply = async (target: string, msg: string, opts?: { messageOverride?: string; interviewMode?: InterviewMeetMode }) => {
        const ok = await paginated.updateStage(candidateId, target, opts)
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
          // Нет следующего этапа (терминальная/неизвестная стадия) — НЕ нанимаем
          // молча (инцидент 03.07: галочка «нанимала» со «2-й части»).
          if (!nextId) { toast.info(`${cand.name}: следующий этап не определён — выберите стадию вручную`); return }
          if (nextId === "interview" && !shouldSkipInterviewInviteConfirm()) {
            interviewConfirmApplyRef.current = async (o) => {
              await apply("interview", `${cand.name} → следующий этап`, o)
            }
            setInterviewConfirmCandidateId(candidateId)
            setInterviewConfirmCandidateName(cand.name)
            setInterviewConfirmOpen(true)
            return
          }
          return apply(nextId, `${cand.name} → следующий этап`)
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
        // Терминальная/неизвестная колонка — не нанимаем молча (инцидент 03.07).
        toast.info(`${candidate.name}: следующий этап не определён — перетащите карточку вручную`)
        return
      }
      // Юрий 03.07: переход в interview НЕ молчаливый — открываем окно
      // подтверждения (вид встречи + текст приглашения), если HR не отключил
      // его чекбоксом «Больше не показывать» (localStorage).
      if (nextId === "interview" && !shouldSkipInterviewInviteConfirm()) {
        interviewConfirmApplyRef.current = async (opts) => {
          const moved2 = { ...candidate, progress: PROGRESS_BY_COLUMN[nextId] ?? candidate.progress }
          setColumns((p) => p.map((c) => {
            if (c.id === columnId) { const nc = c.candidates.filter((x) => x.id !== candidateId); return { ...c, candidates: nc, count: nc.length } }
            if (c.id === nextId) { const nc = [...c.candidates, moved2]; return { ...c, candidates: nc, count: nc.length } }
            return c
          }))
          toast.success(`${candidate.name} → следующий этап`)
          await updateStage(candidateId, nextId, opts)
        }
        setInterviewConfirmCandidateId(candidateId)
        setInterviewConfirmCandidateName(candidate.name)
        setInterviewConfirmOpen(true)
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
      if (action === "hh_broadcast") {
        setHhBroadcastIds(ids)
        setHhBroadcastOpen(true)
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
    // Колонка «Анкета» (demo_answers_score) — до 11.07 ключа не было в мапе,
    // клик сортировал только загруженные 20 строк на клиенте.
    answersScore: "answersScore",
    testScore: "testScore",
    salary: "salary",
    responseDate: "createdAt",
    status: "stage",
    progress: "progress",
    city: "city",
    source: "source",
    favorite: "favorite",
    nextInterview: "nextInterview",
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
    { stage: "Передан", count: (finalDecisionCol?.candidates.length || 0) + (hiredCol?.candidates.length || 0), color: "#f97316" },
    { stage: "Нанято", count: hiredCol?.candidates.length || 0, color: "#22c55e" },
  ]

  const funnelData = funnelStages

  // ── AI Screening ──
  const [screeningIds, setScreeningIds] = useState<Set<string>>(new Set())
  const [bulkScreening, setBulkScreening] = useState(false)
  const [rescoring, setRescoring] = useState<string | null>(null)   // активный параметр переоценки

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

  // Переоценить выделенных кандидатов по параметру (или всем сразу). Реальные
  // AI-вызовы → только по выделенным (selectedCandidateIds).
  // Пользовательская сущность оценки — ОДНА, «Портрет» (dimension=resume); dimension=portrait —
  // это осевой скоринг v2 (справочный балл внутри карточки), подписан отдельно, не «AI-Портрет».
  const RESCORE_LABELS: Record<string, string> = {
    resume: "Портрет", test: "AI-тест", portrait: "Осевой балл (справочно)", all: "все параметры",
  }
  const rescoreSelected = async (dimension: "resume" | "test" | "portrait" | "all") => {
    if (rescoring) return
    const ids = Array.from(selectedCandidateIds)
    if (ids.length === 0) { toast.info("Выделите кандидатов галочками — переоценка идёт по выделенным"); return }
    setRescoring(dimension)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}/rescore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: ids, dimension }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { toast.error(j?.error || "Не удалось переоценить"); return }
      const r = (j?.data ?? j) as { resume: number; portrait: number; test: number; skipped: number; errors: number }
      const parts: string[] = []
      if (r.resume) parts.push(`резюме ${r.resume}`)
      if (r.portrait) parts.push(`портрет ${r.portrait}`)
      if (r.test) parts.push(`тест ${r.test}`)
      toast.success(
        `Переоценка (${RESCORE_LABELS[dimension]}): ${parts.join(", ") || "0"}` +
        (r.skipped ? ` · пропущено ${r.skipped}` : "") +
        (r.errors ? ` · ошибок ${r.errors}` : ""),
      )
      await (useListPaginated ? paginated.refetch() : refetchCandidates())
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setRescoring(null)
    }
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

  // ТЗ №3: диалог применения шаблона роли + ручное обновление готовности.
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const refreshHealth = () => {
    fetch("/api/ai/vacancy-health-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vacancyId: id }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { score: number; issues: typeof healthIssues; nextStep: string } | null) => {
        if (data) { setHealthScore(data.score); setHealthIssues(data.issues); setHealthNextStep(data.nextStep) }
      })
      .catch(() => {})
  }

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
      await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        // Точечный payload — сервер root-мёржит (см. mergeDescriptionJson).
        body: JSON.stringify({ description_json: { pipeline: { preset, stages: [] } } }),
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
    const scoreOf = (c: typeof apiCandidates[number]) => c.aiScoreV2 ?? c.resumeScore ?? null
    const top = apiCandidates
      .filter(c => scoreOf(c) != null)
      .sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0))
      .slice(0, 5)
    if (top.length < 2) { toast.error("Нужно минимум 2 кандидата с AI-скором"); return }
    setCompareOpen(true)
    setCompareLoading(true)
    try {
      const res = await fetch("/api/ai/compare-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: top.map(c => ({ id: c.id, name: c.name, skills: c.skills, experience: c.experience, aiScore: scoreOf(c) })),
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
      // Условия: текст из hh-импорта (прозой) + галочки-теги — иначе импортированные условия в оффер не попадут.
      const conditionsText = String(anketa.conditionsText || "")
      const conditionsTags = Array.isArray(anketa.conditions) ? (anketa.conditions as string[]).join(", ") : ""
      const conditions = [conditionsText, conditionsTags].filter(Boolean).join("\n")
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
            {/* ═══ ШАПКА ═══════════════════════════════════ */}
            {/* Legacy breadcrumb — только в !navV2 */}
            {!navV2 && (
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" className="gap-1 text-sm text-muted-foreground -ml-2" onClick={() => router.push("/hr/vacancies")}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Все вакансии
                </Button>
              </div>
            )}
            <div ref={mainHeaderRef} className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {/* v2: стрелка «Назад» — только если известен источник перехода */}
                  {navV2 && (searchParams?.get("from") || (typeof document !== "undefined" && document.referrer && new URL(document.referrer).hostname === window.location.hostname && !document.referrer.includes(`/hr/vacancies/${id}`))) && (
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground -ml-1"
                          onClick={() => {
                            const from = searchParams?.get("from")
                            if (from) router.push(from)
                            else router.back()
                          }}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>К списку вакансий</TooltipContent>
                    </UITooltip>
                  )}
                  {isEditingName ? (
                    <input
                      autoFocus
                      disabled={savingName}
                      className="flex-1 min-w-0 w-full text-xl sm:text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0.5"
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
                  {/* v2: переключатель вакансий — прыгать между активными, не возвращаясь */}
                  {navV2 && v2Vacancies.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground px-1.5">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                        {v2Vacancies.map(v => (
                          <DropdownMenuItem
                            key={v.id}
                            className={cn("cursor-pointer gap-1.5", v.id === id && "bg-accent font-semibold")}
                            onClick={() => { if (v.id !== id) router.push(`/hr/vacancies/${v.id}?nav=v2&tab=${tabFromUrl}`) }}
                          >
                            {v.id === id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            <span className={cn(v.id === id && "underline underline-offset-2")}>{v.title}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <VacancyStatusBadge status={status} />
                  {/* Внутренний код вакансии (short_code) убран из шапки карточки
                      08.07 (Юрий: лишний, мешает) — остался только в списке
                      вакансий (page.tsx списка), тоже admin-only. */}
                  {/* hh-статус-бейдж: 🟢 hh ✓ / 🟠 ⚠ / 🔴 ⚠. Показываем только
                      если hh привязан (level !== 'none'). Данные — лёгкий БД-роут
                      hh-status (архив + недавние failed-отправки), не hh API. */}
                  {hhStatus && hhStatus.level !== "none" && (() => {
                    const cls =
                      hhStatus.level === "error"
                        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                        : hhStatus.level === "warn"
                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                        : "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                    const Icon = hhStatus.level === "ok" ? CheckCircle2 : AlertTriangle
                    return (
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium cursor-help", cls)}>
                            <Icon className="size-3.5" />
                            {hhStatus.level === "ok" ? "hh ✓" : "hh"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{hhStatus.message}</TooltipContent>
                      </UITooltip>
                    )
                  })()}
                  {/* «X дн.» — сколько вакансия висит на hh: считаем от даты
                      публикации (vacancies.hh_published_at, заполняет крон
                      hh-vacancy-sync). Fallback на created_at, если hh-даты ещё
                      нет (вакансия без hh-привязки или синк не прошёл).
                      Перепубликация (Юрий 07.07): hh_published_at знает только
                      ТЕКУЩУЮ публикацию. Если были прошлые (hhTotalPrevious>0),
                      добавляем их длительность по окну откликов прошлых
                      публикаций (дат публикации hh не отдаёт — оценка «по датам
                      откликов», поэтому с тильдой «≈»). Иначе — как раньше. */}
                  {(() => {
                    if (status !== "active") return null
                    const hhPublishedAt = apiVacancy?.hhPublishedAt
                    const since = hhPublishedAt ?? apiVacancy?.createdAt
                    if (!since) return null
                    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
                    const prevFrom = headerStats?.hhPrevWindowFrom
                    const prevTo   = headerStats?.hhPrevWindowTo
                    if ((headerStats?.hhTotalPrevious ?? 0) > 0 && prevFrom && prevTo) {
                      const fmt = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
                      // Окно включительно: 28.06–02.07 = 5 дн., минимум 1 день.
                      const prevDays = Math.max(1, Math.floor((new Date(prevTo).getTime() - new Date(prevFrom).getTime()) / 86400000) + 1)
                      const totalDays = prevDays + days
                      const title = `Прошлые публикации: ≈${prevDays} дн. (${fmt(prevFrom)}–${fmt(prevTo)}, по датам откликов) · Текущая: ${days} дн.${hhPublishedAt ? ` (опубликована ${fmt(hhPublishedAt)})` : ""} · Суммарно на hh: ≈${totalDays} дн.`
                      return (
                        <span title={title} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />≈{totalDays} дн.
                        </span>
                      )
                    }
                    const title = hhPublishedAt
                      ? `Опубликована на hh: ${new Date(hhPublishedAt).toLocaleDateString("ru-RU")}`
                      : undefined
                    return (
                      <span title={title} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />{days} дн.
                      </span>
                    )
                  })()}
                  {/* «Индекс вежливости» — свой показатель (hh.ru официальный
                      API его не отдаёт, см. app/api/.../politeness-index/route.ts).
                      Доля откликов с ответом. По вакансии — если есть кандидаты;
                      по компании — если он заметно отличается (иначе не дублируем). */}
                  {politenessIndex && politenessIndex.vacancy.totalCandidates > 0 && (() => {
                    const v = politenessIndex.vacancy
                    const c = politenessIndex.company
                    const colorClass = (rate: number) =>
                      rate >= 80
                        ? "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                        : rate >= 50
                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                        : "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                    const fmtHours = (h: number | null) => {
                      if (h == null) return "—"
                      if (h < 24) return `${Math.round(h)} ч`
                      return `${Math.round(h / 24)} дн.`
                    }
                    const showCompany = c.totalCandidates > 0 && Math.abs(c.responseRate - v.responseRate) >= 1
                    return (
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium cursor-help", colorClass(v.responseRate))}>
                            <MessageCircle className="size-3.5" />
                            Вежливость {v.responseRate}%
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-medium mb-1">Индекс вежливости — по данным нашей системы оценки</p>
                          <p className="mb-1">
                            Доля откликов по вакансии, на которые был дан ответ
                            (сообщение, приглашение, отказ — любое действие):{" "}
                            <b>{v.respondedCandidates} из {v.totalCandidates}</b> = {v.responseRate}%.
                          </p>
                          <p className="mb-1">Медианное время первого ответа: <b>{fmtHours(v.medianResponseHours)}</b>.</p>
                          {showCompany && (
                            <p className="text-muted-foreground">
                              По компании (активные вакансии): {c.responseRate}%, {fmtHours(c.medianResponseHours)}.
                            </p>
                          )}
                          <p className="text-muted-foreground mt-1">
                            Считается по данным нашей системы оценки (hh.ru не отдаёт свой показатель через API).
                          </p>
                        </TooltipContent>
                      </UITooltip>
                    )
                  })()}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  {activeTab === "candidates" && <>
                    {/* #15: счётчики шапки. Порядок: откликов → новых → демо →
                        анкет → интервью → оферы → нанято → отказ.
                        HIDE-AT-ZERO: всегда показываем «откликов всего»,
                        «новых», «открыли демо» (даже 0); анкет/интервью/оферы/
                        нанято/отказ — только если >0.
                        Разделитель «·» рендерит каждый видимый элемент ПЕРЕД
                        собой, кроме первого (isFirst), чтобы не было висячих
                        точек при скрытых метриках. */}
                    {(() => {
                      const s = headerStats
                      // hh-блок (откликов/новых) — только для hh-привязанных вакансий.
                      const showHh = s?.hhTotal !== undefined
                      const nodes: ReactNode[] = []
                      const push = (key: string, node: ReactNode) => {
                        if (nodes.length > 0) nodes.push(<span key={`sep-${key}`} aria-hidden="true">·</span>)
                        nodes.push(<span key={key} className="inline-flex items-center">{node}</span>)
                      }
                      // #43: кликабельный счётчик — hover-подчёркивание + cursor-pointer,
                      // активный (совпадает с текущим filters) — подсвечен (font-medium
                      // уже на числе; добавляем подчёркивание всей надписи + цвет).
                      // countPrefix — необязательная приставка ПЕРЕД жирным числом
                      // (разбивка «508 + 125 = » у «откликов всего», Юрий 07.07).
                      const clickableLabel = (key: string, count: number, label: string, countPrefix?: string) => {
                        const active = isHeaderStatActive(key)
                        return (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => handleHeaderStatClick(key)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleHeaderStatClick(key) } }}
                            className={`cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid ${active ? "text-foreground font-medium" : ""}`}
                          >
                            {countPrefix}<span className="font-medium text-foreground">{count}</span>{label ? ` ${label}` : ""}
                          </span>
                        )
                      }
                      // Всегда (для hh-вакансий): откликов всего, новых.
                      // Если были прошлые публикации на hh (перепубликация) —
                      // показываем разбивку «прошлые + текущая = итог» с ТРЕМЯ
                      // отдельными клик-зонами (доделка 07.07, Юрий): «508»
                      // (прошлые) и «126» (текущая) фильтруют по hhPublication,
                      // «= 634 откликов» (итог) — как раньше, сброс фильтров.
                      // Одна публикация — просто «N откликов всего», без разбивки.
                      if (showHh) {
                        const hhPrev = s!.hhTotalPrevious ?? 0
                        push("hhTotal",
                          hhPrev > 0
                            ? <span className="inline-flex items-center gap-1">
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    {clickableLabel("hhTotalPrevious", hhPrev, "")}
                                  </TooltipTrigger>
                                  <TooltipContent>Кандидаты с прошлых публикаций на hh — нажмите, чтобы отфильтровать</TooltipContent>
                                </UITooltip>
                                <span aria-hidden="true">+</span>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    {clickableLabel("hhTotalCurrent", s!.hhTotalCurrent, "")}
                                  </TooltipTrigger>
                                  <TooltipContent>Кандидаты с текущей публикации на hh — нажмите, чтобы отфильтровать</TooltipContent>
                                </UITooltip>
                                <span aria-hidden="true">=</span>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    {clickableLabel("hhTotal", s!.hhTotal, "откликов")}
                                  </TooltipTrigger>
                                  <TooltipContent>Всего: {s!.hhTotal} — нажмите, чтобы сбросить фильтр</TooltipContent>
                                </UITooltip>
                              </span>
                            : <UITooltip>
                                <TooltipTrigger asChild>
                                  {clickableLabel("hhTotal", s!.hhTotal, "откликов всего")}
                                </TooltipTrigger>
                                <TooltipContent>Всего откликов с hh.ru по всем публикациям вакансии (перепубликация на hh счётчик не обнуляет) — нажмите, чтобы сбросить фильтр</TooltipContent>
                              </UITooltip>)
                        push("hhNew",
                          <UITooltip>
                            <TooltipTrigger asChild>
                              {s!.hhNew > 0 ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setHhNewPopoverOpen(true)}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHhNewPopoverOpen(true) } }}
                                  className="cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                >
                                  <span className="font-medium text-foreground">{s!.hhNew}</span> новых
                                </span>
                              ) : (
                                <span><span className="font-medium text-foreground">{s!.hhNew}</span> новых</span>
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {s!.hhNew > 0
                                ? "Неразобранные отклики с hh — нажмите, чтобы открыть разбор"
                                : "Новые отклики, ещё не разобраны"}
                            </TooltipContent>
                          </UITooltip>)
                      }
                      // Всегда: открыли демо.
                      push("demoOpened",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("demoOpened", s?.demoOpened ?? 0, "демо")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты, открывшие демо и прошедшие дальше — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      // Только >0: анкет (demoAnswered).
                      if ((s?.demoAnswered ?? 0) > 0) push("anketa",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("anketa", s!.demoAnswered, "анкет")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты, ответившие на вопросы анкеты — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      // Только >0: «2-я часть» демо (Путь менеджера) — сколько
                      // прошли второй этап (есть балл 2-го блока); в тултипе —
                      // сколько приглашено. Показываем и при 0 прошедших, если
                      // приглашения уже идут (воронка работает, этап не пустой).
                      // Кликабельно (доделка 07.07): secondDemoPassed=true —
                      // ровно тот же критерий, что у счётчика (≥2 ключей demo_block_scores).
                      if ((s?.secondDemoPassed ?? 0) > 0 || (s?.secondDemoInvited ?? 0) > 0) push("demo2",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("demo2", s!.secondDemoPassed, "демо-2")}
                          </TooltipTrigger>
                          <TooltipContent>Прошли 2-ю часть демо. Приглашено во 2-ю часть: {s!.secondDemoInvited} — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      // Только >0: перешли по ссылке. Кликабельно (доделка 07.07):
                      // ctaClicked=true — ровно тот же критерий, что у счётчика.
                      if ((s?.ctaClicked ?? 0) > 0) push("cta",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("cta", s!.ctaClicked, "перешли по ссылке")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты, кликнувшие по кнопке-ссылке в демо (Telegram-канал / сайт) — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      // Только >0: интервью, оферы, нанято.
                      if ((s?.interview ?? 0) > 0) push("interview",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("interview", s!.interview, "интервью")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты на стадии интервью — назначено или уже прошло — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      if ((s?.offer ?? 0) > 0) push("offer",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("offer", s!.offer, "оферов")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты, которым отправлен оффер — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      if ((s?.hired ?? 0) > 0) push("hired",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("hired", s!.hired, "нанято")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты, нанятые по этой вакансии — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      // Только >0: отказ.
                      if ((s?.rejected ?? 0) > 0) push("rejected",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            {clickableLabel("rejected", s!.rejected, "отказ")}
                          </TooltipTrigger>
                          <TooltipContent>Кандидаты со статусом «Отказ» в воронке — нажмите, чтобы отфильтровать</TooltipContent>
                        </UITooltip>)
                      // Иконка сброса фильтра в конце полосы (Юрий 07.07):
                      // появляется, когда фильтр списка отличается от дефолта
                      // (кликом по счётчику или из поповера «Фильтр»).
                      const headerFilterActive =
                        (filters.funnelStatuses?.length ?? 0) > 0 ||
                        filters.demoAnswered === true ||
                        filters.secondDemoPassed === true ||
                        filters.ctaClicked === true ||
                        filters.hhPublication != null ||
                        filters.hideRejected === false
                      if (headerFilterActive) push("resetFilters",
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => handleHeaderStatClick("hhTotal")}
                              className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
                              aria-label="Сброс фильтра"
                            >
                              <FilterX className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Сброс фильтра</TooltipContent>
                        </UITooltip>)
                      return nodes
                    })()}
                    {/* P0-9: бейдж дельты «свежих» — отдельная семантика
                        «с прошлого захода», в конце. Индикатор пагинации
                        «Стр. N из M» из этой строки убран (#15). */}
                    {(headerStats?.freshCount ?? 0) > 0 && <>
                      <span aria-hidden="true">·</span>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 cursor-help">
                            +{headerStats?.freshCount} новых анкет
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Новые заполненные анкеты с прошлого захода в вакансию</TooltipContent>
                      </UITooltip>
                    </>}
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
                {/* Счётчик AI-токенов — показываем если есть хоть один */}
                {headerStats != null && (headerStats.aiTokensIn + headerStats.aiTokensOut) > 0 && (
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-help select-none">
                        токены: {fmtTokens(headerStats.aiTokensIn + headerStats.aiTokensOut)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      AI-токены по этой вакансии: {headerStats.aiTokensIn.toLocaleString("ru")} вх. / {headerStats.aiTokensOut.toLocaleString("ru")} исх.
                    </TooltipContent>
                  </UITooltip>
                )}
                {/* #17: пауза дожимов переехала в дропдаун «Ещё» тулбара над
                    списком (пунктом OutboundPauseMenuItem). Отдельной кнопки в
                    шапке больше нет. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      Действия<ChevronDown className="size-3 ml-0.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {/* Сохранить текущие вопросы анкеты в библиотеку шаблонов
                        (questionnaire_templates). Доступно с любой вкладки —
                        если AnketaTab не смонтирован, переключаемся на «Конструктор». */}
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => {
                        if (anketaHandle) anketaHandle.saveToLibrary()
                        else { setActiveTab("anketa"); setPendingLibSave(true) }
                      }}
                    >
                      <Save className="size-3.5" />Сохранить анкету в библиотеку
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
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
                {/* ТЗ №3: применить готовый шаблон роли (анкета+Портрет+воронка+демо) */}
                <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Или возьмите готовый шаблон роли с нашими вопросами и критериями.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={() => setApplyTemplateOpen(true)}
                    title="Развернёт анкету, Портрет, воронку и демо из шаблона роли и подставит данные продукта"
                  >
                    <Sparkles className="w-3 h-3" />Применить шаблон роли
                  </Button>
                </div>
                {/* Запуск из черновика — статус active, появляются «Кандидаты» + разбор */}
                <div className="mt-3 pt-2 border-t">
                  <Button
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleLaunchVacancy}
                  >
                    <Zap className="w-4 h-4" /> Запустить вакансию
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                    Вакансия станет активной — появятся «Кандидаты» и разбор откликов.
                  </p>
                </div>
              </div>
            )}

            {/* ═══ ТАБЫ + ВИД в одной строке ══════════════════ */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className={cn("mb-3 -mx-4 px-4 sm:mx-0 sm:px-0", !navV2 && "overflow-x-auto")}>
                <div className={cn("flex items-center justify-between gap-3", navV2 ? "flex-wrap" : "min-w-max")}>
                <TabsList className="shrink-0">
                  {/* B8: группируем по смыслу. Активная — сначала работа с людьми
                      (Кандидаты → Аналитика → Исходящий подбор), потом настройка
                      (Вакансия → Контент). Черновик — сначала настройка
                      (Вакансия → Контент), потом работа с людьми. Настройки всегда
                      последними (рендерятся отдельным TabsTrigger ниже). */}
                  {navV2 ? (
                  /* v2: 3 рабочих таба + «Настройки» как кнопка.
                     При черновике (не active/published) рабочие табы disabled с тултипом. */
                  (() => {
                    const isVacancyLive = status === "active" || status === "published" || status === "paused" || status === "archived"
                    const workTabs = [
                      { value: "candidates", icon: Kanban, label: "Кандидаты" },
                      { value: "inbox",      icon: MessageSquare, label: "Инбокс" },
                      { value: "interview",  icon: CalendarDays, label: "Интервью" },
                      { value: "analytics",  icon: BarChart3, label: "Аналитика" },
                    ] as const
                    return (
                      <>
                        {workTabs.map((t) => (
                          isVacancyLive ? (
                            <TabsTrigger key={t.value} value={t.value} className="gap-1.5" asChild>
                              <a href={`/hr/vacancies/${id}?tab=${t.value}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault() }}>
                                <t.icon className="w-3.5 h-3.5" />
                                <span className="hidden xs:inline sm:inline">{t.label}</span>
                              </a>
                            </TabsTrigger>
                          ) : (
                            <UITooltip key={t.value}>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <TabsTrigger value={t.value} className="gap-1.5 opacity-40 pointer-events-none" disabled>
                                    <t.icon className="w-3.5 h-3.5" />
                                    <span className="hidden xs:inline sm:inline">{t.label}</span>
                                  </TabsTrigger>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Доступно после запуска вакансии</TooltipContent>
                            </UITooltip>
                          )
                        ))}
                        {/* Кнопка «Настройки» — не TabsTrigger, управляет v2SettingsSub напрямую */}
                        <button
                          type="button"
                          data-slot="tabs-trigger"
                          data-state={["anketa", "content", "queue", "outbound", "settings"].includes(activeTab) ? "active" : "inactive"}
                          onClick={() => { setV2SettingsSub(v2SettingsSub); setActiveTab(v2SettingsSub) }}
                          className={cn(
                            "data-[state=active]:bg-background data-[state=active]:border-primary dark:data-[state=active]:text-foreground dark:data-[state=active]:border-primary/70 dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm"
                          )}
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span className="hidden xs:inline sm:inline">Настройки</span>
                        </button>
                      </>
                    )
                  })()
                  ) : (
                  <>
                  {((status === "active" || status === "published") ? [
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "inbox", icon: MessageSquare, label: "Инбокс" },
                    { value: "interview", icon: CalendarDays, label: "Интервью" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "outbound", icon: UserSearch, label: "Исходящий подбор" },
                    { value: "queue", icon: Inbox, label: "Очередь" },
                    { value: "anketa", icon: ClipboardList, label: "Вакансия" },
                    { value: "content", icon: BookOpen, label: "Контент" },
                  ] : [
                    { value: "anketa", icon: ClipboardList, label: "Вакансия" },
                    { value: "content", icon: BookOpen, label: "Контент" },
                    { value: "candidates", icon: Kanban, label: "Кандидаты" },
                    { value: "inbox", icon: MessageSquare, label: "Инбокс" },
                    { value: "interview", icon: CalendarDays, label: "Интервью" },
                    { value: "analytics", icon: BarChart3, label: "Аналитика" },
                    { value: "outbound", icon: UserSearch, label: "Исходящий подбор" },
                    { value: "queue", icon: Inbox, label: "Очередь" },
                  ]).map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5" asChild>
                      <a href={`/hr/vacancies/${id}?tab=${tab.value}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault() }}>
                        <tab.icon className="w-3.5 h-3.5" />{tab.label}
                      </a>
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="settings" className="gap-1.5" asChild>
                    <a href={`/hr/vacancies/${id}?tab=settings`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault() }}>
                      <Settings className="w-3.5 h-3.5" />Настройки
                    </a>
                  </TabsTrigger>
                  </>
                  )}
                </TabsList>

                {activeTab === "candidates" && (
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {activeTab === "candidates" && hhConnected === true && apiVacancy?.hhVacancyId && hhSyncMeta && (
                      <HhAutoProcess
                        vacancyId={id}
                        syncing={hhSyncing}
                        onSync={syncHhResponses}
                        lastSyncLabel={hhSyncMeta ? `синх. ${relativeHhSyncTime(hhSyncMeta.syncedAt)} назад` : undefined}
                        onProcessed={() => { refetchCandidates(); }}
                        open={hhNewPopoverOpen}
                        onOpenChange={setHhNewPopoverOpen}
                      />
                    )}
                    {/* Воронка-v2 (Фаза 1г): пресет «На разбор» переехал в дропдаун
                        «Ещё» (по просьбе Юрия — разгрузить тулбар). */}
                    <CandidateFilters
                      filters={filters}
                      onFiltersChange={(f) => { setFilters(f); if (useListPaginated) paginated.setPage(1) }}
                      // #18: серверные фасеты по ВСЕЙ вакансии (города/источники) —
                      // дропдауны показывают все значения, а не только из страницы.
                      facets={candidateFacets}
                      // #18: pipeline вакансии → лейблы/fallback-список стадий.
                      vacancyPipeline={vacancyPipeline}
                      // #42: единый источник списка стадий (воронка v2 → pipeline)
                      // — тот же, что и в дропдауне «Стадия» карточки кандидата.
                      stageOptions={stageOptions}
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
                        {/* Воронка-v2 (Фаза 1г): пресет «На разбор» — застрявшие
                            после 1-й части (есть балл ответов демо, не приглашены
                            на 2-ю, не в отказе). onSelect+preventDefault — чтобы
                            переключение фильтра не закрывало меню сразу. */}
                        <DropdownMenuItem
                          onSelect={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, reviewQueue: !f.reviewQueue })); if (useListPaginated) paginated.setPage(1) }}
                          title="Прошли 1-ю часть, но застряли: не приглашены на 2-ю и ещё не в отказе — проверить вручную"
                        >
                          <ClipboardList className="w-3.5 h-3.5 mr-2" />
                          На разбор
                          {filters.reviewQueue && <Check className="w-3.5 h-3.5 ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground">
                          {rescoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          {rescoring ? "Переоценка…" : "Переоценить выделенных"}
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => rescoreSelected("all")} disabled={!!rescoring}>
                          <Sparkles className="w-3.5 h-3.5 mr-2" /> Все параметры
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rescoreSelected("resume")} disabled={!!rescoring}>
                          <ClipboardList className="w-3.5 h-3.5 mr-2" /> Портрет
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rescoreSelected("portrait")} disabled={!!rescoring}>
                          <Target className="w-3.5 h-3.5 mr-2" /> Осевой балл (справочно)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => rescoreSelected("test")} disabled={!!rescoring}>
                          <Check className="w-3.5 h-3.5 mr-2" /> AI-тест
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
                        <DropdownMenuSeparator />
                        {/* #17: пауза дожимов (исходящая очередь) переехала сюда
                            из шапки. Показываем для активных/на паузе вакансий,
                            где очередь реально работает. */}
                        {(status === "active" || status === "published" || status === "paused") && (
                          <OutboundPauseMenuItem vacancyId={id} />
                        )}
                        {/* Режим рассылки hh: показывает иконку чата в каждой строке
                            списка для одиночной полу-ручной рассылки (архивные hh-вакансии).
                            onSelect+preventDefault — чтобы клик не закрывал меню. */}
                        <DropdownMenuItem
                          onSelect={(e) => { e.preventDefault(); setHhBroadcastMode((v) => !v) }}
                          title="Показывает иконку чата в каждой строке списка для одиночной рассылки через hh"
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-2" />
                          {hhBroadcastMode ? "Рассылка hh: выкл." : "Рассылка hh: вкл."}
                          {hhBroadcastMode && <Check className="w-3.5 h-3.5 ml-auto" />}
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
                      availableKeys={availableColumnKeys}
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
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setHhImportBind(false); setHhImportDialogOpen(true) }}>
                          <Globe className="size-3.5" />Заполнить из hh.ru
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

              {/* v2: плоский ряд из 10 под-табов — виден когда активна группа «Настройки» */}
              {navV2 && ["anketa", "content", "queue", "outbound", "settings"].includes(activeTab) && (() => {
                const settingsSubTabs = [
                  /* Портрет — вторым после «Вакансия» (решение Юрия 21.06): сначала кого ищем, затем процесс */
                  { kind: "tab",     value: "anketa"  , label: "Вакансия",        icon: ClipboardList, section: null             },
                  { kind: "section", value: "settings", label: "Портрет",          icon: Target,        section: "spec"           },
                  { kind: "tab",     value: "content" , label: "Контент",          icon: BookOpen,      section: null             },
                  { kind: "section", value: "settings", label: "Воронка",          icon: Workflow,      section: "funnel-builder" },
                  { kind: "section", value: "settings", label: "Коммуникации",     icon: MessageSquare, section: "communications" },
                  { kind: "section", value: "settings", label: "Воронка v2",       icon: Workflow,      section: "funnel-v2"      },
                  { kind: "section", value: "settings", label: "Воронка 3",        icon: Workflow,      section: "funnel-v3"      },
                  { kind: "section", value: "settings", label: "Источники",        icon: Link2,         section: "sources"        },
                  { kind: "section", value: "settings", label: "Расписание",       icon: Clock,         section: "ai"             },
                  { kind: "section", value: "settings", label: "Интеграции",       icon: Settings,      section: "integrations"   },
                  { kind: "section", value: "settings", label: "Брендинг",         icon: Globe,         section: "page"           },
                  { kind: "tab",     value: "outbound", label: "Исходящий подбор", icon: UserSearch,    section: null             },
                  { kind: "tab",     value: "queue"   , label: "Очередь",          icon: Inbox,         section: null             },
                ] as const
                const handleSubTabClick = (s: typeof settingsSubTabs[number]) => {
                  if (s.kind === "section") {
                    setActiveTab("settings")
                    setSettingsSection(s.section as SettingsSectionId)
                    const sp = new URLSearchParams(window.location.search)
                    sp.set("tab", "settings")
                    sp.set("section", s.section as string)
                    router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                  } else {
                    setV2SettingsSub(s.value as typeof v2SettingsSub)
                    setActiveTab(s.value)
                  }
                }
                const getIsActive = (s: typeof settingsSubTabs[number]) =>
                  s.kind === "tab" ? activeTab === s.value : activeTab === "settings" && settingsSection === s.section
                // «Воронка v2» (beta) видна всем пользователям (Юрий 26.06).
                // «Воронка» (старый funnel-builder) — только платформенному администратору.
                // «Воронка 3» — только владельцу-полигону (owner-only).
                const subTabs = settingsSubTabs
                  .filter(s => isPlatformAdmin || s.section !== "funnel-builder")
                  .filter(s => funnelV3Visible || s.section !== "funnel-v3")
                // Юрий 03.07: горизонтальный скролл-бар наезжал на подписи табов.
                // Вместо overflow-x-auto + «Ещё»-бургера — единый ряд с переносом
                // на вторую строку (flex-wrap). На мобильной ширине перенос — ожидаемое
                // поведение, отдельная ветка не нужна.
                return (
                  <div className="mb-4 border-b -mx-4 px-4 sm:mx-0 sm:px-0">
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                      {subTabs.map((s) => {
                        const isActive = getIsActive(s)
                        return (
                          <button
                            key={s.kind === "section" ? `section-${s.section}` : s.value}
                            type="button"
                            onClick={() => handleSubTabClick(s)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap",
                              isActive ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <s.icon className="w-3.5 h-3.5" />{s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <TabsContent value="anketa">
                {/* Вакансия — двухколоночный layout (форма + AI-советник),
                    как «Портрет» — full, иначе панель советника зажимается. */}
                <SettingsTabShell width="full">
                <AnketaTab
                  vacancyId={id}
                  descriptionJson={apiVacancy?.descriptionJson}
                  aiQualityDetails={(apiVacancy as { aiQualityDetails?: unknown } | undefined)?.aiQualityDetails}
                  aiQualityAnalyzedAt={(apiVacancy as { aiQualityAnalyzedAt?: string | null } | undefined)?.aiQualityAnalyzedAt ?? null}
                  portraitScoring={(apiVacancy as { portraitScoring?: boolean } | undefined)?.portraitScoring}
                  onTitleChange={(t) => { if (t) setInternalName(t) }}
                  onNavigateTab={(tab) => {
                    // «Далее → Портрет»: Портрет — это section «spec» внутри «Настроек», не верхний таб.
                    if (tab === "spec") {
                      setActiveTab("settings")
                      setSettingsSection("spec")
                      const sp = new URLSearchParams(window.location.search)
                      sp.set("tab", "settings"); sp.set("section", "spec")
                      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                    } else {
                      setActiveTab(tab)
                    }
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                  onScoreChange={setAdvisorScore}
                  onSavingChange={setAnketaSaving}
                  registerHandle={registerAnketaHandle}
                />
                </SettingsTabShell>
              </TabsContent>

              <TabsContent value="candidates">
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
                  onOpenProfile={(c, colId, initialTab) => {
                    // Open the candidate drawer with real API data
                    setDrawerCandidateId(c.id)
                    setDrawerInitialTab(initialTab ?? null)
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
                  hhBroadcastMode={hhBroadcastMode}
                  onBroadcast={openHhBroadcastForCandidate}
                  funnelV2Stages={funnelV2Stages}
                  vacancyPipeline={vacancyPipeline}
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
                <SettingsTabShell width="full">
                <ContentBlocksTab
                  vacancyId={id}
                  vacancyTitle={vacancyTitle}
                  registerFlush={registerContentFlush}
                  funnelV2RuntimeEnabled={apiVacancy?.funnelV2RuntimeEnabled === true}
                  onNavigateNext={() => {
                    // Далее → следующий этап после «Контент»: для платформенного
                    // администратора — «Воронка» (funnel-builder), для остальных — «Воронка v2».
                    const nextSection = isPlatformAdmin ? "funnel-builder" : "funnel-v2"
                    setActiveTab("settings")
                    setSettingsSection(nextSection)
                    const sp = new URLSearchParams(window.location.search)
                    sp.set("tab", "settings"); sp.set("section", nextSection)
                    router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                />
                </SettingsTabShell>
              </TabsContent>

              {/* #62: «Инбокс» — единый чат-инбокс по вакансии (список переписок
                  слева + нить выбранного кандидата справа). */}
              <TabsContent value="inbox">
                <InboxTab vacancyId={id} />
              </TabsContent>

              {/* Интервью — календарь компании прямо внутри вакансии (часть единого
                  рабочего пространства: интервью доступны, не выходя из вакансии). */}
              <TabsContent value="interview">
                <Suspense fallback={<div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Загрузка…</div>}>
                  <InterviewsView vacancyId={id} embedded />
                </Suspense>
              </TabsContent>

              {/* #23: «Очередь сообщений» — отдельный таб (раньше был в Настройки→Источники) */}
              <TabsContent value="queue">
                <SettingsTabShell width="full">
                  <MessageQueueSection vacancyId={id} />
                </SettingsTabShell>
              </TabsContent>

              <TabsContent value="outbound">
                <SettingsTabShell width="full">
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
                </SettingsTabShell>
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

                      {/* Тепловая карта «Лучшее время публикации» — heatmap 7×24
                          + шкалы «Дни/Часы». Данные из best-publish-time (по всей
                          компании, МСК). Сама скрывается, если мало откликов. */}
                      <PublishTimeHeatmapCard vacancyId={id} />
                    </div>
                  )
                })()}
              </TabsContent>

              <TabsContent value="settings">
                <VacancySettingsProvider>
                {/* Сабнав настроек: в v2 перенесён в плоский ряд 10 под-табов (над TabsContent);
                    в legacy — SettingsSubNavButton ниже; здесь рендерим только при !navV2 */}
                {!navV2 && (
                <div className="mb-4 border-b overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <div className="flex items-center gap-1 min-w-max">
                  {/* #18: Воронка перед Сообщениями — HR сначала проектирует
                      стадии и AI-фильтр, потом уже настраивает тексты. */}
                  {([
                    { value: "page"           as const, label: "Брендинг",     icon: Globe },
                    { value: "funnel-builder" as const, label: "Воронка",       icon: Workflow },
                    // R4 Candidate Spec (новый контур): единый экран «Портрет».
                    { value: "spec"           as const, label: "Портрет",       icon: Target },
                    // «Сообщения» + «Дожим» объединены в «Коммуникации» (08.07).
                    { value: "communications" as const, label: "Коммуникации",  icon: MessageSquare },
                    { value: "sources"        as const, label: "Источники",     icon: Link2 },
                    { value: "ai"             as const, label: "Расписание",    icon: Clock },
                    { value: "integrations"   as const, label: "Интеграции",    icon: Settings },
                    // Скрыты (контент доступен по прямой ?section=, настройки — внутри блоков «Воронки»):
                    // funnel (старые стадии), aichatbot — покрыты блоками Конструктора.
                  ] satisfies { value: VacancyTabKey; label: string; icon: typeof Globe }[])
                  .filter(s => isPlatformAdmin || s.value !== "funnel-builder")
                  .map((s) => (
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
                )}

                {/* ───────── ТАБ «Страница и брендинг» ───────── */}
                {settingsSection === "page" && (
                <SettingsTabShell width="lg" className="space-y-6">
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
                        description: brandDescription,
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
                            ? { name: mainCompanyData.brandName, logo: mainCompanyData.logoUrl, slogan: mainCompanyData.brandSlogan, website: mainCompanyData.website, description: mainCompanyData.description }
                            : brandCompaniesData.find(c => c.id === vacancyBrandCompanyId) ?? null
                          const defaultName = selectedBrand?.name || ""
                          const defaultSlogan = selectedBrand?.slogan || ""
                          const defaultWebsite = selectedBrand?.website || ""
                          // Зона 3: дефолт описания — из выбранного бренда (или основной компании).
                          const defaultDescription = selectedBrand?.description || ""
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
                                        {selectedBrand?.logo ? "Изменить лого" : "Загрузить"}
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
                              {/* Зона 3: описание компании — подтягивается из выбранного бренда,
                                  можно переопределить per-вакансия (блок «О компании» на странице). */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-xs">Описание компании</Label>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] gap-1 px-2"
                                    disabled={!defaultDescription}
                                    onClick={() => { setBrandDescription(defaultDescription); saveBranding({ description: defaultDescription }) }}
                                  >
                                    <RefreshCw className="w-3 h-3" /> Подтянуть из компании
                                  </Button>
                                </div>
                                <Textarea
                                  value={brandDescription}
                                  onChange={(e) => setBrandDescription(e.target.value)}
                                  placeholder={defaultDescription || "Краткое описание компании для блока «О компании»…"}
                                  rows={5}
                                  className="text-sm"
                                />
                                {defaultDescription && !brandDescription && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Будет показано описание компании из профиля. Заполните поле, чтобы переопределить для этой вакансии.
                                  </p>
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
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Источники» ───────── */}
                {settingsSection === "sources" && (
                <SettingsTabShell width="lg" className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Источники кандидатов</h3>
                    <p className="text-sm text-muted-foreground mb-3">Подключение сервисов для импорта откликов</p>
                    <div className="space-y-3">
                        {/* ЕДИНАЯ hh-карточка: аккаунт (OAuth) + привязка вакансии в одном.
                            Аккаунт сверху (честный статус + employer), привязка вакансии снизу. */}
                        <div className={cn("rounded-lg border p-4 space-y-3", hhConnected === false ? "bg-amber-500/5 border-amber-300/70" : "bg-card")}>
                          {/* — Аккаунт hh — */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold" style={{ backgroundColor: "#D6001C" }}>hh</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">hh.ru</p>
                              {hhConnected === true ? (
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Аккаунт подключён · <b>{hhEmployerName ?? "—"}</b></p>
                              ) : hhConnected === false ? (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400">Аккаунт не подключён — отклики тянуться не будут. Войдите под тем hh-аккаунтом, где опубликована вакансия.</p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">Проверяем подключение…</p>
                              )}
                            </div>
                            {hhConnected === true ? (
                              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" asChild>
                                <a href={`/api/integrations/hh/connect?vacancyId=${id}`}><RefreshCw className="w-3.5 h-3.5" /> Переподключить</a>
                              </Button>
                            ) : (
                              <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0 text-white" style={{ backgroundColor: "#D6001C" }} asChild>
                                <a href={`/api/integrations/hh/connect?vacancyId=${id}`}><Plug className="w-3.5 h-3.5" /> Подключить hh.ru</a>
                              </Button>
                            )}
                          </div>

                          {/* — Привязка вакансии. Ровно ОДНО действие за раз:
                              привязка появляется только когда аккаунт подключён
                              (или вакансия уже привязана). Пока аккаунта нет —
                              «Привязать» нечем (вакансию выбирают из аккаунта). */}
                          {apiVacancy?.hhVacancyId ? (
                            <div className="border-t pt-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] text-muted-foreground">
                                    Вакансия привязана · ID{" "}
                                    <a href={apiVacancy.hhUrl ?? `https://hh.ru/vacancy/${apiVacancy.hhVacancyId}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">{apiVacancy.hhVacancyId}</a>
                                  </p>
                                </div>
                                <a href={apiVacancy.hhUrl ?? `https://hh.ru/vacancy/${apiVacancy.hhVacancyId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1">
                                  Открыть на hh.ru <ExternalLink className="w-3 h-3" />
                                </a>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => setHhUnlinkOpen(true)}>Отвязать</Button>
                              </div>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted text-[11px] text-muted-foreground"><span aria-hidden>📥</span><span>Откликов:</span><span className="font-medium text-foreground">{hhStats ? (hhStats.totalResponses > 0 ? hhStats.totalResponses : "—") : "…"}</span></span>
                                <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted text-[11px] text-muted-foreground"><span aria-hidden>🆕</span><span>Необраб.:</span><span className="font-medium text-foreground">{hhStats ? (hhStats.newResponses > 0 ? hhStats.newResponses : "—") : "…"}</span></span>
                                <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted text-[11px] text-muted-foreground"><span aria-hidden>🔄</span><span>Синк:</span><span className="font-medium text-foreground">{hhStats ? formatHhSyncDate(hhStats.lastSyncAt) : "…"}</span></span>
                              </div>
                            </div>
                          ) : hhConnected === true ? (
                            <div className="border-t pt-3 flex items-center gap-3 flex-wrap">
                              <p className="flex-1 min-w-0 text-[11px] text-muted-foreground">Вакансия не привязана — нажмите «Привязать», чтобы выбрать её из аккаунта.</p>
                              <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => { setHhImportBind(true); setHhImportDialogOpen(true) }}>Привязать</Button>
                            </div>
                          ) : (
                            <div className="border-t pt-3">
                              <p className="text-[11px] text-muted-foreground">Шаг 2 — после подключения аккаунта откроется привязка вакансии (можно вставить ссылку или выбрать на hh.ru).</p>
                            </div>
                          )}
                        </div>
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
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-muted-foreground">{vacancyAvitoEnabled ? "Активно" : "Отключено"}</span>
                            <Switch checked={vacancyAvitoEnabled} onCheckedChange={toggleVacancyAvito} disabled={avitoToggleBusy} />
                          </div>
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
                          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => window.open("/hr/hiring-settings?tab=integrations", "_blank")}>Включить</Button>
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
                          <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => window.open("/hr/hiring-settings?tab=integrations", "_blank")}>Подключить</Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Telegram-постинг переехал в «Коммуникации» → блок 6 «Публикация» (08.07). */}

                  {/* Источники и UTM-ссылки */}
                  <UtmLinksSection vacancyId={id} vacancySlug={id} />

                  {/* Поля мини-формы (перенесено из «Брендинг» по P0-38) */}
                  <MiniFormBuilder vacancyId={id} descriptionJson={apiVacancy?.descriptionJson} onSaved={() => refetchVacancy()} />

                  {/* HTML-страница (перенесено из «Брендинг» по P0-38) */}
                  <PublishTab
                    vacancyTitle={internalName || vacancyTitle}
                    vacancySlug={id}
                    vacancyId={id}
                    vacancyCity={apiVacancy?.city ?? "Москва"}
                    vacancyFormat={apiVacancy?.format}
                    salaryFrom={apiVacancy?.salaryMin}
                    salaryTo={apiVacancy?.salaryMax}
                    brandOverride={{ companyName: brandCompanyName, color: brandColor, logo: brandLogo, slogan: brandSlogan }}
                    descriptionJson={apiVacancy?.descriptionJson}
                    onSaved={() => refetchVacancy()}
                    blocks={Array.isArray((apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.landingBlocks)
                      ? (apiVacancy!.descriptionJson as Record<string, unknown>).landingBlocks as { icon: string; text: string }[]
                      : undefined}
                    benefits={Array.isArray((apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.landingBenefits)
                      ? (apiVacancy!.descriptionJson as Record<string, unknown>).landingBenefits as string[]
                      : undefined}
                    button={(() => {
                      const b = (apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.landingButton
                      return b && typeof b === "object" ? b as { text?: string; color?: string; icon?: string; iconPosition?: "left" | "right" } : undefined
                    })()}
                    formFields={Array.isArray((apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.miniFormFields)
                      ? (apiVacancy!.descriptionJson as Record<string, unknown>).miniFormFields as Array<{ id: string; label: string; type: string; required: boolean; placeholder?: string; options?: string[] }>
                      : undefined}
                  />
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Сообщения» ───────── */}
                {/* ───────── ТАБ «Коммуникации» (08.07: объединяет бывшие «Сообщения» + «Дожим») ───────── */}
                {settingsSection === "communications" && (
                <SettingsTabShell width="lg" className="space-y-6">
                  {(apiVacancy as { funnelBuilderEnabled?: boolean } | undefined)?.funnelBuilderEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        Конструктор воронки активен. Изменения здесь синхронизируются с конструктором.
                      </div>
                    </div>
                  )}
                  {/* #62: честный баннер про AI чат-бот — обработка УЖЕ подключена
                      (cron/follow-up route.ts:693 отменяет дожимные касания при
                      aiChatbotEnabled===true, кроме приглашения на интервью). */}
                  {(apiVacancy as { aiChatbotEnabled?: boolean } | undefined)?.aiChatbotEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        <strong>AI чат-бот включён для этой вакансии.</strong> Первое
                        приглашение по-прежнему уходит кандидату сразу при отклике,
                        но напоминания 2 и 3 серии (блок 1) и все дожимы (блок 2)
                        приостановлены — их отправляет сам бот в диалоге. Приглашение
                        записаться на интервью (блок 4) и отказы (блок 5) продолжают
                        работать как настроено.
                      </div>
                    </div>
                  )}

                  {/* Фаза 1 «единого центра коммуникаций» (11.07): тумблер
                      пилота «агент коммуникаций» — переписывает тексты дожимов
                      под контекст кандидата. См. lib/comms-agent/. */}
                  <CommsAgentToggle
                    vacancyId={id}
                    initialEnabled={(apiVacancy?.aiProcessSettings as { dozhimAgentEnabled?: boolean } | null | undefined)?.dozhimAgentEnabled}
                    onSaved={() => refetchVacancy()}
                  />

                  {/* 1 · Первый контакт */}
                  <div>
                    <h3 className="text-base font-semibold text-foreground mb-1">1 · Первый контакт</h3>
                    <p className="text-sm text-muted-foreground">Приглашение на демо и напоминания, если кандидат не ответил.</p>
                  </div>
                  <FirstContactSettings vacancyId={id} onSaved={() => refetchVacancy()} />
                  {/* #21: напоминания 2 и 3 серии первых сообщений (Сообщение 1
                      и off-hours редактируются выше, в FirstContactSettings —
                      единое хранилище с Портретом). */}
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

                  {/* 2 · Дожимы */}
                  <div className="pt-2">
                    <h3 className="text-base font-semibold text-foreground mb-1">2 · Дожимы</h3>
                    <p className="text-sm text-muted-foreground">AI-фильтр откликов и цепочка касаний кандидатов, которые не открыли или не дошли до конца демо. Пер-стадийные дожимы Воронки v2 настраиваются в конструкторе «Воронка v2», не здесь.</p>
                  </div>
                  {/* Пояснение разделения ответственности при включённом движке
                      Воронки v2: пер-стадийные дожимы живут в конструкторе, эта
                      секция — легаси-путь. Предупреждаем о двойных касаниях, т.к.
                      на уровне отправки (cron/follow-up) обе цепочки не исключают
                      друг друга (разбор 02.07). */}
                  {(apiVacancy as { funnelV2RuntimeEnabled?: boolean } | undefined)?.funnelV2RuntimeEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        <strong>Движок Воронки v2 включён.</strong> Дожимы кандидатов теперь
                        настраиваются по стадиям — в конструкторе «Воронка v2» (у каждой стадии
                        свои ветки «не открыл» / «открыл, не досмотрел»). Настройки на этой
                        вкладке — легаси-путь. Чтобы кандидаты не получали двойные касания, не
                        держите обе цепочки включёнными одновременно.
                      </div>
                    </div>
                  )}
                  <VacancyFollowupSettings vacancyId={id} tabKey="communications" />
                  <VacancyTestFollowupSettings vacancyId={id} />

                  {/* 3 · Диалог */}
                  <div className="pt-2">
                    <h3 className="text-base font-semibold text-foreground mb-1">3 · Диалог</h3>
                    <p className="text-sm text-muted-foreground">Реакция на «хочу созвониться», справочник FAQ и аварийное повторное сообщение.</p>
                  </div>
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
                    sections={["callIntent", "templates"] satisfies AutomationSectionId[]}
                    tabKey="communications"
                  />
                  {/* #46: «Аварийное повторное сообщение» — opt-in под спойлером. */}
                  <RecoveryMessageSettings
                    vacancyId={id}
                    initialEnabled={(apiVacancy as { recoveryMessageEnabled?: boolean } | undefined)?.recoveryMessageEnabled ?? false}
                    initialText={(apiVacancy as { recoveryMessageText?: string } | undefined)?.recoveryMessageText ?? ""}
                    onSaved={() => refetchVacancy()}
                  />

                  {/* 4 · Интервью */}
                  <div className="pt-2">
                    <h3 className="text-base font-semibold text-foreground mb-1">4 · Интервью</h3>
                    <p className="text-sm text-muted-foreground">Текст приглашения записаться на интервью (ссылка /schedule/[token]).</p>
                  </div>
                  <ScheduleInviteSettings
                    vacancyId={id}
                    initialText={(apiVacancy as { scheduleInviteText?: string } | undefined)?.scheduleInviteText ?? ""}
                    onSaved={() => refetchVacancy()}
                  />
                  {/* 14.07 (осиротевшие настройки, Ф.А): шаблоны «ссылка на встречу
                      добавлена» и «интервью отменено менеджером» — API уже принимал
                      оба поля (aiProcessSettings), редактора не было. */}
                  <InterviewNotificationMessagesSettings
                    vacancyId={id}
                    initial={apiVacancy?.aiProcessSettings ?? null}
                    onSaved={() => refetchVacancy()}
                  />
                  {/* 14.07: экран «Вы записаны» на публичной странице записи
                      (descriptionJson.interviewBookedScreen) — API читал поле с
                      #26.4, редактора не было. */}
                  <InterviewBookedScreenSettings
                    vacancyId={id}
                    initial={(apiVacancy?.descriptionJson as { interviewBookedScreen?: { title?: string; text?: string } } | undefined)?.interviewBookedScreen ?? null}
                    onSaved={() => refetchVacancy()}
                  />

                  {/* 5 · Отказы */}
                  <div className="pt-2">
                    <h3 className="text-base font-semibold text-foreground mb-1">5 · Отказы</h3>
                  </div>
                  <RejectionTextsSummary
                    vacancyId={id}
                    portraitScoring={(apiVacancy as { portraitScoring?: boolean } | undefined)?.portraitScoring}
                    onNavigateToSpec={() => {
                      setSettingsSection("spec")
                      const sp = new URLSearchParams(window.location.search)
                      sp.set("tab", "settings"); sp.set("section", "spec")
                      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                    chatbotRejectionMessages={(apiVacancy as { aiChatbotSettings?: { rejectionMessages?: { injection?: string; severeAbuse?: string; repeatedAbuse?: string; unstable?: string } } } | undefined)?.aiChatbotSettings?.rejectionMessages}
                    onNavigateToChatbot={() => {
                      setSettingsSection("aichatbot")
                      const sp = new URLSearchParams(window.location.search)
                      sp.set("tab", "settings"); sp.set("section", "aichatbot")
                      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                    funnelV2RejectStagesCount={funnelV2RejectStagesCount}
                    onNavigateToFunnelV2={() => {
                      setSettingsSection("funnel-v2")
                      const sp = new URLSearchParams(window.location.search)
                      sp.set("tab", "settings"); sp.set("section", "funnel-v2")
                      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                  />

                  {/* 6 · Публикация */}
                  <div className="pt-2">
                    <h3 className="text-base font-semibold text-foreground mb-1">6 · Публикация</h3>
                  </div>
                  <TelegramPosting vacancyId={id} />
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Демо и воронка» (легаси, недостижим напрямую — редиректится на funnel-builder) ───────── */}
                {settingsSection === "funnel" && (
                <SettingsTabShell width="lg" className="space-y-6">
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
                  {/* Стоп-факторы (Юрий 08.07): дубль-редактор убран — теперь
                      единственное место редактирования — вкладка «Портрет»
                      (spec-editor.tsx). Она пишет напрямую в то же боевое
                      vacancies.stop_factors_json, синк работает независимо
                      от контура оценки (portrait_scoring). */}
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
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Конструктор воронки [Beta]» — только для платформенного администратора ───────── */}
                {settingsSection === "funnel-builder" && isPlatformAdmin && (
                <SettingsTabShell width="full" className="space-y-6">
                  <FunnelBuilder vacancyId={id} />
                </SettingsTabShell>
                )}

                {/* ───────── Воронка v2 (beta, видна всем) ───────── */}
                {settingsSection === "funnel-v2" && (
                <SettingsTabShell width="full" className="space-y-6">
                  <FunnelV2Builder vacancyId={id} isOwner={isOwnerEmail(user?.email)} onOpenPortrait={() => {
                    setSettingsSection("spec")
                    const sp = new URLSearchParams(window.location.search)
                    sp.set("tab", "settings"); sp.set("section", "spec")
                    router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }} onOpenChatbot={() => {
                    setSettingsSection("aichatbot")
                    const sp = new URLSearchParams(window.location.search)
                    sp.set("tab", "settings"); sp.set("section", "aichatbot")
                    router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }} />
                </SettingsTabShell>
                )}

                {/* ───────── Воронка 3 (owner-only: единый конструктор поверх движка v2) ───────── */}
                {settingsSection === "funnel-v3" && funnelV3Visible && (
                <SettingsTabShell width="full" className="space-y-6">
                  <FunnelV3Editor vacancyId={id} />
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Кого ищем» (R4 Candidate Spec, новый контур) ───────── */}
                {settingsSection === "spec" && (
                  <>
                  {/* Портрет — полноширинный (двухколоночный: Портрет + AI-ассистент),
                      как таб «Вакансия»/«Контент». НЕ оборачиваем в max-w-3xl — иначе
                      панель ассистента зажимается (решение Юрия 02.07). Нижняя панель
                      для spec — тоже на всю ширину (VacancyTabFooter className ниже). */}
                  <SpecEditor
                    vacancyId={id}
                    portraitScoring={(apiVacancy as { portraitScoring?: boolean } | undefined)?.portraitScoring}
                    onAdopted={refetchVacancy}
                    onNavigateNext={() => { setV2SettingsSub("content"); setActiveTab("content"); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                    onNavigateToCommunications={() => {
                      setSettingsSection("communications")
                      const sp = new URLSearchParams(window.location.search)
                      sp.set("tab", "settings"); sp.set("section", "communications")
                      router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false })
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                    vacancyAnketaData={(apiVacancy?.descriptionJson as Record<string, unknown> | undefined)?.anketa as Record<string, unknown> | undefined}
                  />
                  {/* AI-обработка откликов (Юрий 08.07): требования v2 + AI-фильтр
                      резюме переехали сюда из бывшего таба «Дожим» — оба про
                      скоринг, логично рядом с Портретом. VacancyAiProcessSettings
                      сама скрывает textarea отказа, когда включён режим Портрета
                      (см. компонент). */}
                  <SettingsTabShell width="full" className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">AI-обработка откликов</h3>
                      <p className="text-sm text-muted-foreground">Структурированные требования (v2) и AI-фильтр резюме (legacy-контур, вне Портрета).</p>
                    </div>
                    <VacancyRequirementsSettings
                      vacancyId={id}
                      initial={(apiVacancy as { requirementsJson?: import("@/lib/db/schema").VacancyRequirements } | undefined)?.requirementsJson ?? null}
                      onSaved={() => refetchVacancy()}
                    />
                    <VacancyAiProcessSettings
                      vacancyId={id}
                      initial={apiVacancy?.aiProcessSettings ?? null}
                      initialAiScoringEnabled={apiVacancy?.aiScoringEnabled ?? true}
                      portraitScoring={(apiVacancy as { portraitScoring?: boolean } | undefined)?.portraitScoring}
                      onSaved={() => refetchVacancy()}
                    />
                  </SettingsTabShell>
                  </>
                )}

                {/* ───────── ТАБ «AI чат-бот» (легаси, недостижим напрямую — редиректится на funnel-builder) ───────── */}
                {settingsSection === "aichatbot" && (
                <SettingsTabShell width="lg" className="space-y-6">
                  {(apiVacancy as { funnelBuilderEnabled?: boolean } | undefined)?.funnelBuilderEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200">
                        Конструктор воронки активен. Изменения здесь синхронизируются с конструктором.
                      </div>
                    </div>
                  )}
                  <AiChatbotSettings vacancyId={id} onSaved={() => refetchVacancy()} />
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Расписание» (бывший «AI сценарии») ───────── */}
                {settingsSection === "ai" && (
                <SettingsTabShell width="lg">
                  <ScheduleTab vacancyId={id} />
                </SettingsTabShell>
                )}

                {/* ───────── ТАБ «Интеграции» ───────── */}
                {settingsSection === "integrations" && (
                <SettingsTabShell width="lg" className="space-y-6">

                  {/* Уровень 3: per-vacancy override интеграций */}
                  <div className="rounded-lg border bg-card p-5 space-y-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Свои интеграции для этой вакансии</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {integrEnabled
                            ? "Вакансия использует собственные настройки, компанийские игнорируются"
                            : `Наследуются от компании${companyWebhookUrl ? `: ${companyWebhookUrl}` : " — webhook не настроен"}`}
                        </p>
                      </div>
                      <Switch
                        checked={integrEnabled}
                        onCheckedChange={setIntegrEnabled}
                      />
                    </div>

                    {integrEnabled && (
                      <div className="space-y-5 pt-1 border-t">
                        {/* Webhook */}
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-foreground">Webhook</p>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">URL для уведомлений</Label>
                            <Input
                              placeholder="https://example.com/webhook"
                              value={integrWebhookUrl}
                              onChange={e => setIntegrWebhookUrl(e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">События</p>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="ev-new-candidate"
                                checked={integrEventNewCandidate}
                                onCheckedChange={v => setIntegrEventNewCandidate(v === true)}
                              />
                              <Label htmlFor="ev-new-candidate" className="text-sm font-normal cursor-pointer">
                                Новый кандидат (<code className="text-xs bg-muted px-1 rounded">new_candidate</code>)
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="ev-ai-screening"
                                checked={integrEventAiScreening}
                                onCheckedChange={v => setIntegrEventAiScreening(v === true)}
                              />
                              <Label htmlFor="ev-ai-screening" className="text-sm font-normal cursor-pointer">
                                AI-скоринг завершён (<code className="text-xs bg-muted px-1 rounded">ai_screening</code>)
                              </Label>
                            </div>
                          </div>
                        </div>

                        {/* Битрикс */}
                        <div className="space-y-3 pt-3 border-t">
                          <p className="text-sm font-medium text-foreground">Битрикс24</p>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">URL вебхука Битрикс24</Label>
                            <Input
                              placeholder="https://company.bitrix24.ru/rest/1/xxx/"
                              value={integrBitrixUrl}
                              onChange={e => setIntegrBitrixUrl(e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Событие (trigger)</Label>
                            <Input
                              placeholder="crm.lead.add"
                              value={integrBitrixTrigger}
                              onChange={e => setIntegrBitrixTrigger(e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={saveIntegrations}
                        disabled={integrSaving}
                      >
                        {integrSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        Сохранить
                      </Button>
                    </div>
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

                </SettingsTabShell>
                )}

                {/* #20 — ЕДИНАЯ нижняя панель настроек (эталон = таб «Вакансия»):
                    СПРАВА [Сохранить настройки] · [Далее → {next}]; СЛЕВА крошки
                    [‹ Все вакансии] · [‹ {prev}]. «Далее»/«Назад» — из канонического
                    v2-ряда по текущему settingsSection. Заменяет прежний floating
                    VacancyStickySaveBar + per-section «Далее». beforeunload-защита
                    остаётся в самом провайдере. */}
                {(() => {
                  const idx = vacancySteps.findIndex(s => s.kind === "section" && s.section === settingsSection)
                  const prevStep = idx > 0 ? vacancySteps[idx - 1] : null
                  const nextStep = idx >= 0 && idx < vacancySteps.length - 1 ? vacancySteps[idx + 1] : null
                  return (
                    <VacancyTabFooter
                      onAllVacancies={() => router.push("/hr/vacancies")}
                      prevLabel={prevStep?.label ?? null}
                      onPrev={prevStep ? () => goToVacancyStep(prevStep) : undefined}
                      nextLabel={nextStep?.label ?? null}
                      onNext={nextStep ? () => goToVacancyStep(nextStep) : undefined}
                      // Юрий 03.07 (финал №2): футер НЕ наследует ширину таба —
                      // у ВСЕХ табов кнопки на одной фиксированной позиции
                      // (правый край max-w-6xl), независимо от ширины контента.
                      className="max-w-5xl"
                    />
                  )
                })()}
                </VacancySettingsProvider>
              </TabsContent>
            </Tabs>

            {/* ═══ Единая нижняя панель — для табов ВНЕ настроек ═════════
                #20: Настройки рендерят VacancyTabFooter ВНУТРИ провайдера
                (там доступен saveAll). Здесь — глобальная панель для
                верхних табов v2-ряда (Вакансия/Контент/Исходящий/Очередь) и
                рабочих табов (Кандидаты/Аналитика/Интервью). «Сохранить» тут
                НЕ показываем — этими табами владеет собственный редактор
                (у него своя кнопка «Сохранить»), панель даёт крошки + «Далее».
                Для activeTab==="settings" панель не рендерим — её показывает
                внутренний футер настроек. */}
            {activeTab !== "settings" && (() => {
              // Позиция текущего верхнего таба в каноническом v2-ряду.
              const idx = vacancySteps.findIndex(s => s.kind === "tab" && s.value === activeTab)
              const prevStep = idx > 0 ? vacancySteps[idx - 1] : null
              const nextStep = idx >= 0 && idx < vacancySteps.length - 1 ? vacancySteps[idx + 1] : null
              // Юрий 03.07: ЕДИНЫЙ ряд под линией на всех табах — кнопки
              // «Вакансии» (Предпросмотр/Сохранить/Далее через AnketaTabHandle)
              // и «Контента» (Далее с flush через registerFlush) переехали СЮДА,
              // собственных нижних рядов у редакторов больше нет.
              const isAnketa = activeTab === "anketa"
              const isContent = activeTab === "content"
              const showNext = !!nextStep
              return (
                <VacancyTabFooter
                  onAllVacancies={() => router.push("/hr/vacancies")}
                  prevLabel={prevStep?.label ?? null}
                  onPrev={prevStep ? () => goToVacancyStep(prevStep) : undefined}
                  nextLabel={showNext ? nextStep!.label : null}
                  onNext={showNext
                    ? async () => {
                        if (isAnketa) await anketaHandle?.save()
                        if (isContent) contentFlushRef.current?.()
                        goToVacancyStep(nextStep!)
                      }
                    : undefined}
                  showSave={isAnketa}
                  onSave={isAnketa ? async () => { await anketaHandle?.save() } : undefined}
                  saving={isAnketa ? anketaSaving : undefined}
                  extraButtons={isAnketa ? (
                    <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs" onClick={() => anketaHandle?.openPreview()}>
                      <Eye className="w-3.5 h-3.5" />
                      Предпросмотр вакансии
                    </Button>
                  ) : undefined}
                  // Юрий 03.07 (финал №2): единая фиксированная позиция кнопок
                  // на всех табах — правый край max-w-6xl, не ширина контента.
                  className="max-w-5xl"
                />
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
            <DialogTitle>Заполнить из hh.ru</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Вставьте ссылку на вакансию с hh.ru — или нажмите значок справа, чтобы открыть hh.ru и выбрать вакансию там.</p>
            <div className="flex items-center gap-2">
              <Input
                value={hhImportUrl}
                onChange={(e) => setHhImportUrl(e.target.value)}
                placeholder="Ссылка на вакансию с hh.ru (например https://hh.ru/vacancy/12345678)"
                className="h-10 text-sm flex-1"
                autoFocus
                disabled={hhImportBusy}
                onKeyDown={(e) => { if (e.key === "Enter" && hhImportUrl.trim() && !hhImportBusy) handleHhVacancyImport() }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                title="Открыть hh.ru — найти вакансию и скопировать ссылку"
                onClick={() => window.open("https://hh.ru/employer/vacancies", "_blank", "noopener,noreferrer")}
                disabled={hhImportBusy}
              >
                <ExternalLink className="size-4" />
              </Button>
            </div>
            <label className="flex items-start gap-2.5 rounded-md border p-3 cursor-pointer select-none">
              <Checkbox
                checked={hhImportBind}
                onCheckedChange={(v) => setHhImportBind(v === true)}
                disabled={hhImportBusy}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-medium">Привязать вакансию</span>
                <span className="block text-muted-foreground">Платформа начнёт получать отклики с этой вакансии hh.ru. Если снять — поля просто заполнятся, привязать можно позже вручную.</span>
              </span>
            </label>
            <Button className="w-full h-10" onClick={handleHhVacancyImport} disabled={hhImportBusy || !hhImportUrl.trim()}>
              {hhImportBusy ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Заполнение...</> : <><Globe className="size-4 mr-1.5" />Заполнить</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Q3: Новая компания из hh ── */}
      <Dialog open={!!newBrandPrompt} onOpenChange={(o) => { if (!o && !addBrandBusy) setNewBrandPrompt(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая компания из hh</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">На hh указана компания <span className="font-medium">«{newBrandPrompt?.name}»</span> — её нет в вашем списке. Добавить в компании (Настройки HR) и выбрать для этой вакансии?</p>
            {newBrandPrompt?.description && (
              <p className="text-xs text-muted-foreground line-clamp-4 border rounded-md p-2 bg-muted/30 whitespace-pre-line">{newBrandPrompt.description}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setNewBrandPrompt(null)} disabled={addBrandBusy}>Не сейчас</Button>
              <Button onClick={handleAddBrandCompany} disabled={addBrandBusy}>
                {addBrandBusy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}Добавить компанию
              </Button>
            </div>
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

      {/* Подтверждение закрытия вакансии — с опцией «отказать оставшимся». */}
      <AlertDialog open={closeDialogOpen} onOpenChange={(o) => !closeBusy && setCloseDialogOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть вакансию?</AlertDialogTitle>
            <AlertDialogDescription>
              Вакансия будет закрыта и перенесена в архив.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 px-1 py-2 text-sm cursor-pointer">
            <Checkbox
              checked={closeRejectRemaining}
              onCheckedChange={(v) => setCloseRejectRemaining(v === true)}
              className="mt-0.5"
            />
            <span>
              Также отказать оставшимся активным кандидатам
              <span className="block text-xs text-muted-foreground">
                Кандидатам без решения будет запланирован отказ (уже принятых и кандидатов в оффере не затронет)
              </span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeBusy}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleCloseVacancyConfirm() }} disabled={closeBusy}>
              {closeBusy ? "Закрываем..." : "Закрыть"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          if (!open) {
            setDrawerCandidateId(null)
            // Диплинк ?candidate= (из виджета «Чаты») оставался в URL после
            // закрытия — и карточка «сама выскакивала» при каждом обновлении
            // страницы (Юрий 03.07). Закрыли карточку — чистим параметр.
            if (candidateFromUrl && typeof window !== "undefined") {
              const url = new URL(window.location.href)
              url.searchParams.delete("candidate")
              window.history.replaceState(null, "", url.pathname + url.search + url.hash)
            }
          }
        }}
        initialTab={drawerInitialTab}
        onToggleFavorite={handleToggleFavorite}
        vacancyAnketa={drawerAnketa}
        vacancyPipeline={vacancyPipeline}
        defaultInterviewMode={defaultInterviewMode}
        // #42: единый источник списка стадий (воронка v2 → pipeline) — тот же,
        // что и в секции «Статус в воронке» фильтра.
        stageOptions={stageOptions}
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

      {/* Окно подтверждения «Пригласить на интервью» для advance (список/канбан) —
          Юрий 03.07: не переводить молча, когда следующая стадия = interview. */}
      <InterviewInviteConfirm
        open={interviewConfirmOpen}
        onOpenChange={(o) => {
          setInterviewConfirmOpen(o)
          if (!o) {
            setInterviewConfirmCandidateId(null)
            setInterviewConfirmCandidateName("")
            interviewConfirmApplyRef.current = null
          }
        }}
        candidateId={interviewConfirmCandidateId}
        candidateName={interviewConfirmCandidateName}
        defaultInterviewMode={defaultInterviewMode}
        onConfirm={async (opts) => {
          await interviewConfirmApplyRef.current?.(opts)
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

      {/* Диалог-мастер «Рассылка через hh»: полу-ручная отправка по одному. */}
      <HhBroadcastDialog
        open={hhBroadcastOpen}
        onOpenChange={(o) => {
          setHhBroadcastOpen(o)
          // После рассылки обновляем список — чтобы в колонке «Тест» появилось «отп.».
          if (!o) void (useListPaginated ? paginated.refetch() : refetchCandidates())
        }}
        // Сразу после отметки «тест отправлен» (маркер уже в БД) — обновляем список,
        // чтобы «отп.» появилось без ожидания закрытия окна.
        onSent={() => { void (useListPaginated ? paginated.refetch() : refetchCandidates()) }}
        vacancyId={id}
        candidateIds={hhBroadcastIds}
      />

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

      {/* ТЗ №3: применение шаблона роли к вакансии */}
      <ApplyRoleTemplateDialog
        vacancyId={id}
        open={applyTemplateOpen}
        onOpenChange={setApplyTemplateOpen}
        onApplied={() => { refetchVacancy(); refreshHealth() }}
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
    description: string
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
