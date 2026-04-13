"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useVacancies, type ApiVacancy } from "@/hooks/use-vacancies"
import {
  Plus, Briefcase, MapPin, List, LayoutGrid, Table2, Calendar, Banknote,
  Search, MoreHorizontal, Pencil, Copy, Archive, Trash2, ListFilter,
  RotateCcw, X, Upload, FileText, Loader2, CheckCircle2, Sparkles,
  ClipboardPaste, Globe, PenLine, ArrowLeft, Mic, MicOff, MessageCircle, Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активна",
  paused: "Приостановлена",
  closed_success: "Закрыта (найден)",
  closed_cancelled: "Закрыта (отменена)",
}

const STATUS_COLORS: Record<string, string> = {
  draft:             "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  active:            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  paused:            "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  closed_success:    "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  closed_cancelled:  "bg-red-500/15 text-red-700 dark:text-red-400",
}

const STATUS_ORDER: Record<string, number> = {
  active: 0, draft: 1, paused: 2, closed_success: 3, closed_cancelled: 4,
}

const STATUS_FILTER_OPTIONS = [
  { value: "all",              label: "Все статусы" },
  { value: "draft",            label: "Черновик" },
  { value: "active",           label: "Активна" },
  { value: "paused",           label: "Приостановлена" },
  { value: "closed_success",   label: "Закрыта (найден)" },
  { value: "closed_cancelled", label: "Закрыта (отменена)" },
]

type ViewMode = "list" | "tiles" | "table"
type ColumnSort = { column: string; dir: "asc" | "desc" } | null

const VIEW_MODES: { value: ViewMode; icon: typeof List; label: string }[] = [
  { value: "list",  icon: List,       label: "Список" },
  { value: "tiles", icon: LayoutGrid, label: "Плитки" },
  { value: "table", icon: Table2,     label: "Таблица" },
]

const FILTER_INPUT = "h-10 text-sm border border-gray-300 rounded-lg"

// Roles that always see trash (vacancies_delete: "full" in permission matrix)
const TRASH_ROLES_ALWAYS = ["platform_admin", "platform_manager", "director", "hr_lead", "admin"]
// Additional role that can see trash if enabled in settings
const TRASH_ROLE_OPTIONAL = "hr_manager"
const TRASH_ACCESS_KEY = "mk_trash_access_hr_manager"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string | null {
  const fmt = (n: number) => n.toLocaleString("ru-RU")
  if (min && max) return `${fmt(min)} — ${fmt(max)} ₽`
  if (min) return `от ${fmt(min)} ₽`
  if (max) return `до ${fmt(max)} ₽`
  return null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
}

// ─── Shared components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "draft"
  return (
    <Badge variant="outline" className={cn("border-0 text-xs shrink-0", STATUS_COLORS[s])}>
      {STATUS_LABELS[s] ?? s}
    </Badge>
  )
}

function HrAvatar({ name }: { name: string }) {
  const isUnassigned = !name || name === "Не назначен"
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px] bg-muted">
          {isUnassigned ? "?" : getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground">{isUnassigned ? "Не назначен" : name}</span>
    </div>
  )
}

function getHrName(createdBy: string, team: TeamMember[]): string {
  const member = team.find((m) => m.id === createdBy)
  return member?.name ?? "Не назначен"
}

/** Sortable column header with funnel icon */
function SortableHeader({
  label, column, current, onToggle,
}: {
  label: string
  column: string
  current: ColumnSort
  onToggle: (col: string) => void
}) {
  const isActive = current?.column === column
  const dir = isActive ? current.dir : null

  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold select-none transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <ListFilter
        className={cn(
          "size-4 transition-transform",
          dir === "desc" && "scale-y-[-1]",
          !isActive && "opacity-40",
        )}
      />
      {label}
    </button>
  )
}

// ─── Row actions ─────────────────────────────────────────────────────────────

function RowActions({
  v, onDuplicate, onArchive, onDelete,
}: {
  v: ApiVacancy
  onDuplicate: (v: ApiVacancy) => void
  onArchive: (v: ApiVacancy) => void
  onDelete: (v: ApiVacancy) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.location.href = `/hr/vacancies/${v.id}/edit` }}>
          <Pencil className="size-4 mr-2" />Редактировать
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(v) }}>
          <Copy className="size-4 mr-2" />Дублировать
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(v) }}>
          <Archive className="size-4 mr-2" />В архив
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(v) }}
        >
          <Trash2 className="size-4 mr-2" />В корзину
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── List view ───────────────────────────────────────────────────────────────

function VacancyListItem({ v, selected, onToggle, team, actions }: {
  v: ApiVacancy; selected: boolean; onToggle: () => void; team: TeamMember[]
  actions: { onDuplicate: (v: ApiVacancy) => void; onArchive: (v: ApiVacancy) => void; onDelete: (v: ApiVacancy) => void }
}) {
  const salary = formatSalary(v.salaryMin, v.salaryMax)
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card transition-colors group">
      <Checkbox checked={selected} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} className="shrink-0" />
      <Link href={`/hr/vacancies/${v.id}`} className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Briefcase className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{v.title}</p>
          <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
            {v.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{v.city}</span>}
            {salary && <span className="flex items-center gap-1"><Banknote className="size-3.5" />{salary}</span>}
            <span className="flex items-center gap-1"><Calendar className="size-3.5" />{formatDate(v.createdAt)}</span>
          </div>
        </div>
        <HrAvatar name={getHrName(v.createdBy, team)} />
        <StatusBadge status={v.status} />
      </Link>
      <RowActions v={v} {...actions} />
    </div>
  )
}

// ─── Tiles view ──────────────────────────────────────────────────────────────

function VacancyTile({ v, selected, onToggle, team, actions }: {
  v: ApiVacancy; selected: boolean; onToggle: () => void; team: TeamMember[]
  actions: { onDuplicate: (v: ApiVacancy) => void; onArchive: (v: ApiVacancy) => void; onDelete: (v: ApiVacancy) => void }
}) {
  const salary = formatSalary(v.salaryMin, v.salaryMax)
  return (
    <div className="flex flex-col p-4 rounded-lg border border-border bg-card transition-colors group relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggle} className="shrink-0" />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Briefcase className="size-4" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={v.status} />
          <RowActions v={v} {...actions} />
        </div>
      </div>
      <Link href={`/hr/vacancies/${v.id}`} className="flex-1">
        <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors mb-1">{v.title}</p>
        <div className="space-y-1 text-sm text-muted-foreground mb-3">
          {v.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{v.city}</span>}
          {salary && <span className="flex items-center gap-1"><Banknote className="size-3.5" />{salary}</span>}
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
        <HrAvatar name={getHrName(v.createdBy, team)} />
        <span className="text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function VacanciesPage() {
  const router = useRouter()
  const { role } = useAuth()
  const { vacancies, total, loading, refetch } = useVacancies(1, 50)
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table"
    const stored = window.localStorage.getItem("vacancies-view")
    return stored === "list" || stored === "tiles" || stored === "table" ? stored : "table"
  })
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("vacancies-view", view)
  }, [view])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [hrFilter, setHrFilter] = useState("all")
  const [colSort, setColSort] = useState<ColumnSort>({ column: "date", dir: "desc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [deleteTarget, setDeleteTarget] = useState<ApiVacancy | null>(null)
  // Trash
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashItems, setTrashItems] = useState<ApiVacancy[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ApiVacancy | null>(null)
  // Create vacancy wizard
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createMode, setCreateMode] = useState<"choose" | "file" | "text" | "url" | "manual" | "voice" | "chat">("choose")
  const [newVacancyTitle, setNewVacancyTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [uploadedFile, setUploadedFile] = useState<{ name: string; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [aiText, setAiText] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [aiProgress, setAiProgress] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Voice input
  const [recording, setRecording] = useState(false)
  const [voiceText, setVoiceText] = useState("")
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<unknown>(null)
  // Chat with Nancy
  const [chatMessages, setChatMessages] = useState<{ role: "nancy" | "user"; text: string }[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatStep, setChatStep] = useState(0)
  const [chatLoading, setChatLoading] = useState(false)
  const chatCollected = useRef<Record<string, string>>({})

  const resetCreateDialog = useCallback(() => {
    setCreateMode("choose")
    setNewVacancyTitle("")
    setImportUrl("")
    setUploadedFile(null)
    setAiText("")
    setAiProgress("")
    setVoiceText("")
    setRecording(false)
    setChatMessages([])
    setChatInput("")
    setChatStep(0)
    chatCollected.current = {}
  }, [])

  const handleFileUpload = useCallback(async (file: File) => {
    const name = file.name.toLowerCase()
    if (!name.endsWith(".txt") && !name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".doc")) {
      toast.error("Неподдерживаемый формат. Используйте DOCX, PDF или TXT")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Файл слишком большой (максимум 50 МБ)")
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/modules/hr/vacancies/parse-file", { method: "POST", body: formData })
      const data = await res.json() as { text?: string; fileName?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Ошибка")
      setUploadedFile({ name: file.name, text: data.text ?? "" })
      const titleFromFile = file.name.replace(/\.(docx?|pdf|txt)$/i, "").trim()
      if (titleFromFile && newVacancyTitle.trim().length < 3) {
        setNewVacancyTitle(titleFromFile)
      }
      toast.success(`Файл "${file.name}" обработан`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка обработки файла")
    } finally {
      setUploading(false)
    }
  }, [newVacancyTitle])

  // Create vacancy with AI text → parse → create in DB → redirect
  const createWithAiText = useCallback(async (text: string, title: string, importedFrom?: Record<string, unknown>) => {
    setCreating(true)
    setAiProgress("AI анализирует текст...")
    try {
      // Step 1: AI parse
      setAiProgress("Извлекаю обязанности и требования...")
      const aiRes = await fetch("/api/ai/parse-vacancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!aiRes.ok) throw new Error("AI-парсинг не удался")
      const aiData = (await aiRes.json()) as { data: Record<string, unknown> }
      const parsed = aiData.data

      // Step 2: Build description_json
      setAiProgress("Создаю вакансию...")
      const finalTitle = title.trim() || String(parsed.positionTitle || "Новая вакансия")
      const descriptionJson: Record<string, unknown> = {
        anketa: {
          vacancyTitle: finalTitle,
          positionCategory: parsed.positionCategory || "",
          workFormats: parsed.workFormats || [],
          employment: parsed.employment || [],
          positionCity: parsed.positionCity || "",
          salaryFrom: parsed.salaryFrom || "",
          salaryTo: parsed.salaryTo || "",
          bonus: parsed.bonus || "",
          responsibilities: parsed.responsibilities || "",
          requirements: parsed.requirements || "",
          requiredSkills: parsed.requiredSkills || [],
          desiredSkills: parsed.desiredSkills || [],
          unacceptableSkills: parsed.unacceptableSkills || [],
          experienceMin: parsed.experienceMin || "",
          experienceIdeal: parsed.experienceIdeal || "",
          conditions: parsed.conditions || [],
          screeningQuestions: parsed.screeningQuestions || [],
          hhDescription: parsed.hhDescription || "",
        },
        ...(importedFrom ? { importedFrom } : {}),
      }

      // Step 3: Create vacancy
      const res = await fetch("/api/modules/hr/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: finalTitle, description_json: descriptionJson }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { id: string }
      setCreateDialogOpen(false)
      resetCreateDialog()
      toast.success("Вакансия создана — проверьте анкету")
      router.push(`/hr/vacancies/${data.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
      toast.error(`Не удалось создать вакансию: ${msg}`)
    } finally {
      setCreating(false)
      setAiProgress("")
    }
  }, [router, resetCreateDialog])

  // Handle create depending on mode
  const handleCreateVacancy = useCallback(async () => {
    if (createMode === "manual") {
      if (!newVacancyTitle.trim()) { toast.error("Введите название вакансии"); return }
      setCreating(true)
      try {
        const res = await fetch("/api/modules/hr/vacancies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newVacancyTitle.trim() }),
        })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(errBody.error || `HTTP ${res.status}`)
        }
        const data = await res.json() as { id: string }
        setCreateDialogOpen(false)
        resetCreateDialog()
        toast.success("Вакансия создана — заполните анкету")
        router.push(`/hr/vacancies/${data.id}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
        toast.error(`Не удалось создать вакансию: ${msg}`)
      } finally {
        setCreating(false)
      }
      return
    }

    if (createMode === "file") {
      if (!uploadedFile?.text) { toast.error("Загрузите файл"); return }
      await createWithAiText(uploadedFile.text, newVacancyTitle, { type: "file", fileName: uploadedFile.name })
      return
    }

    if (createMode === "text") {
      if (!aiText.trim()) { toast.error("Вставьте текст вакансии"); return }
      await createWithAiText(aiText.trim(), newVacancyTitle)
      return
    }

    if (createMode === "voice") {
      if (!voiceText.trim()) { toast.error("Надиктуйте описание вакансии"); return }
      await createWithAiText(voiceText.trim(), newVacancyTitle)
      return
    }

    if (createMode === "url") {
      if (!importUrl.trim()) { toast.error("Введите ссылку"); return }
      setCreating(true)
      setAiProgress("Загружаю страницу...")
      try {
        const urlRes = await fetch("/api/core/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: importUrl.trim() }),
        })
        if (!urlRes.ok) {
          const errBody = await urlRes.json().catch(() => ({})) as { error?: string }
          throw new Error(errBody.error || "Не удалось загрузить страницу")
        }
        const urlData = (await urlRes.json()) as { text: string }
        await createWithAiText(urlData.text, newVacancyTitle, { type: "url", url: importUrl.trim() })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Неизвестная ошибка"
        toast.error(msg)
        setCreating(false)
        setAiProgress("")
      }
    }
  }, [createMode, newVacancyTitle, uploadedFile, aiText, importUrl, router, resetCreateDialog, createWithAiText])

  // ── Voice recording ──
  const startRecording = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setVoiceSupported(false); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any
    recognition.lang = "ru-RU"
    recognition.continuous = true
    recognition.interimResults = true
    let finalText = voiceText
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + " "
        } else {
          interim += event.results[i][0].transcript
        }
      }
      setVoiceText(finalText + interim)
    }
    recognition.onerror = () => { setRecording(false) }
    recognition.onend = () => { setRecording(false) }
    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
  }, [voiceText])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any).stop()
    }
    setRecording(false)
  }, [])

  // ── Chat with Nancy ──
  const CHAT_QUESTIONS = [
    "Как называется должность?",
    "Что будет делать сотрудник? Опишите основные обязанности.",
    "Какой опыт и навыки нужны?",
    "В каком городе и формате работы? (офис/удалённо/гибрид)",
    "Какая зарплатная вилка? (например: 80 000 – 150 000)",
    "Какие условия предлагаете? (ДМС, обучение, бонусы и т.д.)",
  ]
  const CHAT_KEYS = ["title", "responsibilities", "requirements", "cityFormat", "salary", "conditions"]

  const initChat = useCallback(() => {
    setChatMessages([{ role: "nancy", text: `Привет! Давайте создадим вакансию. ${CHAT_QUESTIONS[0]}` }])
    setChatStep(0)
    chatCollected.current = {}
  }, [])

  const sendChatMessage = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput("")

    // Save user answer
    const key = CHAT_KEYS[chatStep]
    chatCollected.current[key] = msg
    setChatMessages(prev => [...prev, { role: "user", text: msg }])

    const nextStep = chatStep + 1
    if (nextStep < CHAT_QUESTIONS.length) {
      // Ask next question
      setChatStep(nextStep)
      setTimeout(() => {
        setChatMessages(prev => [...prev, { role: "nancy", text: CHAT_QUESTIONS[nextStep] }])
      }, 500)
    } else {
      // All questions asked — build text and create
      setChatLoading(true)
      const d = chatCollected.current
      const text = [
        d.title && `Должность: ${d.title}`,
        d.responsibilities && `Обязанности: ${d.responsibilities}`,
        d.requirements && `Требования: ${d.requirements}`,
        d.cityFormat && `Город/формат: ${d.cityFormat}`,
        d.salary && `Зарплата: ${d.salary}`,
        d.conditions && `Условия: ${d.conditions}`,
      ].filter(Boolean).join("\n")

      setTimeout(() => {
        setChatMessages(prev => [...prev, { role: "nancy", text: "Отлично! Создаю вакансию с AI-заполнением..." }])
      }, 500)

      await createWithAiText(text, d.title || "")
      setChatLoading(false)
    }
  }, [chatInput, chatStep, createWithAiText])

  const hrManagerTrashEnabled = typeof window !== "undefined" && localStorage.getItem(TRASH_ACCESS_KEY) === "true"
  const canSeeTrash = TRASH_ROLES_ALWAYS.includes(role) || (role === TRASH_ROLE_OPTIONAL && hrManagerTrashEnabled)

  const fetchTrash = useCallback(async () => {
    setTrashLoading(true)
    try {
      const res = await fetch("/api/modules/hr/vacancies?deleted=true&limit=50")
      if (!res.ok) throw new Error()
      const data = await res.json() as { vacancies: ApiVacancy[] }
      setTrashItems(data.vacancies ?? [])
    } catch { setTrashItems([]) }
    finally { setTrashLoading(false) }
  }, [])

  const handleRestore = useCallback(async (v: ApiVacancy) => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, { method: "PATCH" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия восстановлена")
      fetchTrash()
      refetch()
    } catch { toast.error("Не удалось восстановить") }
  }, [fetchTrash, refetch])

  const handlePermanentDelete = useCallback(async () => {
    if (!permanentDeleteTarget) return
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${permanentDeleteTarget.id}/permanent`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия удалена навсегда")
      fetchTrash()
    } catch { toast.error("Не удалось удалить") }
    finally { setPermanentDeleteTarget(null) }
  }, [permanentDeleteTarget, fetchTrash])

  // Open trash panel
  const openTrash = useCallback(() => {
    setTrashOpen(true)
    fetchTrash()
  }, [fetchTrash])

  // Fetch trash count on mount
  useEffect(() => {
    if (canSeeTrash) fetchTrash()
  }, [canSeeTrash, fetchTrash])

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: TeamMember[] | { data: TeamMember[] }) => {
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setTeamMembers(list)
      })
      .catch(() => {})
  }, [])

  const toggleColSort = (column: string) => {
    setColSort((prev) => {
      if (prev?.column !== column) return { column, dir: "asc" }
      if (prev.dir === "asc") return { column, dir: "desc" }
      return null
    })
  }

  // ── Actions ──────────────────────────────────────────────────
  const handleDuplicate = useCallback(async (v: ApiVacancy) => {
    try {
      const res = await fetch("/api/modules/hr/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${v.title} (копия)`,
          city: v.city,
          format: v.format,
          employment: v.employment,
          category: v.category,
          salary_min: v.salaryMin,
          salary_max: v.salaryMax,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия дублирована")
      refetch()
    } catch {
      toast.error("Не удалось дублировать вакансию")
    }
  }, [refetch])

  const handleArchive = useCallback(async (v: ApiVacancy) => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия перемещена в архив")
      refetch()
    } catch {
      toast.error("Не удалось архивировать вакансию")
    }
  }, [refetch])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия перемещена в корзину")
      setSelected((prev) => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      refetch()
    } catch {
      toast.error("Не удалось удалить вакансию")
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, refetch])

  const actions = { onDuplicate: handleDuplicate, onArchive: handleArchive, onDelete: setDeleteTarget }

  // ── Filter & sort ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = vacancies

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((v) => v.title.toLowerCase().includes(q))
    }
    if (statusFilter !== "all") {
      result = result.filter((v) => v.status === statusFilter)
    }
    if (hrFilter !== "all") {
      result = result.filter((v) => v.createdBy === hrFilter)
    }

    result = [...result].sort((a, b) => {
      if (!colSort) return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      const mul = colSort.dir === "asc" ? 1 : -1
      if (colSort.column === "status") return mul * ((STATUS_ORDER[a.status ?? "draft"] ?? 9) - (STATUS_ORDER[b.status ?? "draft"] ?? 9))
      if (colSort.column === "date") return mul * (new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
      if (colSort.column === "hr") return mul * getHrName(a.createdBy, teamMembers).localeCompare(getHrName(b.createdBy, teamMembers), "ru")
      return 0
    })

    return result
  }, [vacancies, search, statusFilter, hrFilter, colSort, teamMembers])

  const allSelected = filtered.length > 0 && filtered.every((v) => selected.has(v.id))
  const toggleOne = (id: string) => { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleAll = () => { allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map((v) => v.id))) }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-semibold text-foreground">Вакансии</h1>
                {!loading && <p className="text-sm text-muted-foreground mt-0.5">{total} вакансий</p>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                  {VIEW_MODES.map((m) => (
                    <button key={m.value} type="button" onClick={() => setView(m.value)} title={m.label}
                      className={cn("flex items-center justify-center size-8 rounded-md transition-colors",
                        view === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}>
                      <m.icon className="size-4" />
                    </button>
                  ))}
                </div>
                {canSeeTrash && (
                  <button type="button" onClick={openTrash} title="Корзина"
                    className="relative flex items-center justify-center size-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors">
                    <Trash2 className="size-4" />
                    {trashItems.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center size-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                        {trashItems.length}
                      </span>
                    )}
                  </button>
                )}
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="size-4 mr-1.5" />Создать вакансию
                </Button>
              </div>
            </div>

            {/* Toolbar */}
            {!loading && vacancies.length > 0 && (<>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 basis-1/2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Поиск по названию..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className={cn("pl-9", FILTER_INPUT)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className={cn("flex-1 basis-1/4", FILTER_INPUT)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={hrFilter} onValueChange={setHrFilter}>
                  <SelectTrigger className={cn("flex-1 basis-1/4", FILTER_INPUT)}><SelectValue placeholder="Все HR" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все HR</SelectItem>
                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selected.size > 0 && <div className="text-xs text-muted-foreground mb-2">Выбрано: {selected.size}</div>}
            </>)}

            {/* Loading */}
            {loading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )}

            {/* Empty */}
            {!loading && vacancies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Briefcase className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Вакансий пока нет</p>
                <p className="text-sm text-muted-foreground/60 mt-1 mb-4">Создайте первую вакансию чтобы начать найм</p>
                <Button onClick={() => setCreateDialogOpen(true)}><Plus className="size-4 mr-1.5" />Создать вакансию</Button>
              </div>
            )}

            {/* No results */}
            {!loading && vacancies.length > 0 && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">Ничего не найдено</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Попробуйте изменить фильтры</p>
              </div>
            )}

            {/* List */}
            {!loading && filtered.length > 0 && view === "list" && (
              <div className="space-y-2">
                {filtered.map((v) => <VacancyListItem key={v.id} v={v} selected={selected.has(v.id)} onToggle={() => toggleOne(v.id)} team={teamMembers} actions={actions} />)}
              </div>
            )}

            {/* Tiles */}
            {!loading && filtered.length > 0 && view === "tiles" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((v) => <VacancyTile key={v.id} v={v} selected={selected.has(v.id)} onToggle={() => toggleOne(v.id)} team={teamMembers} actions={actions} />)}
              </div>
            )}

            {/* Table */}
            {!loading && filtered.length > 0 && view === "table" && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="pl-5 pr-2 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Вакансия</th>
                      <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Город</th>
                      <th className="px-4 py-3"><SortableHeader label="Статус" column="status" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Создана" column="date" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="px-4 py-3"><SortableHeader label="Менеджер" column="hr" current={colSort} onToggle={toggleColSort} /></th>
                      <th className="pl-2 pr-5 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v, i) => (
                      <tr key={v.id}
                        className={cn("transition-colors cursor-pointer hover:bg-accent/40",
                          selected.has(v.id) && "bg-primary/[0.04]",
                          i < filtered.length - 1 && "border-b border-border/60",
                        )}
                        onClick={() => router.push(`/hr/vacancies/${v.id}`)}>
                        <td className="pl-5 pr-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleOne(v.id)} />
                        </td>
                        <td className="px-4 py-3.5 font-medium text-sm text-foreground">{v.title}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{v.city ?? "—"}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(v.createdAt)}</td>
                        <td className="px-4 py-3.5"><HrAvatar name={getHrName(v.createdBy, teamMembers)} /></td>
                        <td className="pl-2 pr-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <RowActions v={v} {...actions} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      {/* Soft delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Переместить в корзину?</AlertDialogTitle>
            <AlertDialogDescription>
              Вакансия «{deleteTarget?.title}» будет перемещена в корзину. Вы сможете восстановить её позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              В корзину
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete confirmation */}
      <AlertDialog open={!!permanentDeleteTarget} onOpenChange={(open) => !open && setPermanentDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              Вакансия «{permanentDeleteTarget?.title}» будет удалена безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trash panel */}
      <Sheet open={trashOpen} onOpenChange={setTrashOpen}>
        <SheetContent className="w-[420px] sm:w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="size-5" />
              Корзина
              {trashItems.length > 0 && (
                <Badge variant="secondary" className="text-xs">{trashItems.length}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto mt-4">
            {trashLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            )}
            {!trashLoading && trashItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Trash2 className="size-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Корзина пуста</p>
              </div>
            )}
            {!trashLoading && trashItems.length > 0 && (
              <div className="space-y-2">
                {trashItems.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.city ?? "—"}{v.deletedAt ? ` · Удалена ${formatDate(v.deletedAt)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 h-8 gap-1.5 text-xs" onClick={() => handleRestore(v)}>
                      <RotateCcw className="size-3.5" />Восстановить
                    </Button>
                    <Button size="sm" variant="ghost" className="shrink-0 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setPermanentDeleteTarget(v)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Create vacancy dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetCreateDialog() }}>
        <DialogContent className="sm:max-w-xl">
          {/* AI progress overlay */}
          {creating && aiProgress && (
            <div className="absolute inset-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-8 text-primary animate-spin" />
                <p className="text-sm font-medium">{aiProgress}</p>
              </div>
            </div>
          )}

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createMode !== "choose" && (
                <button type="button" onClick={() => { setCreateMode("choose"); setUploadedFile(null); setAiText(""); setImportUrl("") }} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="size-4" />
                </button>
              )}
              {createMode === "choose" && "Как создать вакансию?"}
              {createMode === "file" && "Загрузить файл"}
              {createMode === "text" && "Вставить текст"}
              {createMode === "url" && "Импорт по ссылке"}
              {createMode === "manual" && "Создать вручную"}
              {createMode === "voice" && "Надиктовать"}
              {createMode === "chat" && "Чат с Ненси"}
            </DialogTitle>
          </DialogHeader>

          {/* ── Step 1: Choose mode ── */}
          {createMode === "choose" && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <button type="button" onClick={() => setCreateMode("file")}
                className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-center group">
                <div className="flex items-center justify-center size-11 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 group-hover:scale-110 transition-transform">
                  <FileText className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Загрузить файл</p>
                  <p className="text-xs text-muted-foreground mt-0.5">DOCX, PDF или TXT — AI заполнит анкету</p>
                </div>
              </button>

              <button type="button" onClick={() => setCreateMode("text")}
                className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-center group">
                <div className="flex items-center justify-center size-11 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-600 group-hover:scale-110 transition-transform">
                  <ClipboardPaste className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Вставить текст</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Скопируйте описание вакансии или должности</p>
                </div>
              </button>

              <button type="button" onClick={() => setCreateMode("url")}
                className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-center group">
                <div className="flex items-center justify-center size-11 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 group-hover:scale-110 transition-transform">
                  <Globe className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Вставить ссылку</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ссылка на hh.ru или другой сайт</p>
                </div>
              </button>

              <button type="button" onClick={() => { setCreateMode("voice"); setVoiceText("") }}
                className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-center group">
                <div className="flex items-center justify-center size-11 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 group-hover:scale-110 transition-transform">
                  <Mic className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Надиктовать</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Расскажите голосом — AI заполнит анкету</p>
                </div>
              </button>

              <button type="button" onClick={() => { setCreateMode("chat"); initChat() }}
                className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-center group">
                <div className="flex items-center justify-center size-11 rounded-lg bg-pink-50 dark:bg-pink-950/30 text-pink-600 group-hover:scale-110 transition-transform">
                  <MessageCircle className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Чат с Ненси</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ненси задаст вопросы и заполнит анкету</p>
                </div>
              </button>

              <button type="button" onClick={() => setCreateMode("manual")}
                className="flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-center group col-span-2">
                <div className="flex items-center justify-center size-11 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 group-hover:scale-110 transition-transform">
                  <PenLine className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Заполнить вручную</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Создать пустую анкету</p>
                </div>
              </button>
            </div>
          )}

          {/* ── Mode: File upload ── */}
          {createMode === "file" && (
            <div className="space-y-4 py-2">
              <input ref={fileInputRef} type="file" accept=".docx,.doc,.pdf,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = "" }} />
              {uploadedFile ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 break-all">{uploadedFile.name}</span>
                  <button type="button" onClick={() => setUploadedFile(null)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button type="button"
                  className={cn(
                    "w-full h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors",
                    dragOver ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary",
                    uploading && "pointer-events-none opacity-60",
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
                >
                  {uploading ? <Loader2 className="size-6 animate-spin" /> : (
                    <>
                      <Upload className="size-6" />
                      <span className="text-sm">Перетащите файл или нажмите</span>
                      <span className="text-xs opacity-60">DOCX, PDF, TXT (до 50 МБ)</span>
                    </>
                  )}
                </button>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Название вакансии <span className="text-muted-foreground font-normal">(необязательно — AI определит из файла)</span></Label>
                <Input value={newVacancyTitle} onChange={(e) => setNewVacancyTitle(e.target.value)} placeholder="Менеджер по продажам" className="h-10 border border-input" maxLength={50} />
              </div>
              <Button className="w-full h-10" onClick={handleCreateVacancy} disabled={creating || !uploadedFile}>
                {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Sparkles className="size-4 mr-1.5" />}
                Создать с AI-заполнением
              </Button>
            </div>
          )}

          {/* ── Mode: Paste text ── */}
          {createMode === "text" && (
            <div className="space-y-4 py-2">
              <Textarea value={aiText} onChange={(e) => setAiText(e.target.value)}
                placeholder="Вставьте описание вакансии, должностные обязанности или любой текст о позиции..."
                className="h-40 bg-[var(--input-bg)] border border-input resize-none text-sm" autoFocus />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Название вакансии <span className="text-muted-foreground font-normal">(необязательно — AI определит из текста)</span></Label>
                <Input value={newVacancyTitle} onChange={(e) => setNewVacancyTitle(e.target.value)} placeholder="Менеджер по продажам" className="h-10 border border-input" maxLength={50} />
              </div>
              <Button className="w-full h-10" onClick={handleCreateVacancy} disabled={creating || !aiText.trim()}>
                {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Sparkles className="size-4 mr-1.5" />}
                Создать с AI-заполнением
              </Button>
            </div>
          )}

          {/* ── Mode: URL import ── */}
          {createMode === "url" && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ссылка на вакансию</Label>
                <Input value={importUrl} onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://hh.ru/vacancy/12345678" className="h-10 border border-input" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && importUrl.trim()) handleCreateVacancy() }} />
                <p className="text-xs text-muted-foreground">hh.ru, SuperJob, Habr Career или любой сайт с вакансией</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Название вакансии <span className="text-muted-foreground font-normal">(необязательно — AI определит со страницы)</span></Label>
                <Input value={newVacancyTitle} onChange={(e) => setNewVacancyTitle(e.target.value)} placeholder="Менеджер по продажам" className="h-10 border border-input" maxLength={50} />
              </div>
              <Button className="w-full h-10" onClick={handleCreateVacancy} disabled={creating || !importUrl.trim()}>
                {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Globe className="size-4 mr-1.5" />}
                Загрузить и создать
              </Button>
            </div>
          )}

          {/* ── Mode: Voice ── */}
          {createMode === "voice" && (
            <div className="space-y-4 py-2">
              {!voiceSupported ? (
                <div className="text-center py-6">
                  <MicOff className="size-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Ваш браузер не поддерживает голосовой ввод.</p>
                  <Button variant="link" size="sm" className="mt-2" onClick={() => setCreateMode("text")}>Используйте текстовый режим</Button>
                </div>
              ) : (
                <>
                  <div className="flex justify-center">
                    <button type="button" onClick={recording ? stopRecording : startRecording}
                      className={cn(
                        "size-20 rounded-full flex items-center justify-center transition-all",
                        recording
                          ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                          : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}>
                      {recording ? <MicOff className="size-8" /> : <Mic className="size-8" />}
                    </button>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    {recording ? "Говорите... Нажмите чтобы остановить" : "Нажмите чтобы начать запись"}
                  </p>
                  <Textarea value={voiceText} onChange={e => setVoiceText(e.target.value)}
                    placeholder="Здесь появится текст..." rows={5}
                    className="text-sm bg-[var(--input-bg)] border border-input resize-none"
                    readOnly={recording} />
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Название вакансии <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
                    <Input value={newVacancyTitle} onChange={(e) => setNewVacancyTitle(e.target.value)} placeholder="Менеджер по продажам" className="h-10 border border-input" maxLength={50} />
                  </div>
                  <Button className="w-full h-10" onClick={handleCreateVacancy} disabled={creating || !voiceText.trim() || recording}>
                    {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Sparkles className="size-4 mr-1.5" />}
                    Создать с AI-заполнением
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── Mode: Chat with Nancy ── */}
          {createMode === "chat" && (
            <div className="flex flex-col" style={{ height: 420 }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
                {chatMessages.map((m, i) => (
                  <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                    {m.role === "nancy" && (
                      <div className="size-7 rounded-full bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center shrink-0 text-xs">
                        🤖
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2 justify-start">
                    <div className="size-7 rounded-full bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center shrink-0 text-xs">🤖</div>
                    <div className="bg-muted rounded-xl px-3 py-2"><Loader2 className="size-4 animate-spin" /></div>
                  </div>
                )}
              </div>

              {/* Progress */}
              <div className="text-xs text-muted-foreground text-center py-1">
                Шаг {Math.min(chatStep + 1, CHAT_QUESTIONS.length)} из {CHAT_QUESTIONS.length}
              </div>

              {/* Input */}
              <div className="flex gap-2 pt-2 border-t">
                <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  placeholder="Ваш ответ..." className="h-10 flex-1"
                  onKeyDown={e => { if (e.key === "Enter" && !chatLoading) sendChatMessage() }}
                  disabled={chatLoading || creating} autoFocus />
                <Button size="icon" className="size-10 shrink-0" onClick={sendChatMessage} disabled={chatLoading || creating || !chatInput.trim()}>
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Mode: Manual ── */}
          {createMode === "manual" && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Название вакансии</Label>
                <Input value={newVacancyTitle} onChange={(e) => setNewVacancyTitle(e.target.value)}
                  placeholder="Менеджер по продажам" className="h-10 border border-input" maxLength={50} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && newVacancyTitle.trim()) handleCreateVacancy() }} />
              </div>
              <Button className="w-full h-10" onClick={handleCreateVacancy} disabled={creating || !newVacancyTitle.trim()}>
                {creating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
                Создать вакансию
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
