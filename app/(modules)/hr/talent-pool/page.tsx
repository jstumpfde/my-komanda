"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Plus, Upload, Rocket, Users, Mail, BarChart3, Search,
  MoreHorizontal, Heart, Pause, Play, Sparkles, Send,
  TrendingUp, Eye, MessageSquare, UserPlus, Clock, Trash2, GripVertical,
  ClipboardList, ChevronDown, ChevronRight, FileText,
} from "lucide-react"
import { ScoringBadge, type ScoreBreakdown } from "@/components/talent-pool/scoring-badge"
import { ReferralTab } from "@/components/talent-pool/referral-tab"
import { CampaignsTab } from "@/components/talent-pool/campaigns-tab"
import { AnalyticsTab } from "@/components/talent-pool/analytics-tab"
import { INITIAL_SOURCES, ICON_MAP, type SourceItem } from "@/components/talent-pool/sources-manager"
import { FormsTab } from "@/components/talent-pool/forms-tab"

// ─── Types ──────────────────────────────────────────────
type TalentStatus = "cold" | "warming" | "hot" | "ideal" | "refused" | "hired"

interface TalentCandidate {
  id: string
  name: string
  position: string
  company: string
  source: string
  referralName?: string
  status: TalentStatus
  lastContact: Date
  email: string
  phone: string
  telegram: string
  comment: string
  score: number
  scoreBreakdown: ScoreBreakdown
}

interface CampaignStep {
  id: string
  day: number
  text: string
  channel: "tg" | "whatsapp" | "email"
}

interface Campaign {
  id: string
  name: string
  candidates: number
  currentStep: number
  totalSteps: number
  openRate: number
  status: "active" | "paused" | "completed"
  steps: CampaignStep[]
}

// ─── Status config ──────────────────────────────────────
const STATUS_CFG: Record<TalentStatus, { label: string; emoji: string; cls: string }> = {
  cold: { label: "Холодный", emoji: "🟡", cls: "bg-amber-500/10 text-amber-700 border-transparent px-2.5 py-0.5" },
  warming: { label: "В прогреве", emoji: "🔵", cls: "bg-blue-500/10 text-blue-700 border-transparent px-2.5 py-0.5" },
  hot: { label: "Горячий", emoji: "🟢", cls: "bg-emerald-500/10 text-emerald-700 border-transparent px-2.5 py-0.5" },
  ideal: { label: "Идеальный 🔥", emoji: "🔴", cls: "bg-red-500/10 text-red-700 border-transparent px-2.5 py-0.5" },
  refused: { label: "Отказался", emoji: "🔴", cls: "bg-red-500/5 text-red-600 border-transparent px-2.5 py-0.5" },
  hired: { label: "Нанят", emoji: "⚫", cls: "bg-muted text-muted-foreground border-transparent px-2.5 py-0.5" },
}

function scoreToStatus(score: number): TalentStatus {
  if (score >= 86) return "ideal"
  if (score >= 61) return "hot"
  if (score >= 31) return "warming"
  return "cold"
}

const CHANNEL_LABELS: Record<string, string> = { tg: "Telegram", whatsapp: "WhatsApp", email: "Email" }

// ─── Test data ──────────────────────────────────────────
const INITIAL_CANDIDATES: TalentCandidate[] = [
  { id: "t1", name: "Андрей Фёдоров", position: "Менеджер по продажам", company: "СберРешения", source: "Реферал", referralName: "Анна Иванова", status: "warming", lastContact: new Date(Date.now() - 14 * 86400000), email: "andrey@mail.ru", phone: "+7 903 111-22-33", telegram: "@andrey_f", comment: "Опыт 5 лет B2B", score: 45, scoreBreakdown: { experience: 60, skills: 45, culture: 35, motivation: 40, availability: 45 } },
  { id: "t2", name: "Ксения Воробьёва", position: "HR-менеджер", company: "Яндекс", source: "LinkedIn", status: "hot", lastContact: new Date(Date.now() - 3 * 86400000), email: "ks@yandex.ru", phone: "+7 916 444-55-66", telegram: "@ks_hr", comment: "Ищет новые проекты", score: 72, scoreBreakdown: { experience: 80, skills: 75, culture: 70, motivation: 65, availability: 70 } },
  { id: "t3", name: "Максим Егоров", position: "DevOps инженер", company: "Ozon", source: "Конференция", status: "ideal", lastContact: new Date(Date.now() - 1 * 86400000), email: "max@ozon.ru", phone: "+7 925 777-88-99", telegram: "@maxdev", comment: "Заинтересован в оффере", score: 88, scoreBreakdown: { experience: 92, skills: 90, culture: 85, motivation: 88, availability: 85 } },
  { id: "t4", name: "Ольга Петрова", position: "Бухгалтер", company: "1С-Рарус", source: "Реферал", referralName: "Дмитрий Козлов", status: "cold", lastContact: new Date(Date.now() - 30 * 86400000), email: "olga@1c.ru", phone: "+7 999 000-11-22", telegram: "", comment: "Не рассматривает смену работы", score: 23, scoreBreakdown: { experience: 30, skills: 20, culture: 25, motivation: 15, availability: 25 } },
  { id: "t5", name: "Роман Кузнецов", position: "Product Manager", company: "VK", source: "hh.ru", status: "warming", lastContact: new Date(Date.now() - 7 * 86400000), email: "roman@vk.com", phone: "+7 912 333-44-55", telegram: "@roman_pm", comment: "", score: 55, scoreBreakdown: { experience: 65, skills: 55, culture: 50, motivation: 50, availability: 55 } },
]

const INITIAL_CAMPAIGNS: Campaign[] = [
  { id: "c1", name: "Продажники Q2 2026", candidates: 34, currentStep: 2, totalSteps: 5, openRate: 72, status: "active", steps: [
    { id: "s1", day: 0, text: "Здравствуйте! Мы ищем сильного менеджера по продажам. Хотели бы рассказать о позиции?", channel: "tg" },
    { id: "s2", day: 3, text: "Подготовили обзор позиции с цифрами. Взгляните?", channel: "tg" },
    { id: "s3", day: 7, text: "Статья: как растут менеджеры в нашей команде →", channel: "email" },
    { id: "s4", day: 30, text: "Напоминаю о вакансии — позиция ещё открыта", channel: "tg" },
    { id: "s5", day: 90, text: "Последнее сообщение: скоро закрываем позицию", channel: "tg" },
  ]},
  { id: "c2", name: "IT-специалисты — прогрев", candidates: 18, currentStep: 1, totalSteps: 4, openRate: 65, status: "paused", steps: [
    { id: "s6", day: 0, text: "Привет! Видели ваш профиль, впечатляет стек. Хотели бы пообщаться", channel: "tg" },
    { id: "s7", day: 5, text: "Наш стек: React + Go + K8s. Вот что делаем →", channel: "email" },
    { id: "s8", day: 14, text: "Открылась позиция Senior — может заинтересовать?", channel: "tg" },
    { id: "s9", day: 60, text: "Как дела? Появились новые позиции в команде", channel: "tg" },
  ]},
]

// ─── Component ──────────────────────────────────────────
export default function TalentPoolPage() {
  const [candidates, setCandidates] = useState(INITIAL_CANDIDATES)
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS)
  const [addOpen, setAddOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [sources] = useState<SourceItem[]>(INITIAL_SOURCES)
  const [expandedFilterSources, setExpandedFilterSources] = useState<Set<string>>(new Set())
  const [thanked, setThanked] = useState<Set<string>>(new Set())

  const enabledSources = sources.filter((s) => s.enabled)

  // Add candidate form
  const [form, setForm] = useState({ name: "", position: "", company: "", source: "", email: "", phone: "", telegram: "", comment: "" })

  // Campaign form
  const [campForm, setCampForm] = useState({ name: "", type: "invite", steps: [{ id: "ns1", day: 0, text: "", channel: "tg" as const }] as CampaignStep[] })

  const handleAdd = () => {
    if (!form.name.trim()) return
    setCandidates((p) => [...p, { ...form, id: `t-${Date.now()}`, status: "cold" as TalentStatus, lastContact: new Date(), referralName: undefined, score: 0, scoreBreakdown: { experience: 0, skills: 0, culture: 0, motivation: 0, availability: 0 } }])
    setForm({ name: "", position: "", company: "", source: "", email: "", phone: "", telegram: "", comment: "" })
    setAddOpen(false)
    toast.success("Кандидат добавлен в Talent Pool")
  }

  const handleCreateCampaign = () => {
    if (!campForm.name.trim()) return
    setCampaigns((p) => [...p, { id: `c-${Date.now()}`, name: campForm.name, candidates: 0, currentStep: 0, totalSteps: campForm.steps.length, openRate: 0, status: "active", steps: campForm.steps }])
    setCampForm({ name: "", type: "invite", steps: [{ id: "ns1", day: 0, text: "", channel: "tg" }] })
    setCampaignOpen(false)
    toast.success("Кампания создана")
  }

  const filtered = candidates.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.position.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    if (selectedSources.size > 0) {
      // Match by source name directly, or by parent source if a subcategory is selected
      const matchesDirect = selectedSources.has(c.source)
      const parentSource = enabledSources.find((s) => s.subcategories?.some((sub) => selectedSources.has(sub)) && s.name === c.source)
      if (!matchesDirect && !parentSource) return false
    }
    return true
  })

  const toggleSourceFilter = (name: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleExpandFilter = (id: string) => {
    setExpandedFilterSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Count only top-level selected sources for label
  const selectedTopLevel = enabledSources.filter((s) => selectedSources.has(s.name))
  const sourceFilterLabel = selectedSources.size === 0
    ? "Все источники"
    : selectedTopLevel.length <= 2 && selectedSources.size === selectedTopLevel.length
      ? selectedTopLevel.map((s) => s.name).join(", ")
      : `${selectedSources.size} источн.`

  const formatDate = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-semibold">Talent Pool</h1>
                <p className="text-sm text-muted-foreground">База пассивных кандидатов и кампании прогрева</p>
              </div>
            </div>

            <Tabs defaultValue="base">
              <TabsList className="mb-4">
                <TabsTrigger value="base" className="gap-1.5"><Users className="w-3.5 h-3.5" />База</TabsTrigger>
                <TabsTrigger value="campaigns" className="gap-1.5"><Rocket className="w-3.5 h-3.5" />Кампании</TabsTrigger>
                <TabsTrigger value="referrals" className="gap-1.5"><Heart className="w-3.5 h-3.5" />Рефералы</TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Аналитика</TabsTrigger>
                <TabsTrigger value="forms" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Формы</TabsTrigger>
              </TabsList>

              {/* ═══ TAB: База ═══ */}
              <TabsContent value="base" className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input className="pl-8 h-8 text-sm" placeholder="Поиск по имени или должности..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36 h-8 text-xs border border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border border-border min-w-[140px] justify-between">
                        <span className="truncate">{sourceFilterLabel}</span>
                        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 max-h-80 overflow-y-auto" align="start">
                      {selectedSources.size > 0 && (
                        <button className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 mb-1" onClick={() => setSelectedSources(new Set())}>
                          Сбросить все
                        </button>
                      )}
                      <div className="space-y-0.5">
                        {enabledSources.map((s) => {
                          const hasSubs = s.subcategories && s.subcategories.length > 0
                          const isExpanded = expandedFilterSources.has(s.id)
                          const Icon = ICON_MAP[s.icon]
                          return (
                            <div key={s.id}>
                              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/40">
                                {hasSubs ? (
                                  <button className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground" onClick={() => toggleExpandFilter(s.id)}>
                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  </button>
                                ) : (
                                  <span className="w-4" />
                                )}
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <Checkbox checked={selectedSources.has(s.name)} onCheckedChange={() => toggleSourceFilter(s.name)} />
                                  {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                  <span className="text-xs">{s.name}</span>
                                </label>
                              </div>
                              {hasSubs && isExpanded && (
                                <div className="ml-6 space-y-0.5">
                                  {s.subcategories!.map((sub) => (
                                    <label key={sub} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer">
                                      <Checkbox checked={selectedSources.has(sub)} onCheckedChange={() => toggleSourceFilter(sub)} />
                                      <span className="text-[11px] text-muted-foreground">{sub}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Upload className="w-3.5 h-3.5" />Загрузить CSV</Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAddOpen(true)}><Plus className="w-3.5 h-3.5" />Добавить</Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 border border-purple-700" onClick={() => setCampaignOpen(true)}><Rocket className="w-3.5 h-3.5" />Запустить кампанию</Button>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Имя</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Должность</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Компания</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Скоринг</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Контакт</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => {
                          const st = STATUS_CFG[c.status]
                          return (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-2.5 text-[13px] font-medium text-foreground/85">{c.name}</td>
                              <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{c.position}</td>
                              <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{c.company}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[13px]">{c.source}</span>
                                  {c.referralName && (
                                    <>
                                      <span className="text-[11px] text-muted-foreground">· {c.referralName}</span>
                                      <button className="text-pink-500 hover:scale-110 transition-transform" onClick={() => { setThanked((prev) => { const next = new Set(prev); next.add(c.id); return next }); toast.success(`Спасибо отправлено ${c.referralName}!`) }}><Heart className={cn("w-3 h-3", thanked.has(c.id) && "fill-pink-500")} /></button>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex justify-center">
                                  <ScoringBadge score={c.score} breakdown={c.scoreBreakdown} size="sm" />
                                </div>
                              </td>
                              <td className="px-3 py-2.5"><Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.emoji} {st.label}</Badge></td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(c.lastContact)}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Написать" onClick={() => toast.info("Открыть чат")}><Send className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Удалить" onClick={() => setCandidates((p) => p.filter((x) => x.id !== c.id))}><Trash2 className="w-3 h-3" /></Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Нет кандидатов</td></tr>}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ═══ TAB: Кампании ═══ */}
              <TabsContent value="campaigns" className="space-y-4">
                <CampaignsTab />
              </TabsContent>

              {/* ═══ TAB: Рефералы ═══ */}
              <TabsContent value="referrals" className="space-y-4">
                <ReferralTab />
              </TabsContent>

              {/* ═══ TAB: Аналитика ═══ */}
              <TabsContent value="analytics" className="space-y-4">
                <AnalyticsTab />
              </TabsContent>

              {/* ═══ TAB: Формы ═══ */}
              <TabsContent value="forms" className="space-y-4">
                <FormsTab enabledSources={enabledSources} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SidebarInset>

      {/* Add candidate dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Добавить в Talent Pool</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Имя *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Иван Петров" /></div>
              <div className="grid gap-1"><Label className="text-xs">Должность</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Менеджер" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Компания</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="ООО" /></div>
              <div className="grid gap-1"><Label className="text-xs">Откуда узнали</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="LinkedIn, Реферал..." /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Телефон</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7..." /></div>
              <div className="grid gap-1"><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@..." /></div>
              <div className="grid gap-1"><Label className="text-xs">Telegram</Label><Input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} placeholder="@..." /></div>
            </div>
            <div className="grid gap-1"><Label className="text-xs">Комментарий</Label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} placeholder="Заметки..." /></div>
            <Button onClick={handleAdd} disabled={!form.name.trim()}>Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create campaign dialog */}
      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Создать кампанию</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-1"><Label className="text-xs">Название *</Label><Input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} placeholder="Продажники Q3 2026" /></div>
            <div className="grid gap-1">
              <Label className="text-xs">Тип кампании</Label>
              <Select value={campForm.type} onValueChange={(v) => setCampForm({ ...campForm, type: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Разовое приглашение на вакансию</SelectItem>
                  <SelectItem value="drip">Серия касаний (капельный маркетинг)</SelectItem>
                  <SelectItem value="content">Прогрев контентом</SelectItem>
                  <SelectItem value="reminder">Напоминание через N месяцев</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <Label className="text-xs">Серия касаний</Label>
              {campForm.steps.map((step, i) => (
                <div key={step.id} className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <GripVertical className="w-4 h-4 text-muted-foreground/30 mt-1 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Шаг {i + 1}</span>
                      <span className="text-xs text-muted-foreground">День</span>
                      <Input type="number" className="w-16 h-7 text-xs" value={step.day} onChange={(e) => { const ns = [...campForm.steps]; ns[i] = { ...ns[i], day: parseInt(e.target.value) || 0 }; setCampForm({ ...campForm, steps: ns }) }} />
                      <Select value={step.channel} onValueChange={(v) => { const ns = [...campForm.steps]; ns[i] = { ...ns[i], channel: v as CampaignStep["channel"] }; setCampForm({ ...campForm, steps: ns }) }}>
                        <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="tg">Telegram</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent>
                      </Select>
                      <button onClick={() => setCampForm({ ...campForm, steps: campForm.steps.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    <Textarea className="text-sm" rows={2} value={step.text} onChange={(e) => { const ns = [...campForm.steps]; ns[i] = { ...ns[i], text: e.target.value }; setCampForm({ ...campForm, steps: ns }) }} placeholder="Текст сообщения..." />
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setCampForm({ ...campForm, steps: [...campForm.steps, { id: `ns-${Date.now()}`, day: (campForm.steps[campForm.steps.length - 1]?.day || 0) + 7, text: "", channel: "tg" }] })}><Plus className="w-3 h-3" />Добавить шаг</Button>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => { setCampForm({ ...campForm, steps: campForm.steps.map((s) => ({ ...s, text: s.text || `[AI] Персонализированное сообщение для шага на день ${s.day}` })) }); toast.success("Тексты сгенерированы") }}><Sparkles className="w-3 h-3" />Сгенерировать AI</Button>
              </div>
            </div>

            {/* Anti-spam */}
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Антиспам настройки</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Не писать чаще раза в</span><Input type="number" className="w-14 h-7 text-xs" defaultValue={3} /><span>дней</span>
                </div>
                <p className="text-[11px] text-muted-foreground">• Остановить если кандидат ответил "не интересно"</p>
                <p className="text-[11px] text-muted-foreground">• Отправка только в рабочие часы (9:00 – 19:00)</p>
              </CardContent>
            </Card>

            <Button onClick={handleCreateCampaign} disabled={!campForm.name.trim()}>Создать кампанию</Button>
          </div>
        </DialogContent>
      </Dialog>

    </SidebarProvider>
  )
}
