"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Users, UserPlus, Archive, XCircle, Loader2, ChevronDown, CalendarDays } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ListView, type ListSortState } from "@/components/dashboard/list-view"
import type { CardDisplaySettings } from "@/components/dashboard/card-settings"
import { CANDIDATE_COLUMN_TOGGLES } from "@/components/dashboard/card-settings"
import { CandidateDrawer, type InitialCandidateSnapshot } from "@/components/candidates/candidate-drawer"
import type { Candidate } from "@/components/dashboard/candidate-card"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Eye, RotateCcw } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { StageMessageControl } from "@/components/candidates/stage-message-control"
import { getStageLabel, ALL_STAGE_SLUGS, PLATFORM_STAGES, type StageSlug } from "@/lib/stages"
import { BulkActionsBar, type BulkAction } from "@/components/dashboard/bulk-actions-bar"
import { useAuth } from "@/lib/auth"

interface FacetsData {
  cities: { city: string; count: number }[]
  sources: { source: string; count: number }[]
  stages?: { stage: string; count: number }[]
}
import { CandidateFilters, type FilterState } from "@/components/dashboard/candidate-filters"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GlobalCandidate {
  id: string
  name: string
  vacancyId: string
  vacancyTitle: string
  stage: string
  createdAt: string
  source: string | null
  city: string | null
  demoTotalBlocks: number
  demoCompletedBlocks: number
  progressPercent: number | null
  isActive: boolean
  isFavorite: boolean
  aiScore?: number | null
  resumeScore?: number | null
  nameUncertain?: boolean
  testScore?: number | null
  testStatus?: "submitted" | "in_progress" | "opened" | "sent" | null
  nextInterviewAt?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  photoUrl?: string | null
  demoProgressJson?: unknown
}

// ─── Константы ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: CardDisplaySettings = {
  showSalary: false,
  showSalaryFull: true,
  // Все колонки включены по умолчанию (решение Юрия). Таблица плотная — на
  // узких экранах горизонтальный скролл; лишнее можно выключить в «Вид».
  showScore: true,
  showAge: false,
  showSource: true,
  showCity: true,
  showExperience: false,
  showSkills: false,
  // Колонка «Действия» включена по умолчанию — как в таблице внутри вакансии
  showActions: true,
  showProgress: true,
  showResponseDate: true,
  showResumeScore: true,
  showPortraitScore: true,
  showAnswersScore: true,
  showTestScore: true,
  showNextInterview: true,
}

const PAGE_SIZE = 50

const FILTER_INPUT = "h-10 text-sm border border-input rounded-md"

// ─── Маппинг GlobalCandidate → Candidate (для ListView) ───────────────────────

function toListCandidate(c: GlobalCandidate): Candidate & { vacancyTitle: string; vacancyId: string } {
  return {
    id: c.id,
    name: c.name,
    city: c.city ?? "",
    salaryMin: c.salaryMin ?? 0,
    salaryMax: c.salaryMax ?? 0,
    salaryCurrency: c.salaryCurrency ?? null,
    score: 50,
    progress: 0,
    source: c.source ?? "",
    experience: "",
    skills: [],
    addedAt: new Date(c.createdAt),
    lastSeen: new Date(c.createdAt),
    aiScore: c.aiScore ?? undefined,
    resumeScore: c.resumeScore ?? null,
    nameUncertain: c.nameUncertain === true,
    testScore: c.testScore ?? null,
    testStatus: c.testStatus ?? null,
    nextInterviewAt: c.nextInterviewAt ?? null,
    isActive: c.isActive,
    demoProgressJson: c.demoProgressJson as Candidate["demoProgressJson"],
    demoTotalBlocks: c.demoTotalBlocks,
    demoCompletedBlocks: c.demoCompletedBlocks,
    progressPercent: c.progressPercent,
    isFavorite: c.isFavorite,
    createdAt: c.createdAt,
    stage: c.stage,
    photoUrl: c.photoUrl ?? null,
    vacancyTitle: c.vacancyTitle,
    vacancyId: c.vacancyId,
  }
}

// ─── Компонент тумблеров вид (упрощённый, только колонки, без переключения видов) ──

function ColumnToggles({
  settings,
  onSettingsChange,
  onReset,
}: {
  settings: CardDisplaySettings
  onSettingsChange: (s: CardDisplaySettings) => void
  onReset: () => void
}) {
  const handleToggle = (key: keyof CardDisplaySettings) => {
    const next = { ...settings, [key]: settings[key] === false ? undefined : false }
    if (key === "showSalaryFull" && next.showSalaryFull) next.showSalary = false
    if (key === "showSalary" && next.showSalary) next.showSalaryFull = false
    onSettingsChange(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 shrink-0">
          <Eye className="size-4" />
          <span className="hidden sm:inline">Вид</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="end">
        <div className="space-y-2">
          {CANDIDATE_COLUMN_TOGGLES.map(({ key, label }) => {
            const checked = settings[key] !== false
            return (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-sm font-normal cursor-pointer">{label}</Label>
                <Switch
                  checked={checked}
                  onCheckedChange={() => handleToggle(key)}
                  className="scale-90"
                />
              </div>
            )
          })}
          <div className="pt-1 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs w-full gap-1.5 text-muted-foreground"
              onClick={onReset}
            >
              <RotateCcw className="size-3" />
              Сбросить
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const router = useRouter()
  const { role } = useAuth()
  // Кто может удалять кандидатов (как в карточке вакансии).
  const canDeleteCandidates = (["platform_admin", "platform_manager", "director"] as string[]).includes(role)
  // Тик для принудительного рефетча списка после массового действия.
  const [reloadTick, setReloadTick] = useState(0)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [candidates, setCandidates] = useState<GlobalCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // Поисковая строка (отдельно — быстрый debounce)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)

  // Фильтр по вакансии (главный для кросс-вакансионной работы). "all" = все.
  const [vacancyFilter, setVacancyFilter] = useState("all")
  const [allVacancyTitles, setAllVacancyTitles] = useState<string[]>([])

  // Поп-овер фильтров (CandidateFilters)
  const [filters, setFilters] = useState<FilterState>({
    searchText: "", cities: [], salaryMin: 0, salaryMax: 250000,
    scoreMin: 0, scoreMinResume: 0, scoreMinAnketa: 0,
    sources: [], workFormats: [],
    relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20,
    funnelStatuses: [],
    // По умолчанию отказы скрыты — аналогично странице вакансии
    hideRejected: true,
    hideNoSalary: false, activeNow: false, demoProgress: [],
    dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65,
    education: [], languages: [], otherLanguages: [], skills: [], industries: [],
  })

  // Дип-линк с дашборда/AI-инсайтов: ?stage=<slug> или ?funnelStatuses=<csv>
  // (+ опц. ?vacancyTitle=). Применяем фильтры один раз при загрузке.
  useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    const stage = sp.get("stage")
    const funnelCsv = sp.get("funnelStatuses")
    const vacTitle = sp.get("vacancyTitle")
    const stages = funnelCsv ? funnelCsv.split(",").filter(Boolean) : stage ? [stage] : []
    if (stages.length > 0) {
      setFilters(prev => ({
        ...prev,
        funnelStatuses: stages,
        // если запросили отказ/терминальную стадию — не прячем отказы
        hideRejected: stages.includes("rejected") || stages.includes("test_failed") ? false : prev.hideRejected,
      }))
    }
    if (vacTitle) setVacancyFilter(vacTitle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Серверные фасеты (города/источники + счётчики этапов) для поп-овера и чипов
  const [facets, setFacets] = useState<FacetsData | null>(null)

  // Сортировка
  const [sort, setSort] = useState<ListSortState | null>({ key: "responseDate", dir: "desc" })

  // Выделение (bulk)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Настройки колонок
  const [settings, setSettings] = useState<CardDisplaySettings>(DEFAULT_SETTINGS)

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null)
  const [drawerInitialTab, setDrawerInitialTab] = useState<string | null>(null)
  // Снапшот из списка — рендерится в шапке drawer мгновенно до полного fetch
  const [drawerInitialCandidate, setDrawerInitialCandidate] = useState<InitialCandidateSnapshot | null>(null)

  // Диалог смены стадии
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [pendingStage, setPendingStage] = useState<string | null>(null)
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null)
  const [pendingCandidateName, setPendingCandidateName] = useState<string | null>(null)
  const [pendingVacancyId, setPendingVacancyId] = useState<string | null>(null)
  const [sendMessage, setSendMessage] = useState(true)
  const [stageMessageText, setStageMessageText] = useState("")
  const [stageDialogLoading, setStageDialogLoading] = useState(false)

  // Диалог планирования интервью из строки
  const [schedOpen, setSchedOpen] = useState(false)
  const [schedCand, setSchedCand] = useState<{ id: string; name: string; vacancyId: string | null } | null>(null)
  const [schedDate, setSchedDate] = useState("")
  const [schedTime, setSchedTime] = useState("10:00")
  const [schedDur, setSchedDur] = useState("45")
  const [schedInterviewer, setSchedInterviewer] = useState("")
  const [scheduling, setScheduling] = useState(false)

  const openSchedule = useCallback((c: { id: string; name: string; vacancyId?: string | null }) => {
    setSchedCand({ id: c.id, name: c.name, vacancyId: c.vacancyId ?? null })
    setSchedDate(""); setSchedTime("10:00"); setSchedDur("45"); setSchedInterviewer("")
    setSchedOpen(true)
  }, [])

  const handleSchedule = useCallback(async () => {
    if (!schedCand || !schedDate || !schedTime) { toast.error("Укажите дату и время"); return }
    setScheduling(true)
    try {
      const [h, m] = schedTime.split(":").map(Number)
      const start = new Date(schedDate); start.setHours(h, m, 0, 0)
      const end = new Date(start.getTime() + (parseInt(schedDur) || 45) * 60000)
      const res = await fetch("/api/modules/hr/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: schedCand.name, type: "interview",
          startAt: start.toISOString(), endAt: end.toISOString(),
          candidateId: schedCand.id, vacancyId: schedCand.vacancyId,
          interviewer: schedInterviewer || null,
        }),
      })
      if (!res.ok) throw new Error()
      setSchedOpen(false)
      toast.success("Интервью запланировано — видно в карточке и в табе «Интервью»")
    } catch { toast.error("Не удалось запланировать интервью") } finally { setScheduling(false) }
  }, [schedCand, schedDate, schedTime, schedDur, schedInterviewer])


  // ─── Серверные фильтры ────────────────────────────────────────────────────

  const filterParams = useMemo(() => {
    const ps = new URLSearchParams()
    // Поисковая строка
    if (debouncedSearch.trim()) ps.set("search", debouncedSearch.trim())
    // Фильтр по вакансии (по названию — глобальная ветка API)
    if (vacancyFilter !== "all") ps.set("vacancyTitle", vacancyFilter)
    // Из FilterState: стадии воронки
    if (filters.funnelStatuses.length > 0) {
      ps.set("funnelStatuses", filters.funnelStatuses.join(","))
    }
    // Скрыть отказы
    if (filters.hideRejected) ps.set("hideRejected", "true")
    // Города (множественный выбор)
    if (filters.cities.length > 0) ps.set("cities", filters.cities.join(","))
    // Источники (множественный выбор)
    if (filters.sources.length > 0) ps.set("sources", filters.sources.join(","))
    // AI-скор по анкете
    if (filters.scoreMinAnketa > 0) ps.set("scoreMinAnketa", String(filters.scoreMinAnketa))
    // AI-скор по резюме
    if (filters.scoreMinResume > 0) ps.set("scoreMinResume", String(filters.scoreMinResume))
    // Зарплата
    if (filters.salaryMin > 0) ps.set("salaryMin", String(filters.salaryMin))
    if (filters.salaryMax < 250000) ps.set("salaryMax", String(filters.salaryMax))
    // Диапазон дат
    if (filters.dateFrom) ps.set("dateFrom", filters.dateFrom)
    if (filters.dateTo) ps.set("dateTo", filters.dateTo)
    // Анкета (контактная форма после демо)
    if (filters.anketaFilled) ps.set("anketaFilled", filters.anketaFilled)
    return ps
  }, [debouncedSearch, vacancyFilter, filters])

  // Список вакансий для фильтра по вакансии.
  useEffect(() => {
    fetch("/api/modules/hr/vacancies")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        // API: apiSuccess({ vacancies: [...] }) → { data: { vacancies: [...] } }
        const list = Array.isArray(data) ? data
          : Array.isArray(data?.vacancies) ? data.vacancies
          : Array.isArray(data?.data?.vacancies) ? data.data.vacancies
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data?.data) ? data.data : []
        const titles = [...new Set(
          (list as { title?: string }[]).map(v => v?.title).filter((t): t is string => !!t)
        )].sort((a, b) => a.localeCompare(b, "ru"))
        setAllVacancyTitles(titles)
      })
      .catch(() => {})
  }, [])

  const vacancyOptions = useMemo(
    () => [{ value: "all", label: "Все вакансии" }, ...allVacancyTitles.map(t => ({ value: t, label: t }))],
    [allVacancyTitles],
  )

  // ─── Загрузка кандидатов ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams(filterParams)
    qs.set("page", "1")
    qs.set("pageSize", String(PAGE_SIZE))
    fetch(`/api/modules/hr/candidates?${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { items?: GlobalCandidate[]; total?: number; hasMore?: boolean }) => {
        if (cancelled) return
        setCandidates(Array.isArray(data.items) ? data.items : [])
        setTotal(data.total ?? 0)
        setHasMore(!!data.hasMore)
        setPage(1)
        setSelected(new Set())
      })
      .catch(() => {
        if (!cancelled) {
          setCandidates([])
          setTotal(0)
          setHasMore(false)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filterParams, reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const qs = new URLSearchParams(filterParams)
      qs.set("page", String(nextPage))
      qs.set("pageSize", String(PAGE_SIZE))
      const res = await fetch(`/api/modules/hr/candidates?${qs}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { items?: GlobalCandidate[]; total?: number; hasMore?: boolean }
      const items = Array.isArray(data.items) ? data.items : []
      setCandidates(prev => [...prev, ...items])
      setTotal(data.total ?? total)
      setHasMore(!!data.hasMore)
      setPage(nextPage)
    } catch {
      toast.error("Не удалось загрузить следующую страницу")
    } finally {
      setLoadingMore(false)
    }
  }

  // ─── Загрузка фасетов (города/источники по всей компании) ───────────────

  useEffect(() => {
    const qs = vacancyFilter !== "all" ? `?vacancyTitle=${encodeURIComponent(vacancyFilter)}` : ""
    fetch(`/api/modules/hr/candidates/facets${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { data?: FacetsData }) => {
        if (data?.data) setFacets(data.data)
      })
      .catch(() => {})
  }, [vacancyFilter])

  // ─── Маппинг в формат ListView ────────────────────────────────────────────

  // ListView принимает columns[] с candidates[]. Упаковываем всех в одну
  // синтетическую колонку (как в vacancy page в paginated-режиме).
  const listColumns = useMemo(() => {
    const items = candidates.map(c => toListCandidate(c))
    return [{
      id: "all",
      title: "Кандидаты",
      colorFrom: "#a78bfa",
      colorTo: "#c084fc",
      candidates: items,
    }]
  }, [candidates])

  // ─── Действия ─────────────────────────────────────────────────────────────

  const handleToggleFavorite = useCallback(async (candidateId: string, isFavorite: boolean) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, isFavorite } : c))
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/favorite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c))
      toast.error("Не удалось обновить избранное")
    }
  }, [])

  const openStageDialog = (candidateId: string, candidateName: string, stage: string, vacancyId: string) => {
    setPendingCandidateId(candidateId)
    setPendingCandidateName(candidateName)
    setPendingStage(stage)
    setPendingVacancyId(vacancyId)
    setSendMessage(true)
    setStageMessageText("")
    setStageDialogOpen(true)
  }

  const openBulkStageDialog = (stage: string) => {
    if (selected.size === 0) return
    setPendingCandidateId(null)
    setPendingCandidateName(null)
    setPendingStage(stage)
    const firstId = [...selected][0]
    const firstCandidate = candidates.find(c => c.id === firstId)
    setPendingVacancyId(firstCandidate?.vacancyId ?? null)
    setSendMessage(true)
    setStageMessageText("")
    setStageDialogOpen(true)
  }

  const confirmStageChange = async () => {
    if (!pendingStage) return
    const override = stageMessageText.trim() || null
    setStageDialogLoading(true)
    try {
      if (pendingCandidateId) {
        const res = await fetch(`/api/modules/hr/candidates/${pendingCandidateId}/stage`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: pendingStage, sendMessage, ...(override ? { messageOverride: override } : {}) }),
        })
        if (!res.ok) throw new Error()
        setCandidates(prev => prev.map(c => c.id === pendingCandidateId ? { ...c, stage: pendingStage } : c))
        toast.success(`${pendingCandidateName ?? "Кандидат"}: ${getStageLabel(pendingStage)}`)
      } else {
        const ids = [...selected]
        await Promise.all(ids.map(id =>
          fetch(`/api/modules/hr/candidates/${id}/stage`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: pendingStage, sendMessage, ...(override ? { messageOverride: override } : {}) }),
          })
        ))
        setCandidates(prev => prev.map(c => selected.has(c.id) ? { ...c, stage: pendingStage } : c))
        setSelected(new Set())
        toast.success(`${ids.length} кандидатов: ${getStageLabel(pendingStage)}`)
      }
      setStageDialogOpen(false)
      setPendingStage(null)
      setPendingCandidateId(null)
    } catch {
      toast.error("Ошибка смены этапа")
    } finally {
      setStageDialogLoading(false)
    }
  }

  // ─── Drawer ───────────────────────────────────────────────────────────────

  const handleOpenProfile = useCallback((candidate: Candidate, _columnId?: string, initialTab?: string) => {
    setDrawerInitialTab(initialTab ?? null)
    // Находим полную запись в нашем локальном списке, чтобы передать снапшот
    const gc = candidates.find(c => c.id === candidate.id)
    setDrawerInitialCandidate(gc ? {
      id: gc.id,
      name: gc.name,
      photoUrl: gc.photoUrl ?? null,
      stage: gc.stage,
      vacancyTitle: gc.vacancyTitle,
      city: gc.city ?? null,
      source: gc.source ?? null,
      aiScore: gc.aiScore ?? null,
      resumeScore: gc.resumeScore ?? null,
      isFavorite: gc.isFavorite,
    } : null)
    setDrawerCandidateId(candidate.id)
    setDrawerOpen(true)
  }, [candidates])

  const handleDrawerStageChange = useCallback((candidateId: string, newStage: string) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, stage: newStage } : c))
  }, [])

  // ─── Массовые действия (BulkActionsBar) ───────────────────────────────────
  // Список стадий для «Сменить стадию» — платформенные нетерминальные этапы.
  const bulkStages = useMemo(
    () => ALL_STAGE_SLUGS
      .filter(s => !PLATFORM_STAGES[s].isTerminal)
      .map(s => ({ id: s, title: getStageLabel(s) })),
    [],
  )

  // Общий vacancyId, если все выделенные из одной вакансии — иначе null.
  // Нужен для действий, привязанных к вакансии (сравнение/тест/рассылка hh).
  const selectedVacancyId = useMemo(() => {
    let vid: string | null = null
    for (const c of candidates) {
      if (!selected.has(c.id)) continue
      if (vid === null) vid = c.vacancyId
      else if (vid !== c.vacancyId) return null
    }
    return vid
  }, [candidates, selected])

  // Все выделенные сейчас в «Отказ» → показываем «Вернуть в воронку».
  const allSelectedRejected = useMemo(() => {
    if (selected.size === 0) return false
    for (const c of candidates) {
      if (selected.has(c.id) && c.stage !== "rejected") return false
    }
    return true
  }, [candidates, selected])

  const handleBulkAction = useCallback(
    async (action: BulkAction, payload?: { stage?: string }) => {
      if (selected.size === 0 || bulkBusy) return
      const ids = Array.from(selected)

      // Сравнение — только в пределах одной вакансии (страница сравнения per-вакансия).
      if (action === "compare") {
        if (ids.length < 2) { toast.error("Выделите минимум двух кандидатов для сравнения"); return }
        if (!selectedVacancyId) { toast.error("Сравнение доступно только для кандидатов одной вакансии"); return }
        window.location.href = `/hr/vacancies/${selectedVacancyId}/compare?ids=${ids.join(",")}`
        return
      }
      // Тест и рассылка через hh привязаны к вакансии (шаблон/hh-чат). Если все
      // выделенные из одной вакансии — уводим в её карточку, иначе подсказываем.
      if (action === "send_test" || action === "hh_broadcast") {
        if (!selectedVacancyId) {
          toast.error("Действие привязано к вакансии — выделите кандидатов одной вакансии")
          return
        }
        router.push(`/hr/vacancies/${selectedVacancyId}?tab=candidates`)
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
          case "reject": toast.success(`Отказано: ${n}`); break
          case "invite": toast.success(`Приглашено на интервью: ${n}`); break
          case "talent_pool": toast.success(`В резерв: ${n}`); break
          case "set_stage": toast.success(`Перемещено: ${n}`); break
          case "toggle_favorite": toast.success(data.isFavorite ? `В избранном: ${n}` : `Снято с избранного: ${n}`); break
          case "restore": toast.success(`Возвращено в воронку: ${n}`); break
          case "trash": toast.success(`Удалено в корзину: ${n}`); break
          case "hard_delete": toast.success(`Удалено навсегда: ${n}`); break
        }
        setSelected(new Set())
        setReloadTick(t => t + 1)
      } catch {
        toast.error("Ошибка сети")
      } finally {
        setBulkBusy(false)
      }
    },
    [selected, bulkBusy, selectedVacancyId, router],
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 px-4 sm:px-14">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold text-foreground">Кандидаты</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {candidates.length > 0 && total > candidates.length
                    ? `${candidates.length} из ${total} кандидатов`
                    : `${candidates.length} кандидатов`}
                </p>
              </div>
            </div>

            {/* Toolbar — поиск + фильтр-поповер + избранные + вид (как в странице вакансии) */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Поиск ФИО — на мобильных full-width, на sm+ фиксированная ширина */}
              <div className="relative w-full sm:w-[340px] sm:flex-none min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Поиск по имени..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn("pl-9", FILTER_INPUT)}
                />
              </div>
              {/* Главный фильтр — по вакансии (на мобильных full-width, на sm+ фиксированная) */}
              <Select value={vacancyFilter} onValueChange={(v) => { setVacancyFilter(v); setPage(1) }}>
                <SelectTrigger className={cn("w-full sm:w-[220px] sm:flex-none", FILTER_INPUT)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vacancyOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Правая группа — Фильтр / Интервью / Вид (на мобильных тоже flex-wrap) */}
              <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
                {/* Полный фильтр — те же опции, что внутри вакансии (передаём кандидатов) */}
                <CandidateFilters
                  filters={filters}
                  onFiltersChange={(f) => { setFilters(f); setPage(1) }}
                  facets={facets}
                  candidates={listColumns[0].candidates}
                />
                {/* Интервью по всем вакансиям */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 shrink-0"
                  onClick={() => router.push("/hr/interviews")}
                  title="Интервью по всем вакансиям"
                >
                  <CalendarDays className="size-4" />
                  <span className="hidden lg:inline">Интервью</span>
                </Button>
                {/* Тумблеры колонок (Вид) */}
                <ColumnToggles
                  settings={settings}
                  onSettingsChange={setSettings}
                  onReset={() => setSettings(DEFAULT_SETTINGS)}
                />
              </div>
            </div>

            {/* Мини-сводка: роллап по этапам (чипы дают поэтапно, тут — итог) */}
            {facets?.stages && facets.stages.length > 0 && (() => {
              let total = 0, inWork = 0, rejected = 0
              for (const s of facets.stages) {
                total += s.count
                if (s.stage === "rejected") rejected += s.count
                else if (!PLATFORM_STAGES[s.stage as StageSlug]?.isTerminal) inWork += s.count
              }
              return (
                <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
                  <span className="text-muted-foreground">Всего: <b className="text-foreground tabular-nums">{total}</b></span>
                  <span className="text-muted-foreground">В работе: <b className="text-foreground tabular-nums">{inWork}</b></span>
                  <span className="text-muted-foreground">Отказов: <b className="text-foreground tabular-nums">{rejected}</b></span>
                </div>
              )
            })()}

            {/* Чипы-этапы (инлайн-воронка): клик фильтрует список по этапу */}
            {facets?.stages && facets.stages.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                <button
                  onClick={() => { setFilters(f => ({ ...f, funnelStatuses: [] })); setPage(1) }}
                  className={cn(
                    "px-2.5 h-7 rounded-full text-xs border transition-colors",
                    filters.funnelStatuses.length === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                  )}
                >
                  Все
                </button>
                {[...ALL_STAGE_SLUGS, ...facets.stages.map(s => s.stage).filter(s => !(ALL_STAGE_SLUGS as readonly string[]).includes(s))]
                  .map(slug => ({ slug, count: facets.stages?.find(s => s.stage === slug)?.count ?? 0 }))
                  .filter(x => x.count > 0)
                  .map(({ slug, count }) => {
                    const active = filters.funnelStatuses.length === 1 && filters.funnelStatuses[0] === slug
                    return (
                      <button
                        key={slug}
                        onClick={() => {
                          setFilters(f => ({
                            ...f,
                            funnelStatuses: [slug],
                            hideRejected: (slug === "rejected" || slug === "test_failed") ? false : f.hideRejected,
                          }))
                          setPage(1)
                        }}
                        className={cn(
                          "px-2.5 h-7 rounded-full text-xs border transition-colors inline-flex items-center gap-1.5",
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                        )}
                      >
                        {getStageLabel(slug)}
                        <span className={cn("text-[10px] tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
                      </button>
                    )
                  })}
              </div>
            )}

            {/* Bulk bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-sm font-medium text-primary mr-1">Выбрано: {selected.size}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => openBulkStageDialog("scheduled")}>
                  <UserPlus className="size-3.5" />На интервью
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => openBulkStageDialog("talent_pool")}>
                  <Archive className="size-3.5" />В резерв
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={() => openBulkStageDialog("rejected")}>
                  <XCircle className="size-3.5" />Отказать
                </Button>
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setSelected(new Set())}
                >
                  Снять выделение
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty */}
            {!loading && candidates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Нет кандидатов</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {total === 0 ? "Кандидаты появятся после первого отклика" : "Попробуйте изменить фильтры"}
                </p>
              </div>
            )}

            {/* ListView */}
            {!loading && candidates.length > 0 && (
              <ListView
                columns={listColumns}
                settings={settings}
                sort={sort}
                onSortChange={setSort}
                serverSorted={false}
                showVacancyColumn={vacancyFilter === "all"}
                selectedIds={selected}
                onSelectionChange={setSelected}
                onOpenProfile={handleOpenProfile}
                onToggleFavorite={handleToggleFavorite}
                onVacancyClick={(vacancyId) => router.push(`/hr/vacancies/${vacancyId}`)}
                onScheduleInterview={(c) => openSchedule({ id: c.id, name: c.name, vacancyId: (c as { vacancyId?: string | null }).vacancyId })}
                onAction={(candidateId, _colId, action) => {
                  const c = candidates.find(x => x.id === candidateId)
                  if (!c) return
                  const stageMap: Record<string, string> = {
                    advance: "scheduled",
                    reject: "rejected",
                    reserve: "talent_pool",
                  }
                  const stage = stageMap[action]
                  if (stage) openStageDialog(candidateId, c.name, stage, c.vacancyId)
                }}
              />
            )}

            {/* Load more */}
            {!loading && hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="gap-2"
                >
                  {loadingMore ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  Загрузить ещё ({total - candidates.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      {/* Массовые действия по выделенным — sibling SidebarInset, чтобы
          панель центрировалась по области контента (peer-data сайдбара). */}
      <BulkActionsBar
        count={selected.size}
        stages={bulkStages}
        allRejected={allSelectedRejected}
        canDelete={canDeleteCandidates}
        onClear={() => setSelected(new Set())}
        onAction={handleBulkAction}
      />

      {/* Drawer кандидата — тот же, что и внутри вакансии.
          initialCandidate — снапшот из списка: рисует шапку мгновенно
          пока идёт полный fetch детальных данных. */}
      <CandidateDrawer
        candidateId={drawerCandidateId}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) {
            setDrawerCandidateId(null)
            setDrawerInitialCandidate(null)
          }
        }}
        initialCandidate={drawerInitialCandidate}
        initialTab={drawerInitialTab}
        onToggleFavorite={handleToggleFavorite}
        onStageChange={handleDrawerStageChange}
      />

      {/* Диалог планирования интервью из строки */}
      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Запланировать интервью{schedCand ? ` — ${schedCand.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cand-sch-date" className="text-xs">Дата</Label>
              <Input id="cand-sch-date" type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-sch-time" className="text-xs">Время</Label>
              <Input id="cand-sch-time" type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-sch-dur" className="text-xs">Длительность, мин</Label>
              <Input id="cand-sch-dur" type="number" min={15} step={15} value={schedDur} onChange={e => setSchedDur(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-sch-int" className="text-xs">Интервьюер</Label>
              <Input id="cand-sch-int" value={schedInterviewer} onChange={e => setSchedInterviewer(e.target.value)} placeholder="Кто проводит" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedOpen(false)} disabled={scheduling}>Отмена</Button>
            <Button onClick={handleSchedule} disabled={scheduling || !schedDate || !schedTime}>
              {scheduling ? "Сохраняю…" : "Запланировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог смены стадии */}
      <Dialog
        open={stageDialogOpen}
        onOpenChange={(open) => {
          setStageDialogOpen(open)
          if (!open) { setPendingStage(null); setPendingCandidateId(null) }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingCandidateId && pendingCandidateName
                ? `${pendingCandidateName} → ${pendingStage ? getStageLabel(pendingStage) : ""}`
                : pendingStage
                  ? `${[...selected].length} кандидатов → ${getStageLabel(pendingStage)}`
                  : "Сменить стадию"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <StageMessageControl
              stage={pendingStage}
              vacancyId={pendingVacancyId}
              sendMessage={sendMessage}
              onSendMessageChange={setSendMessage}
              messageText={stageMessageText}
              onMessageTextChange={setStageMessageText}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setStageDialogOpen(false); setPendingStage(null); setPendingCandidateId(null) }}
              disabled={stageDialogLoading}
            >
              Отмена
            </Button>
            <Button onClick={confirmStageChange} disabled={stageDialogLoading}>
              {stageDialogLoading ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
