"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Activity, Users, Eye, Clock, Globe, ChevronLeft, ChevronRight, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnlineUser {
  userId: string
  userName: string | null
  userEmail: string | null
  userRole: string | null
  lastPage: string | null
  lastActiveAt: string
  ip: string | null
}

interface VisitRow {
  id: string
  page: string
  ip: string | null
  createdAt: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  userRole: string | null
}

interface Stats {
  visitors: { today: number; week: number; month: number }
  topPages: { page: string; views: number }[]
  hourlyActivity: { hour: number; count: number }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Администратор",
  platform_manager: "Менеджер",
  director: "Директор",
  hr_lead: "Главный HR",
  hr_manager: "HR-менеджер",
  department_head: "Руководитель",
  observer: "Наблюдатель",
}

const COLORS = ["#8b5cf6", "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#6366f1", "#ec4899"]

function getInitials(name: string | null): string {
  if (!name) return "?"
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function getColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return "только что"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} мин назад`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ч назад`
  return `${Math.floor(hr / 24)} дн назад`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function prettyPage(page: string): string {
  const map: Record<string, string> = {
    "/": "Главная",
    "/hr/vacancies": "Вакансии",
    "/hr/candidates": "Кандидаты",
    "/hr/dashboard": "Дашборд HR",
    "/hr/courses": "Курсы",
    "/knowledge": "База знаний",
    "/sales/clients": "CRM: Компании",
    "/sales/contacts": "CRM: Контакты",
    "/sales/requests": "CRM: Заявки",
    "/tasks": "Задачи",
    "/settings/company": "Настройки: Компания",
    "/settings/profile": "Настройки: Профиль",
  }
  for (const [prefix, label] of Object.entries(map)) {
    if (page === prefix) return label
  }
  if (page.startsWith("/hr/vacancies/")) return "Вакансия"
  if (page.startsWith("/hr/courses/")) return "Курс"
  if (page.startsWith("/knowledge/")) return "Статья"
  if (page.startsWith("/tasks/")) return "Задачи"
  return page
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function VisitLogPage() {
  const [online, setOnline] = useState<OnlineUser[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filterUser, setFilterUser] = useState("all")
  const [filterPage, setFilterPage] = useState("")
  const PAGE_SIZE = 20

  // Fetch all data
  const fetchAll = useCallback(async () => {
    try {
      const [onlineRes, statsRes, visitsRes] = await Promise.all([
        fetch("/api/visit-log/online"),
        fetch("/api/visit-log/stats"),
        fetch("/api/visit-log?limit=500"),
      ])
      if (onlineRes.ok) setOnline(await onlineRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
      if (visitsRes.ok) setVisits(await visitsRes.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll online every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/visit-log/online")
        if (res.ok) setOnline(await res.json())
      } catch {}
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Filtered + paginated visits
  const filteredVisits = visits.filter((v) => {
    if (filterUser !== "all" && v.userId !== filterUser) return false
    if (filterPage && !v.page.toLowerCase().includes(filterPage.toLowerCase())) return false
    return true
  })
  const totalPages = Math.ceil(filteredVisits.length / PAGE_SIZE)
  const paginatedVisits = filteredVisits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Unique users for filter
  const uniqueUsers = Array.from(
    new Map(visits.filter((v) => v.userId).map((v) => [v.userId, { id: v.userId!, name: v.userName }])).values()
  )

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 space-y-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-blue-500" />
              <h1 className="text-xl font-semibold">Журнал посещений</h1>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && (
              <>
                {/* ── KPI cards ── */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="border rounded-xl p-4 bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Сейчас онлайн</span>
                      <span className="relative flex size-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
                      </span>
                    </div>
                    <p className="text-3xl font-bold">{online.length}</p>
                  </div>
                  <div className="border rounded-xl p-4 bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Сегодня</span>
                      <Eye className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-3xl font-bold">{stats?.visitors.today ?? 0}</p>
                  </div>
                  <div className="border rounded-xl p-4 bg-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">За неделю</span>
                      <Users className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-3xl font-bold">{stats?.visitors.week ?? 0}</p>
                  </div>
                </div>

                {/* ── Online users ── */}
                <div className="border rounded-xl bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b bg-muted/20 flex items-center gap-2">
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                    </span>
                    <h2 className="text-sm font-semibold">Сейчас онлайн</h2>
                    <Badge variant="secondary" className="text-[10px]">{online.length}</Badge>
                  </div>
                  {online.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                      Нет активных пользователей
                    </div>
                  ) : (
                    <div className="divide-y">
                      {online.map((u) => (
                        <div key={u.userId} className="px-5 py-3 flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="size-9">
                              <AvatarFallback style={{ backgroundColor: getColor(u.userId) }} className="text-white text-xs font-semibold">
                                {getInitials(u.userName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{u.userName || u.userEmail || "Пользователь"}</p>
                              {u.userRole && (
                                <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[u.userRole] ?? u.userRole}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {u.lastPage ? prettyPage(u.lastPage) : "—"}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(u.lastActiveAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Visit history ── */}
                <div className="border rounded-xl bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b bg-muted/20 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">История посещений</h2>
                    <div className="flex items-center gap-2">
                      <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setPage(0) }}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Пользователь" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все пользователи</SelectItem>
                          {uniqueUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id!}>{u.name || u.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Фильтр по странице..."
                        value={filterPage}
                        onChange={(e) => { setFilterPage(e.target.value); setPage(0) }}
                        className="h-7 w-44 text-xs"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Время</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Пользователь</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Роль</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Страница</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">IP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paginatedVisits.map((v) => (
                          <tr key={v.id} className="hover:bg-muted/30">
                            <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatTime(v.createdAt)}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                {v.userId && (
                                  <Avatar className="size-5">
                                    <AvatarFallback style={{ backgroundColor: getColor(v.userId) }} className="text-white text-[8px]">
                                      {getInitials(v.userName)}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <span className="text-xs">{v.userName || v.userEmail || "Аноним"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{v.userRole ? (ROLE_LABELS[v.userRole] ?? v.userRole) : "—"}</td>
                            <td className="px-4 py-2 text-xs">{prettyPage(v.page)}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{v.ip || "—"}</td>
                          </tr>
                        ))}
                        {paginatedVisits.length === 0 && (
                          <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Нет записей</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="px-5 py-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {filteredVisits.length} записей · Стр. {page + 1} из {totalPages}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="size-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                          <ChevronLeft className="size-3.5" />
                        </Button>
                        <Button variant="outline" size="icon" className="size-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Top pages ── */}
                {stats && stats.topPages.length > 0 && (
                  <div className="border rounded-xl bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b bg-muted/20">
                      <h2 className="text-sm font-semibold">Популярные страницы</h2>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Страница</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Визитов</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stats.topPages.map((p, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-4 py-2 text-xs">
                              <span className="font-medium">{prettyPage(p.page)}</span>
                              <span className="text-muted-foreground ml-2">{p.page}</span>
                            </td>
                            <td className="px-4 py-2 text-xs text-right font-medium">{p.views}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
