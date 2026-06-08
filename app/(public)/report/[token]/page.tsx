"use client"

// Публичная страница «Отчёта по найму» по share-токену (без логина, только чтение).
// Данные — GET /api/public/report/[token]. ?tv=1 — крупный режим для телевизора
// с авто-обновлением раз в минуту.

import { useEffect, useState, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Loader2, BarChart3 } from "lucide-react"
import { ReportView, type ReportData, type Period } from "@/components/hr/report-view"

const REFRESH_MS = 60_000

function parsePeriod(raw: string | null): Period {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "quarter") return raw
  return "all"
}

export default function PublicReportPage() {
  const params = useParams<{ token: string }>()
  const search = useSearchParams()
  const token = params?.token
  const tv = search.get("tv") === "1"

  const initFrom = search.get("from")
  const initTo = search.get("to")
  const [period, setPeriod] = useState<Period>(initFrom ? "custom" : parsePeriod(search.get("period")))
  const [customFrom, setCustomFrom] = useState<Date | null>(initFrom ? new Date(initFrom) : null)
  const [customTo, setCustomTo] = useState<Date | null>(initTo ? new Date(initTo) : null)
  const [vacancyId, setVacancyId] = useState<string>(search.get("vacancyId") || "all")
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const loadData = useCallback((p: Period, v: string, cf: Date | null, ct: Date | null, silent = false) => {
    if (!token) return
    if (!silent) setLoading(true)
    setError(null)
    const qs = new URLSearchParams()
    if (p === "custom" && cf) {
      qs.set("from", cf.toISOString())
      if (ct) qs.set("to", ct.toISOString())
    } else if (p !== "all") {
      qs.set("period", p)
    }
    if (v !== "all") qs.set("vacancyId", v)
    const s = qs.toString()
    fetch(`/api/public/report/${token}${s ? `?${s}` : ""}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return Promise.reject("notfound") }
        return r.ok ? r.json() : Promise.reject(r.status)
      })
      .then((d: ReportData) => setData(d))
      .catch(e => { if (e !== "notfound") setError("Не удалось загрузить отчёт") })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { loadData(period, vacancyId, customFrom, customTo) }, [period, vacancyId, customFrom, customTo, loadData])

  // Авто-обновление (тихое) — особенно важно для TV.
  useEffect(() => {
    const id = setInterval(() => loadData(period, vacancyId, customFrom, customTo, true), REFRESH_MS)
    return () => clearInterval(id)
  }, [period, vacancyId, customFrom, customTo, loadData])

  const handlePeriodChange = (p: Period) => { setCustomFrom(null); setCustomTo(null); setPeriod(p) }
  const handleRangeChange = (from: Date | null, to: Date | null) => {
    if (!from) { setCustomFrom(null); setCustomTo(null); setPeriod("all"); return }
    setCustomFrom(from); setCustomTo(to); setPeriod("custom")
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/40" />
        <h1 className="text-xl font-semibold">Ссылка недоступна</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Публичная ссылка на отчёт не найдена или была отозвана владельцем компании.
        </p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div
        className={tv ? "mx-auto max-w-[1600px] px-10 py-10" : "mx-auto max-w-[1280px] px-6 py-8"}
      >
        <ReportView
          data={data}
          loading={loading}
          error={error}
          period={period}
          onPeriodChange={handlePeriodChange}
          customFrom={customFrom}
          customTo={customTo}
          onRangeChange={handleRangeChange}
          vacancyId={vacancyId}
          onVacancyChange={setVacancyId}
          variant={tv ? "tv" : "public"}
        />
        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          Company24.pro · отчёт обновляется автоматически
        </p>
      </div>
    </div>
  )
}
