"use client"

import { useEffect, useState, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Share2, Copy, Check, RefreshCw, X, ExternalLink, Eye, Tv, Loader2,
} from "lucide-react"
import { ReportView, type ReportData, type Period } from "@/components/hr/report-view"

// ─── Кнопка «Поделиться» ──────────────────────────────────────────────────────

function ShareButton({ period, vacancyId }: { period: Period; vacancyId: string }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<"normal" | "tv" | null>(null)

  // Подтянуть текущий токен при первом открытии.
  useEffect(() => {
    if (!open || token !== null) return
    fetch("/api/modules/hr/report/share")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.token) setToken(d.token) })
      .catch(() => {})
  }, [open, token])

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const buildUrl = (tv: boolean) => {
    if (!token) return ""
    const params = new URLSearchParams()
    if (period !== "all") params.set("period", period)
    if (vacancyId !== "all") params.set("vacancyId", vacancyId)
    if (tv) params.set("tv", "1")
    const qs = params.toString()
    return `${origin}/report/${token}${qs ? `?${qs}` : ""}`
  }

  const create = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/modules/hr/report/share", { method: "POST" })
      const d = await r.json()
      if (r.ok && d.token) setToken(d.token)
    } finally { setLoading(false) }
  }

  const revoke = async () => {
    setLoading(true)
    try {
      await fetch("/api/modules/hr/report/share", { method: "DELETE" })
      setToken(null)
    } finally { setLoading(false) }
  }

  const copy = async (tv: boolean) => {
    const url = buildUrl(tv)
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(tv ? "tv" : "normal")
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Share2 className="w-4 h-4" />
          Поделиться
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-4">
        <div className="flex items-center gap-2 mb-1">
          <Share2 className="w-4 h-4 text-violet-500" />
          <span className="font-semibold text-sm">Публичная ссылка</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Кто угодно с ссылкой увидит отчёт без входа в систему. Данные только для чтения.
        </p>

        {!token ? (
          <Button onClick={create} disabled={loading} className="w-full gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            Создать публичную ссылку
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Обычная */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Eye className="w-3.5 h-3.5" /> Обычная
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={buildUrl(false)}
                  className="flex-1 min-w-0 rounded-md border bg-muted/40 px-2 py-1.5 text-xs font-mono truncate"
                  onFocus={e => e.currentTarget.select()}
                />
                <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => copy(false)}>
                  {copied === "normal" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="outline" size="sm" className="shrink-0 px-2" asChild>
                  <a href={buildUrl(false)} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                </Button>
              </div>
            </div>

            {/* TV */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Tv className="w-3.5 h-3.5" /> TV-режим (крупный текст, авто-обновление)
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={buildUrl(true)}
                  className="flex-1 min-w-0 rounded-md border bg-muted/40 px-2 py-1.5 text-xs font-mono truncate"
                  onFocus={e => e.currentTarget.select()}
                />
                <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => copy(true)}>
                  {copied === "tv" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="outline" size="sm" className="shrink-0 px-2" asChild>
                  <a href={buildUrl(true)} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <button onClick={create} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Перегенерировать
              </button>
              <button onClick={revoke} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Отозвать
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── Страница ──────────────────────────────────────────────────────────────────

function ReportContent() {
  const [period, setPeriod] = useState<Period>("all")
  const [vacancyId, setVacancyId] = useState<string>("all")
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback((p: Period, v: string) => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (p !== "all") params.set("period", p)
    if (v !== "all") params.set("vacancyId", v)
    const qs = params.toString()
    fetch(`/api/modules/hr/report${qs ? `?${qs}` : ""}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ReportData) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError("Не удалось загрузить данные отчёта") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cancel = loadData(period, vacancyId)
    return cancel
  }, [period, vacancyId, loadData])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <ReportView
              data={data}
              loading={loading}
              error={error}
              period={period}
              onPeriodChange={setPeriod}
              vacancyId={vacancyId}
              onVacancyChange={setVacancyId}
              variant="app"
              shareSlot={<ShareButton period={period} vacancyId={vacancyId} />}
            />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function HRReportPage() {
  return <ReportContent />
}
