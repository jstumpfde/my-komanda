"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, AlertCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"

// Сессия P0-8: баннер видимости очереди anketa_filled.
//
// HR в текущем UI не видит 175 кандидатов, заполнивших финальную анкету,
// и они теряют интерес. Баннер показывается на главной /hr/dashboard
// над KPI, если по компании есть anketa_filled-кандидаты. Скрыт для роли
// employee (по плану п.2). Клик → /hr/candidates?stage=anketa_filled.

export function AwaitingReviewBanner() {
  const { user } = useAuth()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    if ((user as { role?: string }).role === "employee") return
    let cancelled = false
    fetch("/api/modules/hr/awaiting-review")
      .then(r => r.ok ? r.json() : null)
      .then((d: { count?: number } | null) => {
        if (!cancelled && d && typeof d.count === "number") setCount(d.count)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user])

  if (count == null || count <= 0) return null
  const role = (user as { role?: string } | null)?.role
  if (role === "employee") return null

  return (
    <Link
      href="/hr/candidates?stage=anketa_filled"
      className="block rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              У вас {count} {pluralize(count)} с заполненной анкетой ждут решения
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
              Кандидаты прошли демо и оставили данные. Просмотрите и переведите в следующий этап.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-300 shrink-0">
          Открыть очередь
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  )
}

function pluralize(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "кандидат"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "кандидата"
  return "кандидатов"
}
