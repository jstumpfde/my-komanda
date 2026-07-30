"use client"

// Клиентские интерактивные кусочки публичного отчёта AI-РОП:
//  - ReportThemeToggle — тумблер темы, независимый от next-themes (см. layout.tsx).
//  - PeriodTabs / ManagerFilterSelect — фильтры, пишут выбор в query (?period=/?managerId=),
//    страница — Server Component, поэтому смена фильтра = обычная навигация (router.push),
//    без клиентского fetch.
//  - ReportAutoRefresh — мягкое автообновление (router.refresh(), без перезагрузки
//    страницы) + fire-and-forget трекер просмотра.

import { useEffect, useState, useCallback } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const THEME_KEY = "rop-report-theme"

export function ReportThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as "light" | "dark" | null)
      ?? (document.documentElement.classList.contains("dark") ? "dark" : "light")
    setTheme(saved)
    setMounted(true)
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      localStorage.setItem(THEME_KEY, next)
      document.documentElement.classList.toggle("dark", next === "dark")
      return next
    })
  }, [])

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      title={mounted && theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="shrink-0"
    >
      {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

export interface PeriodOption { id: string; label: string }

export function PeriodTabs({ current, options }: { current: string; options: PeriodOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete("period")
    else params.set("period", value)
    router.push(`${pathname}?${params.toString()}`)
  }, [pathname, router, searchParams])

  return (
    <Tabs value={current} onValueChange={onChange}>
      <TabsList className="flex-wrap h-auto">
        {options.map((o) => (
          <TabsTrigger key={o.id} value={o.id}>{o.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function ManagerFilterSelect({
  current, managers,
}: { current: string; managers: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete("managerId")
    else params.set("managerId", value)
    router.push(`${pathname}?${params.toString()}`)
  }, [pathname, router, searchParams])

  if (managers.length === 0) return null

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm w-full sm:w-[220px]">
        <SelectValue placeholder="Все менеджеры" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Все менеджеры</SelectItem>
        {managers.map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ReportAutoRefresh({
  token, tv, intervalSec,
}: { token: string; tv: boolean; intervalSec: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalSec * 1000)
    return () => clearInterval(id)
  }, [intervalSec, router])

  useEffect(() => {
    // Трекер захода — fire-and-forget, POST /api/public/rop-report/[token]
    // (route.ts, чужая зона app/api/**) — ставит cookie rop_report_viewer,
    // пишет в rop_report_views, контракт сверен.
    fetch(`/api/public/rop-report/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: tv ? "tv" : "dashboard" }),
      keepalive: true,
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tv])

  return null
}
