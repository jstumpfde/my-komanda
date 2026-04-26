"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Link2, RefreshCw, Loader2 } from "lucide-react"
import { HhAutoProcess } from "@/components/hh/hh-auto-process"

interface HhUnlinkedVacancy {
  id: string
  hhVacancyId: string
  title: string
  responsesCount: number
  localVacancyId: string | null
}

interface HhResponseLite {
  hhVacancyId: string
  status: string
}

interface Props {
  vacancyId: string
  hhVacancyId?: string | null
  vacancyTitle: string
  onCandidatesUpdated?: () => void
}

export function HhVacancyBanner({ vacancyId, hhVacancyId, vacancyTitle, onCandidatesUpdated }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [unlinked, setUnlinked] = useState<HhUnlinkedVacancy[]>([])
  const [selected, setSelected] = useState<string>("")
  const [linking, setLinking] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetch("/api/integrations/hh/status")
      .then(r => r.json() as Promise<{ connected: boolean }>)
      .then(s => setConnected(!!s.connected))
      .catch(() => setConnected(false))
  }, [])

  const loadUnlinked = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/hh/vacancies")
      const data = await res.json() as { vacancies?: HhUnlinkedVacancy[] }
      setUnlinked((data.vacancies ?? []).filter(v => !v.localVacancyId))
    } catch { /* silent */ }
  }, [])

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
    if (connected !== true) return
    if (hhVacancyId) loadPending()
    else loadUnlinked()
  }, [connected, hhVacancyId, loadPending, loadUnlinked])

  // STATE 1 — hh.ru не подключён
  if (connected !== true) return null

  // STATE 2 — подключён, но эта вакансия не привязана
  if (!hhVacancyId) {
    const handleLink = async () => {
      if (!selected) return
      setLinking(true)
      try {
        const res = await fetch(`/api/integrations/hh/vacancies/${selected}/link`, { method: "POST" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Не удалось привязать")
        toast.success("hh-вакансия привязана")
        location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка")
      } finally {
        setLinking(false)
      }
    }

    return (
      <Card className="mb-3 px-4 py-3 flex items-center gap-3 bg-amber-500/5 border-amber-200">
        <Link2 className="w-4 h-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Эта вакансия{vacancyTitle ? ` «${vacancyTitle}»` : ""} не привязана к hh.ru</p>
          <p className="text-xs text-muted-foreground">Выберите hh-вакансию для импорта откликов в этот канбан</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={selected} onValueChange={setSelected} disabled={linking || unlinked.length === 0}>
            <SelectTrigger className="h-8 text-xs w-[260px]">
              <SelectValue placeholder={unlinked.length === 0 ? "Нет непривязанных hh-вакансий" : "Выбрать hh-вакансию..."} />
            </SelectTrigger>
            <SelectContent>
              {unlinked.map(v => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.title}{v.responsesCount > 0 ? ` · ${v.responsesCount} откликов` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleLink} disabled={!selected || linking}>
            {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Привязать
          </Button>
        </div>
      </Card>
    )
  }

  // STATE 3 — привязка есть
  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch("/api/integrations/hh/responses")
      await loadPending()
      onCandidatesUpdated?.()
      toast.success("Синхронизировано с hh.ru")
    } catch {
      toast.error("Ошибка синхронизации")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="mb-3 px-4 py-3 flex items-center gap-3 bg-emerald-500/5 border-emerald-200">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: "#D6001C" }}>hh</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          hh.ru: {pendingCount === null ? "…" : pendingCount} необработанных откликов
        </p>
        <p className="text-xs text-muted-foreground truncate">Привязка к hh-вакансии активна</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Синхронизировать
        </Button>
        <HhAutoProcess
          vacancyId={vacancyId}
          pendingCount={pendingCount ?? undefined}
          onProcessed={() => { loadPending(); onCandidatesUpdated?.() }}
        />
      </div>
    </Card>
  )
}
