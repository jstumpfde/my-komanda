"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Plug, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, Building2, Stethoscope, AlertCircle, Mail, IdCard,
  Plus, ChevronDown,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import { AvitoIntegrationCard } from "@/components/hr/avito-integration-card"
import { CandidateTelegramBotCard } from "@/components/hr/candidate-telegram-bot-card"
import { WebhooksBlock, BitrixBlock } from "@/components/hiring-settings/service-section"
import type { CompanyHiringDefaults } from "@/lib/db/schema"

interface HHStatus {
  connected: boolean
  employerId?: string
  employerName?: string
  lastSyncedAt?: string
  connectedAt?: string
}

interface HHDiagnostic {
  tokenStatus:    "valid" | "expired" | "missing"
  hhAccountInfo?: {
    employerId:     string
    employerName:   string | null
    managerId:      string | null
    isActive:       boolean
    connectedAt:    string | null
    lastSyncedAt:   string | null
    tokenExpiresAt: string | null
  }
  vacancies: Array<{
    hhVacancyId:    string
    vacancyTitle:   string
    localVacancyId: string | null
    hasAccess:      boolean
    errorReason?:   string
  }>
  reconnectUrl: string
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

const HIRING_DEFAULTS_URL = "/api/modules/hr/company/hiring-defaults"

export function IntegrationsContent() {
  const { hasAccess } = useAuth()
  const isPlatformAdmin = hasAccess(["platform_admin"])
  const [status, setStatus] = useState<HHStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [diagnostic, setDiagnostic] = useState<HHDiagnostic | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)
  const [addSourceOpen, setAddSourceOpen] = useState(false)

  // Данные для Webhooks / Битрикс (уровень компании)
  const [hiringDefaults, setHiringDefaults] = useState<CompanyHiringDefaults | null>(null)

  useEffect(() => {
    fetch(HIRING_DEFAULTS_URL)
      .then(r => r.ok ? r.json() : null)
      .then((d: { hiringDefaults?: CompanyHiringDefaults } | null) => {
        if (d?.hiringDefaults) setHiringDefaults(d.hiringDefaults)
      })
      .catch(() => {})
  }, [])

  const onPatchDefaults = async (patch: Partial<CompanyHiringDefaults>) => {
    const res = await fetch(HIRING_DEFAULTS_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error("save_failed")
    const data = (await res.json()) as { hiringDefaults: CompanyHiringDefaults }
    setHiringDefaults(prev => prev ? { ...prev, ...data.hiringDefaults } : data.hiringDefaults)
  }

  useEffect(() => {
    fetch("/api/integrations/hh/status")
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false))
  }, [])

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

  const handleSync = async () => {
    setSyncing(true)
    try {
      await Promise.all([
        fetch("/api/integrations/hh/vacancies"),
        fetch("/api/integrations/hh/responses"),
      ])
      const res = await fetch("/api/integrations/hh/status")
      setStatus(await res.json())
      toast.success("Синхронизировано с hh.ru")
    } catch { toast.error("Ошибка синхронизации") }
    finally { setSyncing(false) }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch("/api/integrations/hh/status", { method: "DELETE" })
      setStatus({ connected: false })
      setDiagnostic(null)
      setDiagnosticOpen(false)
      toast.success("hh.ru отключён")
    } catch { toast.error("Ошибка отключения") }
    finally { setDisconnecting(false) }
  }

  const handleDiagnostic = async () => {
    setDiagnosing(true)
    setDiagnosticOpen(true)
    try {
      const res = await fetch("/api/integrations/hh/diagnostic")
      if (!res.ok) throw new Error("HTTP " + res.status)
      const data = (await res.json()) as HHDiagnostic
      setDiagnostic(data)
    } catch (err) {
      toast.error("Не удалось загрузить диагностику hh.ru")
      console.error(err)
    } finally {
      setDiagnosing(false)
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Пояснение */}
      <p className="text-sm text-muted-foreground">
        Интеграции уровня компании — применяются ко всем вакансиям по умолчанию.
        Переопределить для конкретной вакансии можно в настройках вакансии.
      </p>

      {/* Площадки найма */}
      {/* hh.ru card */}
      <Card className="rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <span className="text-red-600 font-bold text-lg">hh</span>
            </div>
            <div className="min-w-0">
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
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status?.connected ? (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Синхронизировать
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDiagnostic} disabled={diagnosing}>
                  {diagnosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
                  Диагностика
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                  <a href="/api/integrations/hh/connect">
                    <Plug className="w-3.5 h-3.5" />Переподключить
                  </a>
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

        {/* Diagnostic panel */}
        {diagnosticOpen && (
          <div className="mt-5 border-t border-border pt-5">
            {diagnosing && !diagnostic ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Запрашиваем данные у hh.ru…
              </div>
            ) : diagnostic ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Диагностика интеграции</h4>
                  <button
                    onClick={() => setDiagnosticOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Скрыть
                  </button>
                </div>
                {/* Account info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Статус токена:</span>
                    {diagnostic.tokenStatus === "valid" ? (
                      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" />Валидный
                      </Badge>
                    ) : diagnostic.tokenStatus === "expired" ? (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-200">
                        <AlertCircle className="w-3 h-3 mr-1" />Истёк / отозван
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Не подключён
                      </Badge>
                    )}
                  </div>
                  {diagnostic.hhAccountInfo && (
                    <>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Работодатель:</span>
                        <span className="text-foreground">
                          {diagnostic.hhAccountInfo.employerName ?? diagnostic.hhAccountInfo.employerId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <IdCard className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Employer ID:</span>
                        <span className="text-foreground font-mono text-xs">{diagnostic.hhAccountInfo.employerId}</span>
                      </div>
                      {diagnostic.hhAccountInfo.managerId && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">Manager ID:</span>
                          <span className="text-foreground font-mono text-xs">{diagnostic.hhAccountInfo.managerId}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Vacancies access table */}
                {diagnostic.vacancies.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Доступ к привязанным вакансиям ({diagnostic.vacancies.length})
                    </div>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {diagnostic.vacancies.map(v => (
                        <div key={v.hhVacancyId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-foreground">{v.vacancyTitle}</div>
                            <div className="text-xs text-muted-foreground font-mono">hh:{v.hhVacancyId}</div>
                          </div>
                          {v.hasAccess ? (
                            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 shrink-0">
                              <CheckCircle2 className="w-3 h-3 mr-1" />Доступ есть
                            </Badge>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 border-red-200">
                                <XCircle className="w-3 h-3 mr-1" />Нет доступа
                              </Badge>
                              {v.errorReason && (
                                <span className="text-[10px] text-muted-foreground max-w-[200px] truncate" title={v.errorReason}>
                                  {v.errorReason}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Если у вакансии «Нет доступа» — hh-аккаунт, к которому привязана компания, не имеет прав на эту вакансию.
                      Нажмите «Переподключить» и войдите под аккаунтом-работодателем с доступом к нужной вакансии.
                    </p>
                  </div>
                )}
                {diagnostic.vacancies.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Привязанных hh-вакансий не найдено.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* Авито */}
      <AvitoIntegrationCard />

      {/* F7: Telegram-бот для кандидатов */}
      <CandidateTelegramBotCard />

      {/* Hint */}
      <p className="text-sm text-muted-foreground px-1">
        Управление вакансиями и откликами происходит в карточке каждой вакансии. Здесь — только подключение площадок.
      </p>

      {/* Исходящие интеграции: Webhooks и Битрикс24 */}
      {hiringDefaults && (
        <>
          <WebhooksBlock defaults={hiringDefaults} onPatch={onPatchDefaults} />
          <BitrixBlock defaults={hiringDefaults} onPatch={onPatchDefaults} />
        </>
      )}

      {/* Другие площадки — только платформенному администратору (I5).
          Обычные клиенты не видят «Скоро»-заглушки. */}
      {isPlatformAdmin && <div className="pt-2">
        <h2 className="text-base font-semibold text-foreground mb-3">Другие площадки</h2>
        <Card className="rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setAddSourceOpen(o => !o)}
            className="w-full flex items-center gap-3 p-5 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
              <Plus className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">Добавить источник</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Авито Работа, SuperJob, Яндекс Работа — подключение площадок</p>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", addSourceOpen && "rotate-180")} />
          </button>

          {addSourceOpen && (
            <div className="border-t border-border divide-y divide-border">
              {[
                { name: "Авито Работа", icon: "А", color: "bg-blue-500/10 text-blue-600" },
                { name: "SuperJob", icon: "SJ", color: "bg-green-500/10 text-green-600" },
                { name: "Яндекс Работа", icon: "Я", color: "bg-yellow-500/10 text-yellow-700" },
              ].map(platform => (
                <div key={platform.name} className="flex items-center gap-3 px-5 py-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs", platform.color)}>
                    {platform.icon}
                  </div>
                  <span className="flex-1 text-sm font-medium text-foreground">{platform.name}</span>
                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Скоро</Badge>
                </div>
              ))}
              <p className="px-5 py-3 text-xs text-muted-foreground">
                Интеграции в разработке. Напишите в поддержку, если нужна приоритетная площадка.
              </p>
            </div>
          )}
        </Card>
      </div>}
    </div>
  )
}
