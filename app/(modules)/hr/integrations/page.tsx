"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Plug, RefreshCw, Loader2, ExternalLink, CheckCircle2, XCircle,
  Download, Clock, Building2, Briefcase, MapPin, Users, FileText,
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface HHStatus {
  connected: boolean
  employerId?: string
  employerName?: string
  lastSyncedAt?: string
  connectedAt?: string
}

interface HHVacancy {
  id: string
  hhVacancyId: string
  title: string
  areaName: string | null
  salaryFrom: number | null
  salaryTo: number | null
  salaryCurrency: string | null
  status: string
  responsesCount: number
  url: string | null
  localVacancyId: string | null
}

interface HHResponse {
  id: string
  hhVacancyId: string
  hhResponseId: string
  candidateName: string | null
  candidateEmail: string | null
  resumeTitle: string | null
  resumeUrl: string | null
  status: string
  createdAt: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSalary(from: number | null, to: number | null, currency: string | null): string {
  if (!from && !to) return "Не указана"
  const c = currency === "RUR" ? "₽" : currency ?? ""
  if (from && to) return `${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} ${c}`
  if (from) return `от ${from.toLocaleString("ru-RU")} ${c}`
  return `до ${to!.toLocaleString("ru-RU")} ${c}`
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

const HH_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open:      { label: "Активна",   cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  closed:    { label: "Закрыта",   cls: "bg-gray-500/10 text-gray-600 border-gray-200" },
  archived:  { label: "В архиве",  cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
}

const RESPONSE_STATUS_LABELS: Record<string, string> = {
  new: "Новый", invitation: "Приглашение", response: "Отклик", discard: "Отклонён",
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [status, setStatus] = useState<HHStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [activeTab, setActiveTab] = useState<"vacancies" | "responses">("vacancies")
  const [vacancies, setVacancies] = useState<HHVacancy[]>([])
  const [responses, setResponses] = useState<HHResponse[]>([])
  const [loadingVacancies, setLoadingVacancies] = useState(false)
  const [loadingResponses, setLoadingResponses] = useState(false)

  // Check connection status
  useEffect(() => {
    fetch("/api/integrations/hh/status")
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false))
  }, [])

  // Check URL params for connection result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("connected") === "hh") {
      toast.success("hh.ru успешно подключён")
      window.history.replaceState({}, "", window.location.pathname)
    }
    if (params.get("error")) {
      toast.error("Ошибка подключения hh.ru")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  const loadVacancies = useCallback(async () => {
    setLoadingVacancies(true)
    try {
      const res = await fetch("/api/integrations/hh/vacancies")
      const data = await res.json()
      setVacancies(data.vacancies ?? [])
      if (data.fromCache) toast("Загружено из кэша")
    } catch { toast.error("Ошибка загрузки вакансий") }
    finally { setLoadingVacancies(false) }
  }, [])

  const loadResponses = useCallback(async () => {
    setLoadingResponses(true)
    try {
      const res = await fetch("/api/integrations/hh/responses")
      const data = await res.json()
      setResponses(data.responses ?? [])
      if (data.fromCache) toast("Загружено из кэша")
    } catch { toast.error("Ошибка загрузки откликов") }
    finally { setLoadingResponses(false) }
  }, [])

  // Auto-load data when connected
  useEffect(() => {
    if (status?.connected) {
      loadVacancies()
      loadResponses()
    }
  }, [status?.connected, loadVacancies, loadResponses])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await Promise.all([loadVacancies(), loadResponses()])
      toast.success("Данные синхронизированы")
    } catch { toast.error("Ошибка синхронизации") }
    finally { setSyncing(false) }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch("/api/integrations/hh/status", { method: "DELETE" })
      setStatus({ connected: false })
      setVacancies([])
      setResponses([])
      toast.success("hh.ru отключён")
    } catch { toast.error("Ошибка отключения") }
    finally { setDisconnecting(false) }
  }

  return (
    <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground mb-1">Интеграции</h1>
        <p className="text-sm text-muted-foreground">Подключение к джоб-бордам и внешним сервисам</p>
      </div>

      <div className="space-y-4 max-w-4xl">

        {/* ═══ hh.ru карточка ═══ */}
        <Card className="rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <span className="text-red-600 font-bold text-lg">hh</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">hh.ru</h3>
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : status?.connected ? (
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />Подключено
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Не подключено</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Импорт вакансий и откликов с HeadHunter
                </p>
                {status?.connected && (
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    {status.employerName && (
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{status.employerName}</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Подключён {formatDate(status.connectedAt)}</span>
                    {status.lastSyncedAt && (
                      <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" />Синхр. {formatDate(status.lastSyncedAt)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {status?.connected ? (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleSync} disabled={syncing}>
                    {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Синхронизировать
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Отключить
                  </Button>
                </>
              ) : (
                <Button size="sm" className="gap-1.5" asChild>
                  <a href="/api/integrations/hh/connect">
                    <Plug className="w-3.5 h-3.5" />Подключить hh.ru
                  </a>
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ═══ Табы: вакансии / отклики ═══ */}
        {status?.connected && (
          <>
            <div className="flex items-center gap-1 border-b border-border">
              <button
                onClick={() => setActiveTab("vacancies")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeTab === "vacancies"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Briefcase className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Вакансии на hh.ru
                {vacancies.length > 0 && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">{vacancies.length}</Badge>}
              </button>
              <button
                onClick={() => setActiveTab("responses")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeTab === "responses"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Отклики
                {responses.length > 0 && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">{responses.length}</Badge>}
              </button>
            </div>

            {/* Таб вакансий */}
            {activeTab === "vacancies" && (
              <Card className="rounded-xl border border-border overflow-hidden">
                <CardContent className="p-0">
                  {loadingVacancies ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : vacancies.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Нет вакансий на hh.ru
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Название</th>
                            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[130px]">Город</th>
                            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[160px]">Зарплата</th>
                            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[90px]">Отклики</th>
                            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[100px]">Статус</th>
                            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[80px]">Импорт</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vacancies.map(vac => {
                            const st = HH_STATUS_LABELS[vac.status] ?? { label: vac.status, cls: "bg-muted text-muted-foreground" }
                            return (
                              <tr key={vac.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{vac.title}</span>
                                    {vac.url && (
                                      <a href={vac.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {vac.areaName && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{vac.areaName}</span>}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {formatSalary(vac.salaryFrom, vac.salaryTo, vac.salaryCurrency)}
                                </td>
                                <td className="text-center px-4 py-3 text-sm font-medium">{vac.responsesCount}</td>
                                <td className="text-center px-4 py-3">
                                  <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                                </td>
                                <td className="text-center px-4 py-3">
                                  {vac.localVacancyId ? (
                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-200">Импорт.</Badge>
                                  ) : (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.success(`Вакансия «${vac.title}» импортирована`)}>
                                      <Download className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Таб откликов */}
            {activeTab === "responses" && (
              <Card className="rounded-xl border border-border overflow-hidden">
                <CardContent className="p-0">
                  {loadingResponses ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : responses.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Нет откликов
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Кандидат</th>
                            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Вакансия</th>
                            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[120px]">Статус</th>
                            <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[80px]">Резюме</th>
                            <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[110px]">Дата</th>
                          </tr>
                        </thead>
                        <tbody>
                          {responses.map(resp => {
                            const vacTitle = vacancies.find(v => v.hhVacancyId === resp.hhVacancyId)?.title ?? `#${resp.hhVacancyId}`
                            return (
                              <tr key={resp.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div>
                                    <span className="text-sm font-medium text-foreground">{resp.candidateName ?? "—"}</span>
                                    {resp.candidateEmail && <p className="text-xs text-muted-foreground">{resp.candidateEmail}</p>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{vacTitle}</td>
                                <td className="text-center px-4 py-3">
                                  <Badge variant="outline" className="text-[10px]">
                                    {RESPONSE_STATUS_LABELS[resp.status] ?? resp.status}
                                  </Badge>
                                </td>
                                <td className="text-center px-4 py-3">
                                  {resp.resumeUrl ? (
                                    <a href={resp.resumeUrl} target="_blank" rel="noopener noreferrer">
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <FileText className="w-3.5 h-3.5" />
                                      </Button>
                                    </a>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(resp.createdAt)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ═══ Другие интеграции — заглушки ═══ */}
        <div className="pt-2">
          <h2 className="text-base font-semibold text-foreground mb-3">Другие площадки</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { name: "Авито Работа", icon: "А", color: "bg-blue-500/10 text-blue-600" },
              { name: "SuperJob", icon: "SJ", color: "bg-green-500/10 text-green-600" },
              { name: "Яндекс Работа", icon: "Я", color: "bg-yellow-500/10 text-yellow-700" },
            ].map(platform => (
              <Card key={platform.name} className="rounded-xl border border-border p-5 opacity-70">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm", platform.color)}>
                    {platform.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{platform.name}</span>
                      <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Скоро</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Интеграция в разработке</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
