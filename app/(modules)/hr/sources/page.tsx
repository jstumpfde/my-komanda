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
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  DEFAULT_TRACKED_LINKS, SOURCE_TYPE_LABELS, SOURCE_TYPE_COLORS, DEFAULT_UTM_BY_SOURCE,
  generateShortCode, getMockAnalytics,
  type TrackedLink, type SourceType, type UtmParams, type LinkAnalytics,
} from "@/lib/utm-types"
import {
  Plus, Copy, Check, ExternalLink, Trash2, Pencil, BarChart3,
  Search, Link2, QrCode, Download, Share2, Send,
  MessageCircle, Phone as PhoneIcon, Globe, Tag,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line,
} from "recharts"

const VACANCIES = [
  { id: "1", name: "Менеджер по продажам", slug: "manager" },
  { id: "2", name: "Frontend-разработчик", slug: "frontend" },
  { id: "3", name: "Оператор склада", slug: "warehouse" },
]

const HH_ACCOUNTS = ["anna@romashka.ru (основной)", "hr2@romashka.ru", "агентство@mail.ru"]
const TG_ACCOUNTS = ["@romashka_hr", "@romashka_jobs", "личный бот HR"]

const tooltipStyle = {
  backgroundColor: "var(--popover)", border: "1px solid var(--border)",
  borderRadius: "8px", fontSize: "12px",
}

export default function SourcesPage() {
  const [links, setLinks] = useState<TrackedLink[]>(DEFAULT_TRACKED_LINKS)
  const [createOpen, setCreateOpen] = useState(false)
  const [analyticsLink, setAnalyticsLink] = useState<TrackedLink | null>(null)
  const [analyticsData, setAnalyticsData] = useState<LinkAnalytics | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filters
  const [filterSource, setFilterSource] = useState("all")
  const [filterVacancy, setFilterVacancy] = useState("all")
  const [searchText, setSearchText] = useState("")

  // Create form
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
    const defaults = DEFAULT_UTM_BY_SOURCE[type]
    setNewUtm(prev => ({ ...prev, ...defaults }))
    setNewAccount("")
  }

  const handleCreate = () => {
    const vac = VACANCIES.find(v => v.id === newVacancy)!
    const code = generateShortCode()
    const utmString = Object.entries(newUtm).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    const link: TrackedLink = {
      id: `lnk-${code}`,
      name: newName || `${SOURCE_TYPE_LABELS[newSourceType]} ${vac.name}`,
      vacancyId: vac.id,
      vacancyName: vac.name,
      sourceType: newSourceType,
      account: newAccount || "—",
      color: newColor,
      utm: { ...newUtm },
      fullUrl: `/vacancy/${vac.slug}?${utmString}`,
      shortUrl: `hrf.link/${code}`,
      clicks: 0,
      responses: 0,
      conversion: 0,
      createdAt: new Date(),
    }
    setLinks(prev => [link, ...prev])
    setCreateOpen(false)
    setStep(1)
    setNewName("")
    setNewUtm({ utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" })
    toast.success(`Ссылка создана: ${link.shortUrl}`)
  }

  const handleDelete = (id: string) => {
    setLinks(prev => prev.filter(l => l.id !== id))
    toast.error("Ссылка удалена")
  }

  const openAnalytics = (link: TrackedLink) => {
    setAnalyticsLink(link)
    setAnalyticsData(getMockAnalytics(link.id))
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-6xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Источники и ссылки</h1>
                <p className="text-muted-foreground text-sm">UTM-ссылки, аналитика переходов и конверсий</p>
              </div>
              <Button className="gap-1.5" onClick={() => { setCreateOpen(true); setStep(1) }}>
                <Plus className="w-4 h-4" />
                Создать ссылку
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по названию..." value={searchText} onChange={e => setSearchText(e.target.value)} />
              </div>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Источник" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все источники</SelectItem>
                  {(Object.entries(SOURCE_TYPE_LABELS) as [SourceType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterVacancy} onValueChange={setFilterVacancy}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Вакансия" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все вакансии</SelectItem>
                  {VACANCIES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Links table */}
            <Card className="mb-6">
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
                          <td className="px-2 py-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: link.color }} />
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-sm font-medium text-foreground">{link.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{link.shortUrl}</p>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className="text-xs" style={{ borderColor: link.color + "40", color: link.color }}>
                              {SOURCE_TYPE_LABELS[link.sourceType]}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">{link.account}</td>
                          <td className="text-right px-3 py-3 text-sm font-medium text-foreground">{link.clicks}</td>
                          <td className="text-right px-3 py-3 text-sm font-medium text-foreground">{link.responses}</td>
                          <td className="text-right px-3 py-3">
                            <span className={cn("text-sm font-semibold", link.conversion >= 30 ? "text-emerald-600" : "text-foreground")}>
                              {link.conversion}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {link.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                            {link.auto && <Badge variant="secondary" className="ml-1 text-[9px] py-0 h-4">авто</Badge>}
                          </td>
                          <td className="text-center px-3 py-3">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Аналитика" onClick={() => openAnalytics(link)}>
                                <BarChart3 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Копировать" onClick={() => handleCopy(link.shortUrl, link.id)}>
                                {copiedId === link.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </Button>
                              {!link.auto && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить" onClick={() => handleDelete(link.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Нет ссылок</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>

      {/* ═══ Создание ссылки (диалог) ═════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Создать ссылку · Шаг {step}/3
            </DialogTitle>
          </DialogHeader>

          <Progress value={(step / 3) * 100} className="h-1.5 mb-2" />

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Вакансия</Label>
                <Select value={newVacancy} onValueChange={setNewVacancy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VACANCIES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Тип источника</Label>
                <Select value={newSourceType} onValueChange={v => handleSourceTypeChange(v as SourceType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SOURCE_TYPE_LABELS) as [SourceType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(newSourceType === "hh") && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Аккаунт hh.ru</Label>
                  <Select value={newAccount} onValueChange={setNewAccount}>
                    <SelectTrigger><SelectValue placeholder="Выберите аккаунт" /></SelectTrigger>
                    <SelectContent>
                      {HH_ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(newSourceType === "telegram") && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Канал / бот</Label>
                  <Select value={newAccount} onValueChange={setNewAccount}>
                    <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                    <SelectContent>
                      {TG_ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(newSourceType === "whatsapp") && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Номер WhatsApp</Label>
                  <Input value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="+7 999 123-45-67" />
                </div>
              )}
              {(newSourceType === "custom") && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Название источника</Label>
                  <Input value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="Введите вручную" />
                </div>
              )}
              <Button className="w-full" onClick={() => setStep(2)}>Далее</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">UTM-параметры заполнены автоматически. Можно отредактировать.</p>
              {(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as (keyof UtmParams)[]).map(key => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground">{key}</Label>
                  <Input
                    value={newUtm[key]}
                    onChange={e => setNewUtm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Назад</Button>
                <Button className="flex-1" onClick={() => setStep(3)}>Далее</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Короткое имя для списка</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="TG канал HR март" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Цвет метки</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-10 h-10 rounded-lg border cursor-pointer" />
                  <Input value={newColor} onChange={e => setNewColor(e.target.value)} className="w-28 h-9 font-mono text-sm" />
                  <div className="flex gap-1">
                    {["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4"].map(c => (
                      <button key={c} className={cn("w-7 h-7 rounded-md border-2", newColor === c ? "border-foreground" : "border-transparent")}
                        style={{ backgroundColor: c }} onClick={() => setNewColor(c)} />
                    ))}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <p className="text-xs text-muted-foreground">Результат:</p>
                <p className="text-xs font-mono text-foreground break-all">
                  {`/vacancy/${VACANCIES.find(v => v.id === newVacancy)?.slug}?${Object.entries(newUtm).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&")}`}
                </p>
                <p className="text-xs font-mono text-primary">hrf.link/{generateShortCode()}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Скачать QR PNG (заглушка)")}>
                  <Download className="w-3.5 h-3.5" /> QR PNG
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Скачать PDF листовку (заглушка)")}>
                  <Download className="w-3.5 h-3.5" /> PDF листовка
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Поделиться (заглушка)")}>
                  <Share2 className="w-3.5 h-3.5" /> Поделиться
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Назад</Button>
                <Button className="flex-1" onClick={handleCreate}>Создать ссылку</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Аналитика ссылки (sheet) ═════════════════════════ */}
      <Sheet open={!!analyticsLink} onOpenChange={open => { if (!open) { setAnalyticsLink(null); setAnalyticsData(null) } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {analyticsLink?.name}
            </SheetTitle>
          </SheetHeader>

          {analyticsLink && analyticsData && (
            <div className="space-y-6 mt-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 border text-center">
                  <p className="text-lg font-bold text-foreground">{analyticsLink.clicks}</p>
                  <p className="text-xs text-muted-foreground">Переходов</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border text-center">
                  <p className="text-lg font-bold text-foreground">{analyticsLink.responses}</p>
                  <p className="text-xs text-muted-foreground">Откликов</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border text-center">
                  <p className="text-lg font-bold text-emerald-600">{analyticsLink.conversion}%</p>
                  <p className="text-xs text-muted-foreground">Конверсия</p>
                </div>
              </div>

              {/* Daily chart */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Переходы по дням</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={analyticsData.dailyClicks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="clicks" name="Переходы" stroke={analyticsLink.color} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="responses" name="Отклики" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Funnel */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Воронка по этой ссылке</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={analyticsData.funnelStages} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={85} stroke="var(--muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Кандидатов" fill={analyticsLink.color} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Candidates */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Кандидаты с этой ссылки</p>
                <div className="space-y-1.5">
                  {analyticsData.candidates.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border text-sm">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{c.stage}</Badge>
                        <span className="text-xs text-muted-foreground">{c.date.toLocaleDateString("ru-RU")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
