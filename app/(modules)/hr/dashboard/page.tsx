"use client"

import { useEffect, useState, useCallback, type ElementType } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ALL_STAGE_SLUGS, PLATFORM_STAGES, getStageLabel, type StageSlug } from "@/lib/stages"
import { useAuth } from "@/lib/auth"
import { isRestrictedWorkspace } from "@/lib/owner"
import {
  Briefcase, Users, UserCheck, Plus, ChevronRight,
  Sparkles, Activity, Calendar, CalendarDays, CheckCircle2, XCircle, Palette,
  RotateCcw,
} from "lucide-react"
import { CandidatesProgressMiniTable } from "@/components/candidates/candidates-progress-mini-table"
import { AwaitingReviewBanner } from "./_components/awaiting-review-banner"
import type { CompanyHiringDefaults } from "@/lib/db/schema"

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  green: "#1D9E75",
  blue: "#378ADD",
  orange: "#D85A30",
  red: "#E24B4A",
  purple: "#7F77DD",
}

// ─── Dashboard card config ────────────────────────────────────────────────────

export type DashboardIntensity = "vivid" | "pale"

export interface DashboardCardsConfig {
  intensity: DashboardIntensity
  colors: Record<string, string>
}

// Ключи карточек и их дефолтные hex-цвета (текущие цвета из Tailwind)
const CARD_KEYS = ["vacancies", "candidates", "interviewScheduled", "interviewConducted", "hired", "rejected"] as const
type CardKey = typeof CARD_KEYS[number]

const CARD_DEFAULTS: Record<CardKey, string> = {
  vacancies:           "#10b981", // emerald-500
  candidates:          "#3b82f6", // blue-500
  interviewScheduled:  "#8b5cf6", // violet-500
  interviewConducted:  "#6366f1", // indigo-500
  hired:               "#14b8a6", // teal-500
  rejected:            "#f43f5e", // rose-500
}

const CARD_LABELS: Record<CardKey, string> = {
  vacancies:           "Вакансий",
  candidates:          "Откликов всего",
  interviewScheduled:  "Назначено инт.",
  interviewConducted:  "Проведено инт.",
  hired:               "Нанято",
  rejected:            "Отказов",
}

function getDefaultConfig(): DashboardCardsConfig {
  return { intensity: "vivid", colors: { ...CARD_DEFAULTS } }
}

function mergeConfig(saved: CompanyHiringDefaults["dashboardCards"] | undefined): DashboardCardsConfig {
  const def = getDefaultConfig()
  if (!saved) return def
  return {
    intensity: saved.intensity ?? def.intensity,
    colors: { ...def.colors, ...saved.colors },
  }
}

// ─── Hex → rgba helper ───────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`
  return `rgba(${r},${g},${b},${alpha})`
}

// Тёмный тон (70% от исходного) для текста в pale-режиме
function hexDarken(hex: string, factor = 0.55): string {
  const h = hex.replace("#", "")
  const r = Math.round(parseInt(h.slice(0, 2), 16) * factor)
  const g = Math.round(parseInt(h.slice(2, 4), 16) * factor)
  const b = Math.round(parseInt(h.slice(4, 6), 16) * factor)
  return `rgb(${r},${g},${b})`
}

// ─── Funnel ───────────────────────────────────────────────────────────────
// «Рабочая» воронка: реальные этапы из candidates.stage (по порядку
// ALL_STAGE_SLUGS), счётчик на этап, клик → список кандидатов этого этапа.
// Цвет бара — по цвету этапа из PLATFORM_STAGES.

const STAGE_BAR_BG: Record<string, string> = {
  slate: "bg-slate-400", blue: "bg-blue-500", indigo: "bg-indigo-500",
  violet: "bg-violet-500", purple: "bg-purple-500", amber: "bg-amber-500",
  orange: "bg-orange-500", yellow: "bg-yellow-500", lime: "bg-lime-500",
  green: "bg-green-500", emerald: "bg-emerald-500", rose: "bg-rose-500", red: "bg-red-500",
}

// ─── API types ──────────────────────────────────────────────────────────────

interface VacancyRow {
  id: string
  title: string
  city: string | null
  slug: string | null
  salaryMin: number | null
  salaryMax: number | null
  status: string
  createdAt: string
  candidateCount: number
  decisionCount: number
  inProgressCount?: number
}

interface DashboardStats {
  kpi: {
    activeVacancies: number
    totalCandidates: number
    candidatesInWork: number
    candidatesToday: number
    hiredThisMonth: number
    conversionRate: number
  }
  vacancies: VacancyRow[]
  funnel: {
    totals: Record<string, number>
    byVacancy: Record<string, Record<string, number>>
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// #31: time-aware приветствие в Москве, единый источник правды.
// 4 варианта: ночь (0-4) / утро (5-11) / день (12-17) / вечер (18-23).
function getGreeting(): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date())
  const hourStr = parts.find(p => p.type === "hour")?.value ?? "0"
  const h = (parseInt(hourStr, 10) || 0) % 24
  if (h <= 4) return "Доброй ночи"
  if (h <= 11) return "Доброе утро"
  if (h <= 17) return "Добрый день"
  return "Добрый вечер"
}

function getDateString(): string {
  const formatted = new Date().toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long",
  })
  return "Сегодня: " + formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

// ─── Color metric card ──────────────────────────────────────────────────────

function Metric({
  icon: Icon, label, value, trend, color, intensity,
}: {
  icon: ElementType
  label: string
  value: number | string
  trend?: string
  color: string
  intensity: DashboardIntensity
}) {
  if (intensity === "pale") {
    const bg = hexToRgba(color, 0.13)
    const textColor = hexDarken(color, 0.55)
    const iconColor = hexDarken(color, 0.65)
    return (
      <div
        className="rounded-xl shadow-sm hover:shadow-md transition-shadow p-4"
        style={{ backgroundColor: bg }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
          <span className="text-sm font-semibold" style={{ color: textColor }}>{label}</span>
        </div>
        <p className="text-3xl font-bold" style={{ color: textColor }}>{value}</p>
        {trend && <p className="text-sm mt-1" style={{ color: textColor, opacity: 0.8 }}>{trend}</p>}
      </div>
    )
  }

  // vivid — сплошной фон, белый текст
  return (
    <div
      className="rounded-xl shadow-sm hover:shadow-md transition-shadow p-4"
      style={{ backgroundColor: color }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {trend && <p className="text-sm mt-1 text-white/90">{trend}</p>}
    </div>
  )
}

// ─── Card color settings sheet ────────────────────────────────────────────────

function CardColorSheet({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  config: DashboardCardsConfig
  onSave: (cfg: DashboardCardsConfig) => Promise<void>
}) {
  const [local, setLocal] = useState<DashboardCardsConfig>(config)
  const [saving, setSaving] = useState(false)

  // Синхронизируем при открытии
  useEffect(() => {
    if (open) setLocal(config)
  }, [open, config])

  const setColor = (key: string, hex: string) => {
    setLocal(prev => ({ ...prev, colors: { ...prev.colors, [key]: hex } }))
  }

  const handleHexInput = (key: string, raw: string) => {
    // Принимаем текст по мере набора; нормализуем только при 6/7 символах
    const val = raw.startsWith("#") ? raw : "#" + raw
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setColor(key, val)
    }
    // Временное хранение в поле handled через e.target.value напрямую
  }

  const handleReset = () => setLocal(getDefaultConfig())

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(local)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:w-[400px] overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            Цвета карточек
          </SheetTitle>
        </SheetHeader>

        {/* Интенсивность */}
        <div className="mb-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Режим отображения</Label>
          <div className="flex gap-2">
            {(["vivid", "pale"] as DashboardIntensity[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setLocal(prev => ({ ...prev, intensity: mode }))}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                  local.intensity === mode
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                {mode === "vivid" ? "Яркий" : "Бледный"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {local.intensity === "vivid"
              ? "Сплошной цветной фон, белый текст"
              : "Светлая заливка, тёмный текст в тоне цвета"}
          </p>
        </div>

        {/* Предпросмотр */}
        <div className="mb-5">
          <Label className="text-xs text-muted-foreground mb-2 block">Предпросмотр</Label>
          <div className="grid grid-cols-3 gap-2">
            {CARD_KEYS.map(key => (
              <Metric
                key={key}
                icon={Briefcase}
                label={CARD_LABELS[key]}
                value={42}
                color={local.colors[key] ?? CARD_DEFAULTS[key]}
                intensity={local.intensity}
              />
            ))}
          </div>
        </div>

        {/* Цвета карточек */}
        <div className="space-y-3 mb-6">
          <Label className="text-xs text-muted-foreground block">Цвет карточки</Label>
          {CARD_KEYS.map(key => {
            const hex = local.colors[key] ?? CARD_DEFAULTS[key]
            return (
              <div key={key} className="flex items-center gap-3">
                {/* Color picker */}
                <label className="shrink-0 cursor-pointer relative">
                  <div
                    className="w-8 h-8 rounded-md border border-border shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                  <input
                    type="color"
                    value={hex}
                    onChange={e => setColor(key, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
                {/* Hex input */}
                <input
                  type="text"
                  defaultValue={hex}
                  key={hex} // re-mount при сбросе к дефолту
                  maxLength={7}
                  onChange={e => handleHexInput(key, e.target.value)}
                  className="w-24 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="#10b981"
                />
                {/* Название */}
                <span className="text-sm text-muted-foreground flex-1">{CARD_LABELS[key]}</span>
              </div>
            )
          })}
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleReset}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

// #47: ключ для localStorage. Сохраняем { name, savedAt } чтобы при первом
// рендере страницы (до прихода session) сразу показать имя из прошлого захода.
const HR_USER_CACHE_KEY = "hr_user_cache"

interface HrUserCache {
  name: string
  savedAt: number
}

function readHrUserCache(): HrUserCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(HR_USER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HrUserCache>
    if (typeof parsed.name === "string" && parsed.name.length > 0) {
      return { name: parsed.name, savedAt: parsed.savedAt ?? 0 }
    }
  } catch {}
  return null
}

export function DashboardView({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const { user, role } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  // KPI из отчёта (те же цифры, что на /hr/report) — для верхних карточек.
  const [reportKpi, setReportKpi] = useState<{ activeVacancies: number; totalCandidates: number; interviewScheduled: number; interviewConducted: number; totalRejected: number; totalHired: number } | null>(null)
  // #30: фильтр по вакансии. "all" = показывать всё (default).
  const [selectedVacancyId, setSelectedVacancyId] = useState<string>("all")
  // #47: имя из localStorage для мгновенного первого рендера. Заменяется на
  // user.name как только сессия подтянулась.
  const [cachedName, setCachedName] = useState<string>("")

  // Настройки цветов карточек
  const [cardsConfig, setCardsConfig] = useState<DashboardCardsConfig>(getDefaultConfig())
  const [colorSheetOpen, setColorSheetOpen] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)

  // Директор/владелец может настраивать цвета
  const isDirectorLike = ["director", "client", "platform_admin", "admin"].includes(role)

  useEffect(() => {
    const c = readHrUserCache()
    if (c) setCachedName(c.name)
  }, [])

  // #47: когда сессия загрузилась — сохранить актуальное имя в localStorage,
  // чтобы при следующем заходе оно было сразу.
  useEffect(() => {
    if (!user.name) return
    if (typeof window === "undefined") return
    try {
      const current = readHrUserCache()
      if (current?.name !== user.name) {
        localStorage.setItem(HR_USER_CACHE_KEY, JSON.stringify({ name: user.name, savedAt: Date.now() }))
      }
    } catch {}
  }, [user.name])

  // Загружаем конфиг цветов из hiring-defaults
  useEffect(() => {
    fetch("/api/modules/hr/company/hiring-defaults")
      .then(r => r.ok ? r.json() : null)
      .then((d: { hiringDefaults?: CompanyHiringDefaults } | null) => {
        if (d?.hiringDefaults?.dashboardCards) {
          setCardsConfig(mergeConfig(d.hiringDefaults.dashboardCards))
        }
        setConfigLoaded(true)
      })
      .catch(() => { setConfigLoaded(true) })
  }, [])

  useEffect(() => {
    let cancelled = false
    // #49: при изменении фильтра — перезагружаем счётчики с ?vacancyId=
    const qs = selectedVacancyId !== "all" ? `?vacancyId=${encodeURIComponent(selectedVacancyId)}` : ""
    setLoaded(false)
    fetch(`/api/modules/hr/dashboard/stats${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: DashboardStats | null) => {
        if (cancelled) return
        if (d && typeof d === "object" && "kpi" in d) setStats(d)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [selectedVacancyId])

  // KPI из отчёта (Назначено/Проведено инт., Нанято, Отказов) — те же цифры,
  // что на /hr/report. period=all → итоги за всё время.
  useEffect(() => {
    let cancelled = false
    const vq = selectedVacancyId !== "all" ? `&vacancyId=${encodeURIComponent(selectedVacancyId)}` : ""
    fetch(`/api/modules/hr/report?period=all${vq}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.kpi) setReportKpi(d.kpi) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedVacancyId])

  // Сохранение конфига цветов через существующий PATCH-эндпоинт hiring-defaults
  const handleSaveCardsConfig = useCallback(async (cfg: DashboardCardsConfig) => {
    const res = await fetch("/api/modules/hr/company/hiring-defaults", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardCards: cfg }),
    })
    if (!res.ok) throw new Error("Ошибка сохранения")
    const data = (await res.json()) as { hiringDefaults?: CompanyHiringDefaults }
    if (data.hiringDefaults?.dashboardCards) {
      setCardsConfig(mergeConfig(data.hiringDefaults.dashboardCards))
    } else {
      setCardsConfig(cfg)
    }
  }, [])

  // #47: эффективное имя — реальное user.name из сессии, иначе из кеша.
  const effectiveName = user.name || cachedName
  // #33: для приветствия берём firstName, если задан; иначе первое слово из name/кеша.
  const greetingFirst = user.firstName || effectiveName.split(" ")[0] || ""

  const kpi = stats?.kpi
  const vacancies = stats?.vacancies ?? []
  // #30: если выбрана конкретная вакансия — используем её срез из byVacancy,
  // иначе общий totals.
  const funnelTotals = (() => {
    if (selectedVacancyId !== "all" && stats?.funnel?.byVacancy?.[selectedVacancyId]) {
      return stats.funnel.byVacancy[selectedVacancyId]
    }
    return stats?.funnel?.totals ?? {}
  })()

  // Реальные этапы из данных, в каноническом порядке + любые legacy-ключи в конце.
  const funnel = (() => {
    const extra = Object.keys(funnelTotals).filter(k => !(ALL_STAGE_SLUGS as string[]).includes(k))
    const order: string[] = [...ALL_STAGE_SLUGS, ...extra]
    return order
      .map(slug => ({
        slug,
        label: getStageLabel(slug),
        count: funnelTotals[slug] ?? 0,
        barClass: STAGE_BAR_BG[PLATFORM_STAGES[slug as StageSlug]?.color ?? ""] ?? "bg-primary",
      }))
      .filter(e => e.count > 0)
  })()
  const funnelMax = Math.max(1, ...funnel.map(f => f.count))
  const funnelEmpty = funnel.length === 0
  const selectedVacancyTitle = vacancies.find(v => v.id === selectedVacancyId)?.title ?? ""

  // Header subtitle
  const headerSubtitle = (() => {
    // #29: не показываем «Загрузка» — оставляем подзаголовок пустым до
    // прихода данных, чтобы первый рендер был спокойным.
    if (!loaded) return ""
    if (!kpi) return "Не удалось загрузить данные"
    const today = kpi.candidatesToday ?? 0
    const inWork = kpi.candidatesInWork ?? 0
    if (today === 0 && inWork === 0 && vacancies.length === 0) {
      return "Сегодня пока нет новых данных"
    }
    const parts: string[] = []
    parts.push(`${today} новых ${today === 1 ? "отклик" : today >= 2 && today <= 4 ? "отклика" : "откликов"} сегодня`)
    if (vacancies.length > 0) {
      parts.push(`${vacancies.length} ${vacancies.length === 1 ? "вакансия" : vacancies.length >= 2 && vacancies.length <= 4 ? "вакансии" : "вакансий"} в работе`)
    }
    return parts.join(" · ")
  })()

  // Цвет карточки — из конфига или дефолт
  const cardColor = (key: CardKey) => cardsConfig.colors[key] ?? CARD_DEFAULTS[key]

  return (
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-5 px-4 sm:px-14">

            {/* ═══ Header ═══
                #29: имя из SSR-сессии. Если пустое (первый mount) — показываем
                просто «{приветствие}!» без имени, чтобы не пугать «Загрузка».
                #31: убран дублирующий <Greeting /> ниже (он рендерил то же
                самое второй раз).
                #32: убран фильтр «Этот месяц» — Юрий говорит непонятно что
                он фильтрует. Фильтр «Все вакансии» теперь стоит в правом
                верхнем углу один, как просили. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {!embedded && (
              <div>
                <h1 className="text-lg font-semibold">
                  {greetingFirst
                    ? `${getGreeting()}, ${greetingFirst}!`
                    : `${getGreeting()}!`}
                </h1>
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>{getDateString()}</p>
                {headerSubtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{headerSubtitle}</p>
                )}
              </div>
              )}
              <div className="flex items-center gap-2">
                {/* #30: активирован фильтр вакансий. По умолчанию "all" —
                    показываем все. При выборе одной — фильтруем клиентскую
                    voronku/active-vacancies по vacancyId. */}
                <Select value={selectedVacancyId} onValueChange={setSelectedVacancyId}>
                  {/* Ширина по тексту вакансии + 10мм правого поля; потолок,
                      чтобы очень длинные названия не растягивали шапку. */}
                  <SelectTrigger className="h-8 w-fit min-w-[180px] max-w-[min(480px,80vw)] pr-[10mm] text-xs">
                    <SelectValue placeholder="Все вакансии" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все вакансии</SelectItem>
                    {vacancies.map(v => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ═══ Очередь HR (P0-8) ═══ */}
            <AwaitingReviewBanner />

            {/* ═══ KPI pills — #50/#51 ═══
                Раньше было 2 ряда (KpiPill + Metric цветной), путано.
                Юрий: один ряд понятных метрик, реагируют на фильтр вакансии.
                «Кандидатов сегодня» → «Откликов сегодня» (это hh-отклики
                за день). «Кандидатов в работе» → «Прошли демо» (count
                stage IN demo_opened+, см. /api/.../stats #49). Убраны
                «Ср. время закрытия» (Скоро-плейсхолдер) и «Всего
                кандидатов» (бесполезно при наличии «Прошли демо»). */}
            <div>
              {/* Заголовок строки с кнопкой настройки — только для директора */}
              {isDirectorLike && configLoaded && (
                <div className="flex justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setColorSheetOpen(true)}
                  >
                    <Palette className="w-3.5 h-3.5" />
                    Настроить
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric icon={Briefcase} label="Вакансий" value={reportKpi?.activeVacancies ?? kpi?.activeVacancies ?? "—"} color={cardColor("vacancies")} intensity={cardsConfig.intensity} />
                <Metric icon={Users} label="Откликов всего" value={reportKpi?.totalCandidates ?? "—"} color={cardColor("candidates")} intensity={cardsConfig.intensity} />
                <Metric icon={CalendarDays} label="Назначено инт." value={reportKpi?.interviewScheduled ?? "—"} color={cardColor("interviewScheduled")} intensity={cardsConfig.intensity} />
                <Metric icon={CheckCircle2} label="Проведено инт." value={reportKpi?.interviewConducted ?? "—"} color={cardColor("interviewConducted")} intensity={cardsConfig.intensity} />
                <Metric icon={UserCheck} label="Нанято" value={reportKpi?.totalHired ?? "—"} color={cardColor("hired")} intensity={cardsConfig.intensity} />
                <Metric icon={XCircle} label="Отказов" value={reportKpi?.totalRejected ?? "—"} color={cardColor("rejected")} intensity={cardsConfig.intensity} />
              </div>
            </div>

            {/* Sheet настройки цветов */}
            {isDirectorLike && (
              <CardColorSheet
                open={colorSheetOpen}
                onOpenChange={setColorSheetOpen}
                config={cardsConfig}
                onSave={handleSaveCardsConfig}
              />
            )}

            {/* ═══ AI-ассистент — #33: активирован SQL-инсайтами ═══ */}
            <AiInsights selectedVacancyId={selectedVacancyId} />

            {/* ═══ Live progress widget — #52: раскрывающийся ═══ */}
            <ProgressWidget selectedVacancyId={selectedVacancyId} />

            {/* ═══ Funnel + Active Vacancies ═══
                #49: блок «Активные вакансии» справа не показываем, когда
                выбрана конкретная — иначе там единственная карточка-дубль.
                Воронка остаётся (она уже фильтруется). */}
            <div className={cn("grid grid-cols-1 gap-5", selectedVacancyId === "all" && "lg:grid-cols-2")}>
              {/* Funnel */}
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Воронка найма</h3>
                {!loaded ? (
                  <div className="h-40" />
                ) : funnelEmpty ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Воронка пока пуста — кандидаты появятся когда начнётся работа с откликами.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {funnel.map((f) => {
                      const href = `/hr/candidates?stage=${encodeURIComponent(f.slug)}${selectedVacancyTitle ? `&vacancyTitle=${encodeURIComponent(selectedVacancyTitle)}` : ""}`
                      return (
                        <Link
                          key={f.slug}
                          href={href}
                          className="block group rounded-lg -mx-2 px-2 py-1.5 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium group-hover:text-primary transition-colors">{f.label}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold tabular-nums">{f.count}</span>
                              <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                            </div>
                          </div>
                          <div className="h-6 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", f.barClass)}
                              style={{ width: `${Math.max(4, (f.count / funnelMax) * 100)}%` }}
                            />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Active Vacancies — #49: скрываем когда выбрана одна вакансия */}
              {selectedVacancyId === "all" && (
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Активные вакансии</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push("/hr/vacancies?create=true")}>
                    <Plus className="w-3 h-3" />Новая
                  </Button>
                </div>
                {!loaded ? (
                  <div className="h-40" />
                ) : vacancies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <Briefcase className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Пока нет активных вакансий</p>
                    <Button size="sm" variant="outline" className="gap-1 mt-1" onClick={() => router.push("/hr/vacancies/new")}>
                      <Plus className="w-3 h-3" />Создать вакансию
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vacancies.slice(0, 5).map(v => (
                      <button
                        key={v.id}
                        className="w-full text-left rounded-md border p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                        onClick={() => router.push(`/hr/vacancies/${v.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{v.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {v.city ?? "—"} · {daysSince(v.createdAt)} дн
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* #34: «откл./фин.» переименовано в более понятное
                              «откликов · в работе». В работе = stage IN
                              (primary_contact..offer_sent) — кандидат активно
                              в воронке. */}
                          <Badge variant="secondary" className="text-[10px] h-5">{v.candidateCount} откликов</Badge>
                          {(v.inProgressCount ?? 0) > 0 && (
                            <Badge className="text-[10px] h-5 bg-blue-100 text-blue-700 border-0">
                              {v.inProgressCount} в работе
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* ═══ Efficiency + Events ═══
                #49: «Прогресс вакансий» скрываем при выборе одной — это
                кросс-вакансионный обзор, теряет смысл с фильтром. */}
            <div className={cn("grid grid-cols-1 gap-5", selectedVacancyId === "all" && "lg:grid-cols-2")}>
              {/* #35: блок «Эффективность по вакансиям» переименован в
                  «Прогресс вакансий». Раньше показывалось «done/total» с
                  %% (например 6/432 = 1.4% для свежей вакансии — выглядело
                  как провал, хотя в первые недели это норма). Теперь —
                  «inProgress / total» без процентов: «X в работе из Y
                  откликов». Бар показывает долю «в работе» от total —
                  это нейтральная метрика, без оценки.
                  #49: скрываем при фильтре по конкретной вакансии. */}
              {selectedVacancyId === "all" && (
              <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold">Прогресс вакансий</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Сколько кандидатов в работе по каждой вакансии
                </p>
                {!loaded ? (
                  <div className="h-40" />
                ) : vacancies.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Появится после публикации вакансий
                  </p>
                ) : (
                  <div className="space-y-4">
                    {vacancies.slice(0, 5).map(v => {
                      const total = v.candidateCount || 0
                      const inWork = v.inProgressCount ?? 0
                      const barPct = total > 0 ? Math.min(100, Math.round((inWork / total) * 100)) : 0
                      const barColor = inWork === 0 ? C.orange : inWork >= 5 ? C.green : C.blue
                      const tooltip = `${inWork} в работе из ${total} откликов`
                      return (
                        <div key={v.id}>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <span className="text-xs font-medium truncate">{v.title}</span>
                            <span
                              className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
                              title={tooltip}
                            >
                              <span className="font-medium text-foreground">{inWork}</span>
                              <span className="text-muted-foreground/70"> в работе </span>
                              / {total} <span className="text-muted-foreground/70">откликов</span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden" title={tooltip}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${barPct}%`, backgroundColor: barColor }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              )}

              {/* Ближайшие интервью — реальные данные, фильтр по вакансии из шапки */}
              <UpcomingInterviews selectedVacancyId={selectedVacancyId} />
            </div>

            {/* #36: блоки «Цели месяца», «Источники откликов», «Динамика
                за период» были placeholder'ами «Скоро» — удалены, чтобы
                HR не видел неработающий шум на дашборде. Когда виджеты
                будут готовы — вернутся через систему «Добавить виджет»
                (отдельная будущая задача). */}

          </div>
        </main>
  )
}

// ─── Ближайшие интервью (реальные) ───────────────────────────────────────────

const IV_DOT: Record<string, string> = {
  "Подтверждено": "bg-emerald-500", "Ожидает": "bg-amber-500",
  "Пройдено": "bg-gray-400", "Не явился": "bg-red-500", "Отменено": "bg-gray-300",
}

interface UpcomingItem {
  id: string; candidateId: string | null; candidate: string; vacancy: string
  date: Date; time: string; type: string; format: string; status: string
}

function UpcomingInterviews({ selectedVacancyId }: { selectedVacancyId: string }) {
  const router = useRouter()
  const [items, setItems] = useState<UpcomingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = selectedVacancyId !== "all" ? `&vacancyId=${encodeURIComponent(selectedVacancyId)}` : ""
    Promise.all([
      fetch(`/api/modules/hr/calendar?type=interview${qs}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/modules/hr/vacancies?limit=200`).then(r => r.ok ? r.json() : null),
    ]).then(([evJson, vacJson]) => {
      if (cancelled) return
      const evs = (evJson?.data ?? evJson ?? []) as Array<Record<string, unknown>>
      const vacs = (vacJson?.vacancies ?? vacJson?.data ?? []) as Array<{ id: string; title: string }>
      const vacMap = new Map(vacs.map(v => [v.id, v.title]))
      const now = new Date()
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
      const ALL_ST = ["Подтверждено", "Ожидает", "Пройдено", "Не явился", "Отменено"]
      const mapped: UpcomingItem[] = evs.map((e) => {
        const start = new Date(e.startAt as string)
        const end = new Date((e.endAt as string) ?? (e.startAt as string))
        const ist = e.interviewStatus as string | null
        let status: string
        if (ist && ALL_ST.includes(ist)) status = ist
        else if (e.status === "cancelled") status = "Отменено"
        else if (end < now) status = "Пройдено"
        else if (e.status === "tentative") status = "Ожидает"
        else status = "Подтверждено"
        const vId = e.vacancyId as string | null
        return {
          id: e.id as string,
          candidateId: (e.candidateId as string) ?? null,
          candidate: (e.title as string) || "Интервью",
          vacancy: (vId && vacMap.get(vId)) || "",
          date: start,
          time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
          type: (e.interviewType as string) || "HR",
          format: e.interviewFormat === "Офис" ? "Офис" : "Онлайн",
          status,
        }
      })
        .filter((x) => x.date >= todayStart && x.status !== "Отменено")
        .sort((a, b) => a.date.getTime() - b.date.getTime())
      setItems(mapped)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedVacancyId])

  const fmtDay = (d: Date) => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    const dd = new Date(d); dd.setHours(0, 0, 0, 0)
    const diff = Math.round((dd.getTime() - t.getTime()) / 86400000)
    if (diff === 0) return "Сегодня"
    if (diff === 1) return "Завтра"
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  }

  const shown = items.slice(0, 8)

  return (
    <div className="border rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          Ближайшие интервью
          {!loading && items.length > 0 && <Badge variant="secondary" className="text-xs">{items.length}</Badge>}
        </h3>
        <Link href="/hr/interviews" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
          Все <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/30 rounded-lg animate-pulse" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Ближайших интервью нет</p>
      ) : (
        <div className="flex flex-col divide-y">
          {shown.map(iv => (
            <button
              key={iv.id}
              onClick={() => { if (iv.candidateId) router.push(`/hr/candidates/${iv.candidateId}`) }}
              className="flex items-center gap-3 py-2.5 text-left hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", IV_DOT[iv.status] ?? "bg-gray-300")} />
              <div className="flex flex-col items-center justify-center min-w-[64px] shrink-0">
                <span className="text-[11px] font-medium text-muted-foreground">{fmtDay(iv.date)}</span>
                <span className="text-sm font-semibold text-primary">{iv.time}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{iv.candidate}</p>
                <p className="text-xs text-muted-foreground truncate">{iv.type} · {iv.format}{iv.vacancy ? ` · ${iv.vacancy}` : ""}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HRDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <DashboardView />
      </SidebarInset>
    </SidebarProvider>
  )
}

// ─── Прогресс кандидатов сейчас — #52 ─────────────────────────────────────
// По умолчанию 5 строк. Кнопка «Показать все» раскрывает до 20.
// Фильтр vacancyId передаётся из шапки (#49).
function ProgressWidget({ selectedVacancyId }: { selectedVacancyId: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: C.green }} />
          Прогресс кандидатов сейчас
        </h3>
        <Link
          href="/hr/candidates"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Все <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <CandidatesProgressMiniTable
        limit={5}
        vacancyId={selectedVacancyId}
        expanded={expanded}
        maxExpanded={20}
      />
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-md hover:bg-muted/40"
        >
          {expanded ? "Свернуть" : "Показать все"}
        </button>
      </div>
    </div>
  )
}

// #33: AI-ассистент — 4 карточки с SQL-инсайтами из БД (без LLM-вызовов).
// Endpoint /api/modules/hr/dashboard/ai-insights. selectedVacancyId сейчас
// игнорируется на сервере (для будущего расширения).
interface AiInsight {
  key:         string
  title:       string
  value:       string
  description: string
  link:        string | null
}

function AiInsights({ selectedVacancyId }: { selectedVacancyId: string }) {
  const { user } = useAuth()
  // Скрыто для урезанных пользователей (Ксения Сафронова / Орлинк).
  const hidden = isRestrictedWorkspace(user?.email)
  const [insights, setInsights] = useState<AiInsight[] | null>(null)
  useEffect(() => {
    if (hidden) return
    let cancelled = false
    // #49: фильтр инсайтов по выбранной вакансии
    const qs = selectedVacancyId !== "all" ? `?vacancyId=${encodeURIComponent(selectedVacancyId)}` : ""
    setInsights(null)
    fetch(`/api/modules/hr/dashboard/ai-insights${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { insights?: AiInsight[] } | null) => {
        if (cancelled) return
        if (d?.insights && Array.isArray(d.insights)) setInsights(d.insights)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedVacancyId, hidden])

  if (hidden) return null

  return (
    <div className="rounded-lg border bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] dark:from-[#1a1830] dark:to-[#172030] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: C.purple }} />
        <h2 className="text-sm font-semibold">AI-ассистент</h2>
        <span className="text-[10px] text-muted-foreground">инсайты из ваших данных</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {!insights ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-md p-3 h-20 animate-pulse" />
          ))
        ) : (
          insights.map(ins => {
            const card = (
              <div className="bg-white dark:bg-gray-900 rounded-md p-3 h-full flex flex-col">
                <p className="text-[11px] text-muted-foreground">{ins.title}</p>
                <p className="text-xl font-bold mt-0.5">{ins.value}</p>
                <p className="text-[11px] text-muted-foreground mt-auto line-clamp-2">{ins.description}</p>
              </div>
            )
            return ins.link ? (
              <Link key={ins.key} href={ins.link} className="hover:scale-[1.02] transition-transform">
                {card}
              </Link>
            ) : (
              <div key={ins.key}>{card}</div>
            )
          })
        )}
      </div>
    </div>
  )
}
