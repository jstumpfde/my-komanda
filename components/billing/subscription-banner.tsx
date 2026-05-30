"use client"

// Глобальная плашка о подписке: обратный отсчёт пробного периода и призыв
// продлить. Показывается в шапке (над хедером) на всех страницах платформы.
// В обычном состоянии (активный тариф) ничего не рендерит — нулевое влияние.

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Clock, AlertTriangle, X } from "lucide-react"

interface Subscription {
  status: string
  daysRemaining: number | null
  plan: { name: string } | null
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export function SubscriptionBanner() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/billing/subscription")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && !d.error) setSub(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!sub) return null

  const days = sub.daysRemaining
  const isTrial = sub.status === "trial"
  const isExpired = sub.status === "expired"
  const isPaused = sub.status === "paused"

  // Мягкое предупреждение (trial с остатком ≤ 7 дней) — можно скрыть на сессию.
  const softWarning = isTrial && days !== null && days <= 7
  // Жёсткое (истёк/приостановлен) — не скрывается.
  const hard = isExpired || isPaused

  if (!softWarning && !hard) return null

  // Ключ скрытия зависит от дня — назавтра плашка вернётся.
  const dismissKey = `mk_sub_banner_${sub.status}_${days ?? "x"}`
  if (softWarning && !hard && (dismissed || (typeof window !== "undefined" && sessionStorage.getItem(dismissKey)))) {
    return null
  }

  const message = hard
    ? (isPaused
        ? "Доступ приостановлен. Выберите тариф, чтобы продолжить работу."
        : "Пробный период завершён. Выберите тариф, чтобы продолжить.")
    : days === 0
      ? "Пробный период заканчивается сегодня."
      : `Пробный период заканчивается через ${days} ${plural(days!, "день", "дня", "дней")}.`

  const tone = hard
    ? "bg-red-500/15 text-red-800 dark:text-red-300 border-red-300/50"
    : "bg-amber-400/20 text-amber-900 dark:text-amber-200 border-amber-400/40"

  return (
    <div className={`flex items-center justify-between gap-3 border-b px-4 py-1.5 text-sm ${tone}`}>
      <span className="flex items-center gap-2 font-medium">
        {hard ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
        {message}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button asChild size="sm" className="h-7 text-xs">
          <Link href="/settings/billing">{hard ? "Выбрать тариф" : "Продлить"}</Link>
        </Button>
        {softWarning && !hard && (
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            title="Скрыть до завтра"
            onClick={() => { try { sessionStorage.setItem(dismissKey, "1") } catch {} ; setDismissed(true) }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
