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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Plus, Upload, Rocket, Users, Mail, BarChart3, Search,
  MoreHorizontal, Heart, Pause, Play, Sparkles, Send,
  TrendingUp, Eye, MessageSquare, UserPlus, Clock, Trash2, GripVertical,
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────
type TalentStatus = "cold" | "warming" | "warm" | "refused" | "hired"

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
  cold: { label: "Холодный", emoji: "🟡", cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
  warming: { label: "В прогреве", emoji: "🔵", cls: "bg-blue-500/10 text-blue-700 border-blue-200" },
  warm: { label: "Тёплый", emoji: "🟢", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  refused: { label: "Отказался", emoji: "🔴", cls: "bg-red-500/10 text-red-700 border-red-200" },
  hired: { label: "Нанят", emoji: "⚫", cls: "bg-muted text-muted-foreground border-border" },
}

const CHANNEL_LABELS: Record<string, string> = { tg: "Telegram", whatsapp: "WhatsApp", email: "Email" }

// ─── Test data ──────────────────────────────────────────
const INITIAL_CANDIDATES: TalentCandidate[] = [
  { id: "t1", name: "Андрей Фёдоров", position: "Менеджер по продажам", company: "СберРешения", source: "Реферал", referralName: "Анна Иванова", status: "cold", lastContact: new Date(Date.now() - 14 * 86400000), email: "andrey@mail.ru", phone: "+7 903 111-22-33", telegram: "@andrey_f", comment: "Опыт 5 лет B2B" },
  { id: "t2", name: "Ксения Воробьёва", position: "HR-менеджер", company: "Яндекс", source: "LinkedIn", status: "warming", lastContact: new Date(Date.now() - 3 * 86400000), email: "ks@yandex.ru", phone: "+7 916 444-55-66", telegram: "@ks_hr", comment: "Ищет новые проекты" },
  { id: "t3", name: "Максим Егоров", position: "DevOps инженер", company: "Ozon", source: "Конференция", status: "warm", lastContact: new Date(Date.now() - 1 * 86400000), email: "max@ozon.ru", phone: "+7 925 777-88-99", telegram: "@maxdev", comment: "Заинтересован в оффере" },
  { id: "t4", name: "Ольга Петрова", position: "Бухгалтер", company: "1С-Рарус", source: "Реферал", referralName: "Дмитрий Козлов", status: "refused", lastContact: new Date(Date.now() - 30 * 86400000), email: "olga@1c.ru", phone: "+7 999 000-11-22", telegram: "", comment: "Не рассматривает смену работы" },
  { id: "t5", name: "Роман Кузнецов", position: "Product Manager", company: "VK", source: "hh.ru", status: "cold", lastContact: new Date(Date.now() - 7 * 86400000), email: "roman@vk.com", phone: "+7 912 333-44-55", telegram: "@roman_pm", comment: "" },
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

  // Add candidate form
  const [form, setForm] = useState({ name: "", position: "", company: "", source: "", email: "", phone: "", telegram: "", comment: "" })

  // Campaign form
  const [campForm, setCampForm] = useState({ name: "", type: "invite", steps: [{ id: "ns1", day: 0, text: "", channel: "tg" as const }] as CampaignStep[] })

  const handleAdd = () => {
    if (!form.name.trim()) return
    setCandidates((p) => [...p, { ...form, id: `t-${Date.now()}`, status: "cold" as TalentStatus, lastContact: new Date(), referralName: undefined }])
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
    return true
  })

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
                <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Аналитика</TabsTrigger>
              </TabsList>

              {/* ═══ TAB: База ═══ */}
              <TabsContent value="base" className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input className="pl-8 h-8 text-sm" placeholder="Поиск по имени или должности..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Upload className="w-3.5 h-3.5" />Импорт CSV</Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAddOpen(true)}><Plus className="w-3.5 h-3.5" />Добавить</Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700" onClick={() => setCampaignOpen(true)}><Rocket className="w-3.5 h-3.5" />Запустить кампанию</Button>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead><tr className="border-b bg-muted/30">
                        <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-2.5">Имя</th>
                        <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2.5">Должность</th>
                        <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2.5">Компания</th>
                        <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2.5">Источник</th>
                        <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2.5">Статус</th>
                        <th className="text-left text-[11px] font-semibold text-muted-foreground px-3 py-2.5">Контакт</th>
                        <th className="px-3 py-2.5"></th>
                      </tr></thead>
                      <tbody>
                        {filtered.map((c) => {
                          const st = STATUS_CFG[c.status]
                          return (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-2.5 text-sm font-medium">{c.name}</td>
                              <td className="px-3 py-2.5 text-sm text-muted-foreground">{c.position}</td>
                              <td className="px-3 py-2.5 text-sm text-muted-foreground">{c.company}</td>
                              <td className="px-3 py-2.5">
                                <span className="text-sm">{c.source}</span>
                                {c.referralName && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground">от {c.referralName}</span>
                                    <button className="text-[10px] text-pink-500 hover:underline" onClick={() => toast.success(`Спасибо отправлено ${c.referralName}!`)}><Heart className="w-3 h-3 inline" /></button>
                                  </div>
                                )}
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
                        {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Нет кандидатов</td></tr>}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ═══ TAB: Кампании ═══ */}
              <TabsContent value="campaigns" className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{campaigns.length} кампаний</p>
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCampaignOpen(true)}><Plus className="w-3.5 h-3.5" />Создать кампанию</Button>
                </div>
                <div className="space-y-3">
                  {campaigns.map((camp) => (
                    <Card key={camp.id}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{camp.name}</p>
                            <Badge variant="outline" className={cn("text-[10px]", camp.status === "active" ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : camp.status === "paused" ? "bg-amber-500/10 text-amber-700 border-amber-200" : "bg-muted text-muted-foreground border-border")}>
                              {camp.status === "active" ? "Активна" : camp.status === "paused" ? "Пауза" : "Завершена"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span>{camp.candidates} кандидатов</span>
                            <span>Шаг {camp.currentStep}/{camp.totalSteps}</span>
                            <span>Открытия: {camp.openRate}%</span>
                          </div>
                          {/* Steps preview */}
                          <div className="flex items-center gap-1 mt-2">
                            {camp.steps.map((step, i) => (
                              <div key={step.id} className={cn("h-1.5 flex-1 rounded-full", i < camp.currentStep ? "bg-primary" : "bg-muted")} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {camp.status === "active" ? (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCampaigns((p) => p.map((c) => c.id === camp.id ? { ...c, status: "paused" } : c))}><Pause className="w-3 h-3" />Пауза</Button>
                          ) : camp.status === "paused" ? (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCampaigns((p) => p.map((c) => c.id === camp.id ? { ...c, status: "active" } : c))}><Play className="w-3 h-3" />Запустить</Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* ═══ TAB: Аналитика ═══ */}
              <TabsContent value="analytics" className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    { label: "Отправлено", value: "156", color: "text-blue-600" },
                    { label: "Доставлено", value: "148", color: "text-cyan-600" },
                    { label: "Открыто", value: "112", color: "text-purple-600" },
                    { label: "Ответили", value: "34", color: "text-amber-600" },
                    { label: "В воронке", value: "8", color: "text-emerald-600" },
                  ].map((m) => (
                    <Card key={m.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{m.label}</p><p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p></CardContent></Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Конверсия Talent Pool → Воронка</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {[
                          { from: "Отправлено → Открыто", pct: 72, color: "bg-primary" },
                          { from: "Открыто → Ответили", pct: 30, color: "bg-primary" },
                          { from: "Ответили → В воронке", pct: 24, color: "bg-emerald-500" },
                        ].map((t) => (
                          <div key={t.from} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-44 shrink-0">{t.from}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full", t.color)} style={{ width: `${t.pct}%` }} /></div>
                            <span className="text-xs font-semibold w-10 text-right">{t.pct}%</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                        <span className="text-xs font-medium">Общая конверсия</span>
                        <Badge variant="secondary" className="font-bold">5.1%</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Лучшие кампании</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {campaigns.map((c) => (
                          <div key={c.id} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.candidates} кандидатов</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-emerald-600">{c.openRate}%</p>
                              <p className="text-[10px] text-muted-foreground">открытий</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
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
