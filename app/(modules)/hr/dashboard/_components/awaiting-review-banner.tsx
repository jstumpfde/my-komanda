"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { useAuth } from "@/lib/auth"

// P0-9: баннер дельты «свежих» кандидатов на /hr/dashboard.
//
// Заменяет P0-8-вариант «У вас N кандидатов с заполненной анкетой
// ждут решения» — общая цифра создавала ложную тревогу при дефолте
// direct_demo (P0-7), HR думал «надо разбирать», хотя кандидаты
// автоматически уходят на демо.
//
// Сейчас показываем список по вакансиям с +N свежих anketa_filled
// (с прошлого захода HR в карточку). Если ничего свежего — баннер
// не рендерится. Скрыт для роли employee.
//
// Источник данных: GET /api/modules/hr/awaiting-review →
//   { freshTotal, vacancies: [{ id, title, freshCount }] }

type Vacancy = { id: string; title: string; freshCount: number }

export function AwaitingReviewBanner() {
  const { user } = useAuth()
  const [data, setData] = useState<{ freshTotal: number; vacancies: Vacancy[] } | null>(null)

  useEffect(() => {
    if (!user) return
    if ((user as { role?: string }).role === "employee") return
    let cancelled = false
    fetch("/api/modules/hr/awaiting-review")
      .then(r => r.ok ? r.json() : null)
      .then((d: { freshTotal?: number; vacancies?: Vacancy[] } | null) => {
        if (cancelled || !d) return
        const vacancies = Array.isArray(d.vacancies) ? d.vacancies : []
        const freshTotal = typeof d.freshTotal === "number" ? d.freshTotal : 0
        setData({ freshTotal, vacancies })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user])

  if (!data || data.freshTotal <= 0 || data.vacancies.length === 0) return null
  const role = (user as { role?: string } | null)?.role
  if (role === "employee") return null

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Новые кандидаты с прошлого захода
        </p>
      </div>
      <ul className="space-y-1 pl-6">
        {data.vacancies.map(v => (
          <li key={v.id} className="text-sm">
            <Link
              href={`/hr/vacancies/${v.id}`}
              className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-200 hover:underline"
            >
              <span className="font-medium">+{v.freshCount}</span>
              <span>в «{v.title}»</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-60" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
