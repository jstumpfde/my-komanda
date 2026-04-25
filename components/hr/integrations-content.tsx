"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Plug, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, Building2,
} from "lucide-react"

interface HHStatus {
  connected: boolean
  employerId?: string
  employerName?: string
  lastSyncedAt?: string
  connectedAt?: string
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
}

export function IntegrationsContent() {
  const [status, setStatus] = useState<HHStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

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
      toast.success("hh.ru отключён")
    } catch { toast.error("Ошибка отключения") }
    finally { setDisconnecting(false) }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* hh.ru card */}
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

      {/* Hint */}
      <p className="text-sm text-muted-foreground px-1">
        Управление вакансиями и откликами происходит в карточке каждой вакансии. Здесь — только подключение площадок.
      </p>

      {/* Other integrations — placeholders */}
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
  )
}
