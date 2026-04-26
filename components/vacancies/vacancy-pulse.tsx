"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Activity, RefreshCw, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { HhVacancyBanner } from "@/components/vacancies/hh-vacancy-banner"

interface HhVacancyMeta {
  hhVacancyId: string
  responsesCount: number
  syncedAt: string
  createdAt: string
  localVacancyId: string | null
}

interface HhResponseLite {
  hhVacancyId: string
  status: string
}

interface Props {
  vacancyId: string
  hhVacancyId: string | null
  vacancyTitle: string
  createdAt: string | null
  localCandidatesCount: number
  inDemoCount: number
  onSyncDone?: () => void
}

function daysSince(date: string | null | undefined): number {
  if (!date) return 0
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

function formatDays(n: number): string {
  if (n >= 30) return "30+ дн."
  return `${n} дн.`
}

function relativeTime(date: string | null | undefined): string {
  if (!date) return "—"
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "только что"
  if (min < 60) return `${min} мин`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ч`
  if (hr < 48) return "вчера"
  return `${Math.floor(hr / 24)} дн.`
}

export function VacancyPulse({
  vacancyId, hhVacancyId, vacancyTitle, createdAt,
  localCandidatesCount, inDemoCount, onSyncDone,
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [hhMeta, setHhMeta] = useState<HhVacancyMeta | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetch("/api/integrations/hh/status")
      .then(r => r.json() as Promise<{ connected: boolean }>)
      .then(s => setConnected(!!s.connected))
      .catch(() => setConnected(false))
  }, [])

  const loadHhMeta = useCallback(async () => {
    if (!hhVacancyId) return
    try {
      const res = await fetch("/api/integrations/hh/vacancies")
      const data = await res.json() as { vacancies?: HhVacancyMeta[] }
      setHhMeta((data.vacancies ?? []).find(v => v.hhVacancyId === hhVacancyId) ?? null)
    } catch { /* silent */ }
  }, [hhVacancyId])

  const loadPending = useCallback(async () => {
    if (!hhVacancyId) return
    try {
      const res = await fetch("/api/integrations/hh/responses")
      const data = await res.json() as { responses?: HhResponseLite[] }
      const count = (data.responses ?? []).filter(r => r.hhVacancyId === hhVacancyId && r.status === "response").length
      setPendingCount(count)
    } catch { /* silent */ }
  }, [hhVacancyId])

  useEffect(() => {
    if (connected !== true || !hhVacancyId) return
    loadHhMeta()
    loadPending()
  }, [connected, hhVacancyId, loadHhMeta, loadPending])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await Promise.all([
        fetch("/api/integrations/hh/vacancies"),
        fetch("/api/integrations/hh/responses"),
      ])
      await Promise.all([loadHhMeta(), loadPending()])
      onSyncDone?.()
      toast.success("Синхронизировано с hh.ru")
    } catch { toast.error("Ошибка синхронизации") }
    finally { setSyncing(false) }
  }

  const publishedDays = daysSince(hhMeta?.createdAt ?? createdAt)

  // STATE 1 — hh.ru не подключён
  if (connected === false) {
    return (
      <Card className="mb-4 px-4 py-3 flex items-center gap-3">
        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="text-sm">
          Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium">{localCandidatesCount}</span> кандидатов
        </div>
      </Card>
    )
  }

  // STATE 2 — подключён, но не привязана
  if (connected === true && !hhVacancyId) {
    return (
      <div className="mb-4 space-y-2">
        <Card className="px-4 py-3 flex items-center gap-3">
          <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-sm flex-1">
            Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium">{localCandidatesCount}</span> кандидатов
            <span className="text-muted-foreground"> · </span>
            <span className="text-amber-700">hh.ru не привязана</span>
          </div>
        </Card>
        <HhVacancyBanner
          vacancyId={vacancyId}
          hhVacancyId={null}
          vacancyTitle={vacancyTitle}
          onCandidatesUpdated={onSyncDone}
        />
      </div>
    )
  }

  // connected === null (грузим) или нет hhMeta — короткая шапка
  if (connected !== true || !hhMeta) {
    return (
      <Card className="mb-4 px-4 py-3 flex items-center gap-3">
        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="text-sm">
          Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium">{localCandidatesCount}</span> кандидатов
        </div>
      </Card>
    )
  }

  // STATE 3 — полный пульт
  const total = hhMeta.responsesCount ?? 0
  const pending = pendingCount ?? 0

  // TODO Пакет В: подключить троттлинг через hh_process_jobs
  const processDisabled = true
  const processTitle = "Скоро будет щадящий режим — пока обработка отключена"

  return (
    <Card className="mb-4 px-4 py-3 flex items-center gap-3 flex-wrap">
      <Activity className="w-4 h-4 text-muted-foreground shrink-0" />

      <span className="text-sm shrink-0">
        Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
      </span>

      <span className="text-muted-foreground shrink-0">·</span>

      <span className="text-sm">
        <span className="font-medium">{total}</span> откликов
        <span className="text-muted-foreground"> · </span>
        <span className={cn("font-medium", pending > 0 ? "text-amber-700" : "text-muted-foreground")}>{pending}</span> необраб.
        <span className="text-muted-foreground"> · </span>
        <span className="font-medium">{inDemoCount}</span> в демо
      </span>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          ✓ Синх. {relativeTime(hhMeta.syncedAt)}
        </span>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Синхронизировать
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1.5" disabled={processDisabled} title={processTitle}>
          <Sparkles className="w-3.5 h-3.5" />
          Разобрать
        </Button>
      </div>
    </Card>
  )
}
