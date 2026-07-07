"use client"

// «Сторож найма» (Юрий 07.07): тонкая полоса ПОВЕРХ контента на всех
// страницах платформы — по образцу components/billing/subscription-banner.tsx
// (не fixed-модал, монтируется в общей шапке components/dashboard/header.tsx).
// Если открытых алертов нет — рендерит null (ноль шума). Красная для critical,
// жёлтая для warning. Поллинг раз в 60с, лёгкий запрос (count + первые 3).

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AlertTriangle, AlertCircle, Check, ChevronDown, ChevronUp } from "lucide-react"

interface AdminAlert {
  id:         string
  companyId:  string | null
  severity:   "critical" | "warning" | "info"
  title:      string
  message:    string
  actionUrl:  string | null
  createdAt:  string
}

const POLL_MS = 60_000

export function AdminAlertsBanner() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [count, setCount] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [ackingId, setAckingId] = useState<string | null>(null)

  const fetchAlerts = useCallback(() => {
    fetch("/api/modules/hr/admin-alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setAlerts(Array.isArray(d.alerts) ? d.alerts : [])
        setCount(typeof d.count === "number" ? d.count : 0)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchAlerts()
    const timer = setInterval(fetchAlerts, POLL_MS)
    return () => clearInterval(timer)
  }, [fetchAlerts])

  if (count === 0 || alerts.length === 0) return null

  const ack = async (id: string) => {
    if (ackingId) return
    setAckingId(id)
    try {
      await fetch(`/api/modules/hr/admin-alerts/${id}/ack`, { method: "POST" })
      setAlerts((prev) => prev.filter((a) => a.id !== id))
      setCount((prev) => Math.max(0, prev - 1))
    } catch {
      // тихо — следующий поллинг подтянет актуальное состояние
    } finally {
      setAckingId(null)
    }
  }

  const top = alerts[0]
  const hasMore = alerts.length > 1
  const isCritical = top.severity === "critical"

  const tone = isCritical
    ? "bg-red-500/15 text-red-800 dark:text-red-300 border-red-300/50 font-semibold"
    : "bg-amber-400/20 text-amber-900 dark:text-amber-200 border-amber-400/40"

  return (
    <div className={`flex flex-col gap-1 border-b px-4 py-1.5 text-sm ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          {isCritical ? <AlertCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="truncate">
            {top.title}
            {count > 1 && <span className="ml-1 font-normal opacity-70">и ещё {count - 1}</span>}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {top.actionUrl && (
            <Button asChild size="sm" className="h-7 text-xs">
              <Link href={top.actionUrl}>Перейти</Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={ackingId === top.id}
            onClick={() => void ack(top.id)}
          >
            <Check className="mr-1 h-3 w-3" />
            Принято
          </Button>
          {hasMore && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={expanded ? "Свернуть" : "Показать ещё"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      <p className="pl-6 text-xs opacity-80">{top.message}</p>
      {expanded && alerts.slice(1).map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 border-t border-current/10 pt-1.5 pl-6">
          <span className="min-w-0 truncate text-xs">
            {a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "ℹ️"} {a.title} — {a.message}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {a.actionUrl && (
              <Button asChild size="sm" variant="outline" className="h-6 text-xs">
                <Link href={a.actionUrl}>Перейти</Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              disabled={ackingId === a.id}
              onClick={() => void ack(a.id)}
            >
              <Check className="mr-1 h-3 w-3" />
              Принято
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
