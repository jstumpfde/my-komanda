"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  ResponsiveContainer, LineChart, Line,
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "Не указана"
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
  if (min && max) return `${fmt(min)} – ${fmt(max)} ₽`
  if (min) return `от ${fmt(min)} ₽`
  return `до ${fmt(max!)} ₽`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType
  label: string
  value: string | number
  accent: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent)}>
            <Icon className="size-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Vacancy Card ───────────────────────────────────────────────────────────

function VacancyCard({ v, onClick }: { v: VacancyRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border bg-card p-4 hover:bg-accent/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{v.title}</p>
          {v.city && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="size-3" />{v.city}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{formatSalary(v.salaryMin, v.salaryMax)}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 mt-1 group-hover:text-primary transition-colors" />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Badge variant="secondary" className="text-xs font-normal">
          <Users className="size-3 mr-1" />{v.candidateCount} кандидат{v.candidateCount === 1 ? "" : v.candidateCount < 5 ? "а" : "ов"}
        </Badge>
        {v.decisionCount > 0 && (
          <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-0 text-xs font-normal">
            <AlertTriangle className="size-3 mr-1" />{v.decisionCount} ждут решения
          </Badge>
        )}
      </div>
    </button>
  )
}

// ─── Funnel Bar ─────────────────────────────────────────────────────────────

function FunnelBar({ stage, count, maxCount, prevCount }: {
  stage: string; count: number; maxCount: number; prevCount: number
}) {
  const cfg = defaultColumnColors[stage]
  if (!cfg) return null
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  const conversion = prevCount > 0 ? Math.round((count / prevCount) * 100) : null
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-right">
        <p className="text-sm font-medium">{cfg.label}</p>
        {conversion !== null && <p className="text-[11px] text-muted-foreground">{conversion}% конверсия</p>}
      </div>
      <div className="flex-1 h-9 bg-muted rounded-lg overflow-hidden relative">
        <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, ${cfg.from}, ${cfg.to})` }} />
        <span className="absolute inset-0 flex items-center px-3 text-sm font-semibold text-white mix-blend-difference">{count}</span>
      </div>
    </div>
  )
}

// ─── Analytics: Sources Tab (from /hr/analytics) ────────────────────────────

const ANALYTICS_VACANCIES = [
  { id: "1", name: "Менеджер по продажам", slug: "manager" },
  { id: "2", name: "Frontend-разработчик", slug: "frontend" },
  { id: "3", name: "Оператор склада", slug: "warehouse" },
]
const HH_ACCOUNTS = ["anna@romashka.ru (основной)", "hr2@romashka.ru", "агентство@mail.ru"]
const TG_ACCOUNTS = ["@romashka_hr", "@romashka_jobs", "личный бот HR"]
const tooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }

function AnalyticsOverviewTab({ vacancyFilter, onVacancyChange }: { vacancyFilter: string; onVacancyChange: (v: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={vacancyFilter} onValueChange={onVacancyChange}>
          <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Все вакансии" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все вакансии</SelectItem>
            {ANALYTICS_VACANCIES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="size-14 text-muted-foreground/25 mb-4" />
        <p className="text-muted-foreground font-medium">Раздел в разработке</p>
        <p className="text-sm text-muted-foreground/60 mt-1">Здесь появится аналитика по воронке найма</p>
      </div>
    </div>
  )
}

function SourcesTab() {
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <p className="text-sm text-muted-foreground">UTM-ссылки, аналитика переходов и конверсий</p>
        <Button className="gap-1.5" onClick={() => { setCreateOpen(true); setStep(1) }}><Plus className="w-4 h-4" />Создать ссылку</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-3 px-2 py-3" />
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Название</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Источник</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Аккаунт</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3">Переходов</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3">Откликов</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3">Конверсия</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3">Создана</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(link => (
                  <tr key={link.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-3"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: link.color }} /></td>
                    <td className="px-3 py-3"><p className="text-sm font-medium text-foreground">{link.name}</p><p className="text-[10px] text-muted-foreground font-mono">{link.shortUrl}</p></td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs" style={{ borderColor: link.color + "40", color: link.color }}>{SOURCE_TYPE_LABELS[link.sourceType]}</Badge></td>
                    <td className="px-3 py-3 text-sm text-muted-foreground">{link.account}</td>
                    <td className="text-right px-3 py-3 text-sm font-medium text-foreground">{link.clicks}</td>
                    <td className="text-right px-3 py-3 text-sm font-medium text-foreground">{link.responses}</td>
                    <td className="text-right px-3 py-3"><span className={cn("text-sm font-semibold", link.conversion >= 30 ? "text-emerald-600" : "text-foreground")}>{link.conversion}%</span></td>
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
        </CardContent>
      </Card>

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

// ─── Greeting Block ─────────────────────────────────────────────────────────

function GreetingBlock({ userName, decisionCount }: { userName: string; decisionCount: number }) {
  return (
    <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Sun className="size-5 text-amber-500" />
        <h2 className="text-lg font-semibold">{getGreeting()}, {userName}!</h2>
      </div>
      <div className="flex flex-wrap gap-4 mt-3">
        {decisionCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="size-4" />
            <span>У вас <strong>{decisionCount}</strong> кандидат{decisionCount === 1 ? "" : decisionCount < 5 ? "а" : "ов"} ждут решения</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="size-4" />
          <span>Сегодня <strong>2</strong> интервью запланировано</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClipboardCheck className="size-4" />
          <span>Обработано <strong>0</strong> кандидатов за сегодня</span>
        </div>
      </div>
    </div>
  )
}

// ─── Inner content (needs Suspense for useSearchParams) ─────────────────────

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const initialTab = searchParams.get("tab") === "analytics" ? "analytics" : "overview"
  const [tab, setTab] = useState(initialTab)
  const [funnelVacancy, setFunnelVacancy] = useState("__all__")
  const [analyticsVacancyFilter, setAnalyticsVacancyFilter] = useState("all")

  useEffect(() => {
    fetch("/api/modules/hr/dashboard/stats")
      .then(r => r.json())
      .then((json) => { if (json.kpi) setData(json as DashboardData) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalDecisionCount = useMemo(
    () => data?.vacancies.reduce((sum, v) => sum + v.decisionCount, 0) ?? 0,
    [data],
  )

  const needsAttention = useMemo(
    () => data?.vacancies.filter(v => v.decisionCount > 0) ?? [],
    [data],
  )

  const funnelData = useMemo(() => {
    if (!data) return []
    const src = funnelVacancy === "__all__" ? data.funnel.totals : data.funnel.byVacancy[funnelVacancy] ?? {}
    return COLUMN_ORDER.map(stage => ({ stage, count: src[stage] ?? 0 }))
  }, [data, funnelVacancy])

  const funnelMax = Math.max(...funnelData.map(d => d.count), 1)

  const firstName = (user.name ?? "").split(" ")[0] || "HR"

  return (
    <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      {/* Greeting */}
      <GreetingBlock userName={firstName} decisionCount={totalDecisionCount} />

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard icon={Briefcase} label="Активных вакансий" value={data.kpi.activeVacancies} accent="bg-blue-500" />
          <KpiCard icon={Users} label="Всего кандидатов" value={data.kpi.totalCandidates} accent="bg-violet-500" />
          <KpiCard icon={UserCheck} label="Нанято за месяц" value={data.kpi.hiredThisMonth} accent="bg-emerald-500" />
          <KpiCard icon={TrendingUp} label="Средняя конверсия" value={`${data.kpi.conversionRate}%`} accent="bg-amber-500" />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="funnel">Воронка</TabsTrigger>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
        </TabsList>

        {/* ═══ Tab: Обзор ═══ */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : !data || data.vacancies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Briefcase className="size-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Нет активных вакансий</p>
                <p className="text-sm mt-1">Опубликуйте вакансию, чтобы увидеть статистику</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {needsAttention.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-3">
                    <AlertTriangle className="size-4" />Требуют внимания ({needsAttention.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {needsAttention.map(v => <VacancyCard key={v.id} v={v} onClick={() => router.push(`/hr/vacancies/${v.id}`)} />)}
                  </div>
                </div>
              )}
              <div>
                <h2 className="text-sm font-semibold text-foreground/80 mb-3">Активные вакансии ({data.vacancies.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.vacancies.map(v => <VacancyCard key={v.id} v={v} onClick={() => router.push(`/hr/vacancies/${v.id}`)} />)}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══ Tab: Воронка ═══ */}
        <TabsContent value="funnel" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Select value={funnelVacancy} onValueChange={setFunnelVacancy}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Все вакансии" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Все вакансии</SelectItem>
                {data?.vacancies.map(v => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-6 space-y-3">
              {funnelData.every(d => d.count === 0) ? (
                <div className="py-8 text-center text-muted-foreground"><Users className="size-10 mx-auto mb-3 opacity-30" /><p className="font-medium">Нет данных по воронке</p></div>
              ) : (
                funnelData.map((d, i) => <FunnelBar key={d.stage} stage={d.stage} count={d.count} maxCount={funnelMax} prevCount={i > 0 ? funnelData[i - 1].count : d.count} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab: Аналитика ═══ */}
        <TabsContent value="analytics" className="mt-4">
          <Tabs defaultValue="overview">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Обзор</TabsTrigger>
              <TabsTrigger value="sources">Источники</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><AnalyticsOverviewTab vacancyFilter={analyticsVacancyFilter} onVacancyChange={setAnalyticsVacancyFilter} /></TabsContent>
            <TabsContent value="sources"><SourcesTab /></TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
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
