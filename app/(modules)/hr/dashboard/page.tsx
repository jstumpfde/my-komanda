"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { COLUMN_ORDER, defaultColumnColors } from "@/lib/column-config"
import { toast } from "sonner"
import {
  DEFAULT_TRACKED_LINKS, SOURCE_TYPE_LABELS, DEFAULT_UTM_BY_SOURCE,
  generateShortCode, getMockAnalytics,
  type TrackedLink, type SourceType, type UtmParams, type LinkAnalytics,
} from "@/lib/utm-types"
import {
  Briefcase, Users, UserCheck, TrendingUp,
  MapPin, AlertTriangle, ChevronRight, BarChart3,
  Plus, Copy, Check, Trash2, Search, Link2, Download, Share2,
  Calendar, ClipboardCheck, Sun,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from "recharts"

// ─── Types ──────────────────────────────────────────────────────────────────

interface KPI {
  activeVacancies: number
  totalCandidates: number
  hiredThisMonth: number
  conversionRate: number
}

interface VacancyRow {
  id: string
  title: string
  city: string | null
  slug: string
  salaryMin: number | null
  salaryMax: number | null
  status: string
  createdAt: string
  candidateCount: number
  decisionCount: number
}

interface DashboardData {
  kpi: KPI
  vacancies: VacancyRow[]
  funnel: {
    totals: Record<string, number>
    byVacancy: Record<string, Record<string, number>>
  }
}

// ─── Mock data for charts ──────────────────────────────────────────────────

const MOCK_VACANCIES: VacancyRow[] = [
  { id: "1", title: "Менеджер по продажам", city: "Москва", slug: "manager", salaryMin: null, salaryMax: 150000, status: "active", createdAt: "2026-03-01", candidateCount: 300, decisionCount: 12 },
  { id: "2", title: "Frontend-разработчик", city: "Удалённо", slug: "frontend", salaryMin: null, salaryMax: 250000, status: "active", createdAt: "2026-03-05", candidateCount: 85, decisionCount: 3 },
  { id: "3", title: "HR-менеджер", city: "Москва", slug: "hr-manager", salaryMin: null, salaryMax: 120000, status: "active", createdAt: "2026-03-10", candidateCount: 42, decisionCount: 0 },
  { id: "4", title: "Бухгалтер", city: "Санкт-Петербург", slug: "accountant", salaryMin: null, salaryMax: 90000, status: "active", createdAt: "2026-03-15", candidateCount: 18, decisionCount: 5 },
]

const MOCK_WEEKLY_RESPONSES = [
  { day: "Пн", value: 45 },
  { day: "Вт", value: 62 },
  { day: "Ср", value: 38 },
  { day: "Чт", value: 78 },
  { day: "Пт", value: 95 },
  { day: "Сб", value: 55 },
  { day: "Вс", value: 102 },
]

const MOCK_SOURCE_DISTRIBUTION = [
  { name: "hh.ru", pct: 62, color: "#3b82f6" },
  { name: "Telegram", pct: 18, color: "#8b5cf6" },
  { name: "Рефералы", pct: 12, color: "#22c55e" },
  { name: "Сайт", pct: 8, color: "#f59e0b" },
]

const MOCK_TIME_TO_HIRE = [
  { month: "Янв", days: 24 },
  { month: "Фев", days: 21 },
  { month: "Мар", days: 18 },
  { month: "Апр", days: 15 },
  { month: "Май", days: 19 },
  { month: "Июн", days: 18 },
]

const MOCK_CONVERSION_STAGES = [
  { stage: "Отклик → Скрининг", pct: 44, color: "#6ee7b7" },
  { stage: "Скрининг → Интервью", pct: 45, color: "#34d399" },
  { stage: "Интервью → Оффер", pct: 52, color: "#10b981" },
  { stage: "Оффер → Выход", pct: 57, color: "#059669" },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "Не указана"
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)} 000 ₽`
    return `${n} ₽`
  }
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `от ${fmt(min)}`
  return `до ${fmt(max!)}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

const ANALYTICS_VACANCIES = [
  { id: "1", name: "Менеджер по продажам", slug: "manager" },
  { id: "2", name: "Frontend-разработчик", slug: "frontend" },
  { id: "3", name: "Оператор склада", slug: "warehouse" },
]
const HH_ACCOUNTS = ["anna@romashka.ru (основной)", "hr2@romashka.ru", "агентство@mail.ru"]
const TG_ACCOUNTS = ["@romashka_hr", "@romashka_jobs", "личный бот HR"]
const tooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }

// ─── Section 1: Greeting ───────────────────────────────────────────────────

function GreetingBlock({ userName, interviews, responses, decisions }: {
  userName: string; interviews: number; responses: number; decisions: number
}) {
  const hints: string[] = []
  if (interviews > 0) hints.push(`${interviews} интервью`)
  if (responses > 0) hints.push(`${responses} новых откликов`)
  if (decisions > 0) hints.push(`${decisions} кандидатов ждут решения`)
  const hintText = hints.length > 0 ? `Сегодня ${hints.join(" · ")}` : "Сегодня всё спокойно"

  return (
    <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <h2 className="text-lg font-semibold">{getGreeting()}, {userName}!</h2>
      </div>
      <p className="text-sm text-muted-foreground mt-1">{hintText}</p>
    </div>
  )
}

// ─── Section 2: KPI Cards ──────────────────────────────────────────────────

const KPI_COLORS = {
  blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300",
  green: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
  purple: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300",
  amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
} as const

function KpiCard({ label, value, color }: { label: string; value: string | number; color: keyof typeof KPI_COLORS }) {
  return (
    <div className={cn("rounded-xl p-4", KPI_COLORS[color])}>
      <p className="text-xs uppercase tracking-wider mb-1 opacity-70">{label}</p>
      <p className="text-2xl font-semibold text-center">{value}</p>
    </div>
  )
}

// ─── Section 3: Vacancy Cards ──────────────────────────────────────────────

function VacancyCard({ v, onClick }: { v: VacancyRow; onClick: () => void }) {
  const interviewCount = v.decisionCount
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow duration-200 group"
    >
      <p className="font-medium text-sm group-hover:text-primary transition-colors">{v.title}</p>
      <p className="text-sm text-muted-foreground mt-1">
        {v.city && <>{v.city} · </>}{formatSalary(v.salaryMin, v.salaryMax)}
      </p>
      <div className="flex items-center gap-2 mt-3">
        <Badge variant="secondary" className="text-xs font-normal bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0">
          {v.candidateCount} откликов
        </Badge>
        <Badge
          variant="secondary"
          className={cn(
            "text-xs font-normal border-0",
            interviewCount === 0
              ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              : interviewCount <= 3
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : interviewCount <= 8
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          )}
        >
          {interviewCount} на интервью
        </Badge>
      </div>
    </button>
  )
}

// ─── Section 4: Funnel Bar ─────────────────────────────────────────────────

function FunnelBar({ stage, count, maxCount, firstCount }: {
  stage: string; count: number; maxCount: number; firstCount: number
}) {
  const cfg = defaultColumnColors[stage]
  if (!cfg) return null
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  const conversion = firstCount > 0 ? Math.round((count / firstCount) * 100) : null
  const isFirst = count === firstCount
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0 text-right">
        <p className="text-sm font-medium">{cfg.label}</p>
        {!isFirst && conversion !== null && (
          <p className="text-[11px] text-muted-foreground">{conversion}% конверсия</p>
        )}
      </div>
      <div className="flex-1 h-9 bg-muted rounded-lg overflow-hidden relative">
        <div
          className="h-full rounded-lg transition-all duration-500"
          style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, ${cfg.from}, ${cfg.to})` }}
        />
        <span className="absolute inset-0 flex items-center px-3 text-sm font-semibold text-white mix-blend-difference">
          {count}
        </span>
      </div>
    </div>
  )
}

// ─── Section 5: Sources Tab ────────────────────────────────────────────────

function SourcesSection() {
  const [links, setLinks] = useState<TrackedLink[]>(DEFAULT_TRACKED_LINKS)
  const [createOpen, setCreateOpen] = useState(false)
  const [analyticsLink, setAnalyticsLink] = useState<TrackedLink | null>(null)
  const [analyticsData, setAnalyticsData] = useState<LinkAnalytics | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filterSource, setFilterSource] = useState("all")
  const [filterVacancy, setFilterVacancy] = useState("all")
  const [searchText, setSearchText] = useState("")
  const [step, setStep] = useState(1)
  const [newVacancy, setNewVacancy] = useState("1")
  const [newSourceType, setNewSourceType] = useState<SourceType>("telegram")
  const [newAccount, setNewAccount] = useState("")
  const [newUtm, setNewUtm] = useState<UtmParams>({ utm_source: "telegram", utm_medium: "social", utm_campaign: "", utm_content: "", utm_term: "" })
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#06b6d4")

  const filtered = links.filter(l => {
    if (filterSource !== "all" && l.sourceType !== filterSource) return false
    if (filterVacancy !== "all" && l.vacancyId !== filterVacancy) return false
    if (searchText && !l.name.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success("Скопировано")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSourceTypeChange = (type: SourceType) => {
    setNewSourceType(type)
    setNewUtm(prev => ({ ...prev, ...DEFAULT_UTM_BY_SOURCE[type] }))
    setNewAccount("")
  }

  const handleCreate = () => {
    const vac = ANALYTICS_VACANCIES.find(v => v.id === newVacancy)!
    const code = generateShortCode()
    const utmString = Object.entries(newUtm).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    const link: TrackedLink = {
      id: `lnk-${code}`, name: newName || `${SOURCE_TYPE_LABELS[newSourceType]} ${vac.name}`,
      vacancyId: vac.id, vacancyName: vac.name, sourceType: newSourceType, account: newAccount || "—",
      color: newColor, utm: { ...newUtm }, fullUrl: `/vacancy/${vac.slug}?${utmString}`,
      shortUrl: `hrf.link/${code}`, clicks: 0, responses: 0, conversion: 0, createdAt: new Date(),
    }
    setLinks(prev => [link, ...prev])
    setCreateOpen(false); setStep(1); setNewName("")
    setNewUtm({ utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" })
    toast.success(`Ссылка создана: ${link.shortUrl}`)
  }

  const handleDelete = (id: string) => { setLinks(prev => prev.filter(l => l.id !== id)); toast.error("Ссылка удалена") }
  const openAnalytics = (link: TrackedLink) => { setAnalyticsLink(link); setAnalyticsData(getMockAnalytics(link.id)) }

  return (
    <>
      <div className="border rounded-xl p-6">
        <div className="mb-1">
          <h2 className="text-base font-semibold">Источники</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Источники, UTM-ссылки, аналитика переходов и конверсий</p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button className="gap-1.5" size="sm" onClick={() => { setCreateOpen(true); setStep(1) }}><Plus className="w-4 h-4" />Создать ссылку</Button>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Поиск по названию..." value={searchText} onChange={e => setSearchText(e.target.value)} />
          </div>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Источник" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все источники</SelectItem>
              {(Object.entries(SOURCE_TYPE_LABELS) as [SourceType, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterVacancy} onValueChange={setFilterVacancy}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Вакансия" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все вакансии</SelectItem>
              {ANALYTICS_VACANCIES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="w-3 px-2 py-3" />
                <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Название</th>
                <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Источник</th>
                <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Аккаунт</th>
                <th className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Переходов</th>
                <th className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Откликов</th>
                <th className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Конверсия</th>
                <th className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Создана</th>
                <th className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(link => (
                <tr key={link.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-2 py-3"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: link.color }} /></td>
                  <td className="px-3 py-3"><p className="text-sm font-medium text-foreground">{link.name}</p><p className="text-[10px] text-muted-foreground font-mono">{link.shortUrl}</p></td>
                  <td className="px-3 py-3"><Badge variant="outline" className="text-xs" style={{ borderColor: link.color + "40", color: link.color }}>{SOURCE_TYPE_LABELS[link.sourceType]}</Badge></td>
                  <td className="px-3 py-3 text-sm text-muted-foreground">{link.account}</td>
                  <td className="text-center px-3 py-3 text-sm font-medium text-foreground">{link.clicks}</td>
                  <td className="text-center px-3 py-3 text-sm font-medium text-foreground">{link.responses}</td>
                  <td className="text-center px-3 py-3"><span className={cn("text-sm font-semibold", link.conversion >= 30 ? "text-emerald-600" : "text-foreground")}>{link.conversion}%</span></td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{link.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}{link.auto && <Badge variant="secondary" className="ml-1 text-[9px] py-0 h-4">авто</Badge>}</td>
                  <td className="text-center px-3 py-3">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Аналитика" onClick={() => openAnalytics(link)}><BarChart3 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Копировать" onClick={() => handleCopy(link.shortUrl, link.id)}>{copiedId === link.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}</Button>
                      {!link.auto && <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить" onClick={() => handleDelete(link.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Нет ссылок</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" />Создать ссылку · Шаг {step}/3</DialogTitle></DialogHeader>
          <Progress value={(step / 3) * 100} className="h-1.5 mb-2" />
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label className="text-sm">Вакансия</Label><Select value={newVacancy} onValueChange={setNewVacancy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ANALYTICS_VACANCIES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-sm">Тип источника</Label><Select value={newSourceType} onValueChange={v => handleSourceTypeChange(v as SourceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.entries(SOURCE_TYPE_LABELS) as [SourceType, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              {newSourceType === "hh" && <div className="space-y-1.5"><Label className="text-sm">Аккаунт hh.ru</Label><Select value={newAccount} onValueChange={setNewAccount}><SelectTrigger><SelectValue placeholder="Выберите аккаунт" /></SelectTrigger><SelectContent>{HH_ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>}
              {newSourceType === "telegram" && <div className="space-y-1.5"><Label className="text-sm">Канал / бот</Label><Select value={newAccount} onValueChange={setNewAccount}><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger><SelectContent>{TG_ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>}
              {newSourceType === "whatsapp" && <div className="space-y-1.5"><Label className="text-sm">Номер WhatsApp</Label><Input value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="+7 999 123-45-67" /></div>}
              {newSourceType === "custom" && <div className="space-y-1.5"><Label className="text-sm">Название источника</Label><Input value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="Введите вручную" /></div>}
              <Button className="w-full" onClick={() => setStep(2)}>Далее</Button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">UTM-параметры заполнены автоматически. Можно отредактировать.</p>
              {(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as (keyof UtmParams)[]).map(key => (
                <div key={key} className="space-y-1"><Label className="text-xs font-mono text-muted-foreground">{key}</Label><Input value={newUtm[key]} onChange={e => setNewUtm(prev => ({ ...prev, [key]: e.target.value }))} placeholder={key} className="h-8 text-sm font-mono" /></div>
              ))}
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Назад</Button><Button className="flex-1" onClick={() => setStep(3)}>Далее</Button></div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label className="text-sm">Короткое имя для списка</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="TG канал HR март" /></div>
              <div className="space-y-1.5">
                <Label className="text-sm">Цвет метки</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-10 h-10 rounded-lg border cursor-pointer" />
                  <Input value={newColor} onChange={e => setNewColor(e.target.value)} className="w-28 h-9 font-mono text-sm" />
                  <div className="flex gap-1">{["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4"].map(c => <button key={c} className={cn("w-7 h-7 rounded-md border-2", newColor === c ? "border-foreground" : "border-transparent")} style={{ backgroundColor: c }} onClick={() => setNewColor(c)} />)}</div>
                </div>
              </div>
              <Separator />
              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <p className="text-xs text-muted-foreground">Результат:</p>
                <p className="text-xs font-mono text-foreground break-all">{`/vacancy/${ANALYTICS_VACANCIES.find(v => v.id === newVacancy)?.slug}?${Object.entries(newUtm).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&")}`}</p>
                <p className="text-xs font-mono text-primary">hrf.link/{generateShortCode()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Скачать QR PNG (заглушка)")}><Download className="w-3.5 h-3.5" /> QR PNG</Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Скачать PDF листовку (заглушка)")}><Download className="w-3.5 h-3.5" /> PDF листовка</Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Поделиться (заглушка)")}><Share2 className="w-3.5 h-3.5" /> Поделиться</Button>
              </div>
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Назад</Button><Button className="flex-1" onClick={handleCreate}>Создать ссылку</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Analytics sheet */}
      <Sheet open={!!analyticsLink} onOpenChange={open => { if (!open) { setAnalyticsLink(null); setAnalyticsData(null) } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />{analyticsLink?.name}</SheetTitle></SheetHeader>
          {analyticsLink && analyticsData && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 border text-center"><p className="text-lg font-bold text-foreground">{analyticsLink.clicks}</p><p className="text-xs text-muted-foreground">Переходов</p></div>
                <div className="p-3 rounded-lg bg-muted/50 border text-center"><p className="text-lg font-bold text-foreground">{analyticsLink.responses}</p><p className="text-xs text-muted-foreground">Откликов</p></div>
                <div className="p-3 rounded-lg bg-muted/50 border text-center"><p className="text-lg font-bold text-emerald-600">{analyticsLink.conversion}%</p><p className="text-xs text-muted-foreground">Конверсия</p></div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Переходы по дням</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={analyticsData.dailyClicks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="clicks" name="Переходы" stroke={analyticsLink.color} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="responses" name="Отклики" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Воронка по этой ссылке</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={analyticsData.funnelStages} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" /><XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={85} stroke="var(--muted-foreground)" /><Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Кандидатов" fill={analyticsLink.color} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Кандидаты с этой ссылки</p>
                <div className="space-y-1.5">
                  {analyticsData.candidates.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border text-sm">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">{c.stage}</Badge><span className="text-xs text-muted-foreground">{c.date.toLocaleDateString("ru-RU")}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Inner content ─────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [funnelVacancy, setFunnelVacancy] = useState("__all__")

  useEffect(() => {
    fetch("/api/modules/hr/dashboard/stats")
      .then(r => r.json())
      .then((json) => { if (json.kpi) setData(json as DashboardData) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Use API data if available, otherwise mock
  const vacancies = data?.vacancies ?? MOCK_VACANCIES
  const kpi = data?.kpi ?? { activeVacancies: 4, totalCandidates: 1400, hiredThisMonth: 82, conversionRate: 5.9 }

  const funnelData = useMemo(() => {
    if (!data) return COLUMN_ORDER.map(stage => ({
      stage,
      count: { new: 523, demo: 318, decision: 1, interview: 194, final_decision: 5, hired: 92 }[stage] ?? 0,
    }))
    const src = funnelVacancy === "__all__" ? data.funnel.totals : data.funnel.byVacancy[funnelVacancy] ?? {}
    return COLUMN_ORDER.map(stage => ({ stage, count: src[stage] ?? 0 }))
  }, [data, funnelVacancy])

  const funnelMax = Math.max(...funnelData.map(d => d.count), 1)
  const firstStageCount = funnelData[0]?.count ?? 1

  const totalDecisionCount = vacancies.reduce((sum, v) => sum + v.decisionCount, 0)
  const firstName = (user.name ?? "").split(" ")[0] || "HR"

  return (
    <div className="py-6 space-y-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

      {/* ─── Section 1: Greeting ─── */}
      <GreetingBlock
        userName={firstName}
        interviews={2}
        responses={45}
        decisions={totalDecisionCount}
      />

      {/* ─── Section 2: KPI Cards ─── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Активных вакансий" value={kpi.activeVacancies} color="blue" />
          <KpiCard label="Всего кандидатов" value={kpi.totalCandidates.toLocaleString("ru-RU")} color="green" />
          <KpiCard label="Нанято за месяц" value={kpi.hiredThisMonth} color="purple" />
          <KpiCard label="Средняя конверсия" value={`${kpi.conversionRate}%`} color="amber" />
        </div>
      )}

      {/* ─── Section 3: Active Vacancies ─── */}
      <div>
        <h2 className="text-base font-semibold mb-3">Активные вакансии ({vacancies.length})</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : vacancies.length === 0 ? (
          <div className="border rounded-xl p-12 text-center text-muted-foreground">
            <Briefcase className="size-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Нет активных вакансий</p>
            <p className="text-sm mt-1">Опубликуйте вакансию, чтобы увидеть статистику</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {vacancies.map(v => (
              <VacancyCard key={v.id} v={v} onClick={() => router.push(`/hr/vacancies/${v.id}`)} />
            ))}
            <button onClick={() => router.push('/hr/vacancies?create=true')} className="w-full text-left rounded-xl border border-dashed p-4 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary min-h-[120px]">
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Добавить вакансию</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── Section 4: Hiring Funnel ─── */}
      <div className="border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Воронка найма</h2>
          <Select value={funnelVacancy} onValueChange={setFunnelVacancy}>
            <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Все вакансии" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все вакансии</SelectItem>
              {(data?.vacancies ?? MOCK_VACANCIES).map(v => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          {funnelData.every(d => d.count === 0) ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="size-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Нет данных по воронке</p>
            </div>
          ) : (
            funnelData.map((d) => (
              <FunnelBar
                key={d.stage}
                stage={d.stage}
                count={d.count}
                maxCount={funnelMax}
                firstCount={firstStageCount}
              />
            ))
          )}
        </div>
      </div>

      {/* ─── Section 5: Sources ─── */}
      <SourcesSection />

      {/* ─── Section 6: Two charts row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly responses */}
        <div className="border rounded-xl p-6">
          <h2 className="text-base font-semibold mb-4">Динамика откликов за неделю</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={MOCK_WEEKLY_RESPONSES}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="value" name="Отклики" stroke="#10b981" strokeWidth={2} fill="url(#areaGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Source distribution */}
        <div className="border rounded-xl p-6">
          <h2 className="text-base font-semibold mb-4">Источники кандидатов</h2>
          <div className="space-y-4">
            {MOCK_SOURCE_DISTRIBUTION.map(s => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-sm text-muted-foreground">{s.pct}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Section 7: Two more charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Time to hire */}
        <div className="border rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1">Время закрытия вакансий</h2>
          <p className="text-3xl font-bold text-amber-600 mb-4">18 <span className="text-base font-medium text-muted-foreground">дней в среднем</span></p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={MOCK_TIME_TO_HIRE}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="days" name="Дней" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Conversion by stages */}
        <div className="border rounded-xl p-6">
          <h2 className="text-base font-semibold mb-4">Конверсия по этапам</h2>
          <div className="space-y-4">
            {MOCK_CONVERSION_STAGES.map(s => (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{s.stage}</span>
                  <span className="text-sm text-muted-foreground">{s.pct}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function HRDashboardPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <Suspense fallback={null}>
            <DashboardContent />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
