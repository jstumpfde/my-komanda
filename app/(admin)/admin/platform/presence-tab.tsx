"use client"

// Платформенный журнал присутствия: кто сейчас на сайте (по всем компаниям),
// с акцентом на кандидатов на демо/анкетах — гейт безопасности деплоя.
// Живой опрос /api/platform/presence каждые 15 сек.

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, ShieldCheck, ShieldAlert, Users, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface OnlineRow {
  sessionId: string | null
  page: string
  kind: string
  candidate: boolean
  ip: string | null
  authenticated: boolean
  lastSeen: string | null
}
interface RecentRow {
  page: string
  ip: string | null
  userId: string | null
  createdAt: string | null
}
interface PresenceData {
  totalOnline: number
  candidateCount: number
  safeToDeploy: boolean
  online: OnlineRow[]
  recent: RecentRow[]
  windowMinutes: number
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—"
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s} сек назад`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function PresenceTab() {
  const [data, setData] = useState<PresenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/presence", { cache: "no-store" })
      if (!res.ok) throw new Error()
      setData((await res.json()) as PresenceData)
      setUpdatedAt(Date.now())
    } catch {
      /* тихо — следующий тик попробует снова */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
      </div>
    )
  }
  if (!data) return <p className="text-sm text-muted-foreground py-8">Не удалось загрузить данные присутствия.</p>

  const safe = data.safeToDeploy

  return (
    <div className="space-y-4">
      {/* Гейт деплоя */}
      <Card className={cn("border-2", safe ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/50 bg-red-500/5")}>
        <CardContent className="flex items-center gap-3 py-4">
          {safe ? <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" /> : <ShieldAlert className="h-6 w-6 text-red-600 shrink-0" />}
          <div className="flex-1">
            <p className={cn("font-semibold", safe ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
              {safe ? "Можно катить — на кандидатских страницах никого" : `⚠️ Деплой не рекомендуется — ${data.candidateCount} на кандидатских страницах`}
            </p>
            <p className="text-xs text-muted-foreground">
              Всего сейчас на сайте: {data.totalOnline}. Окно присутствия — {data.windowMinutes} мин.
              {updatedAt ? ` Обновлено ${timeAgo(new Date(updatedAt).toISOString())}.` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Обновить
          </Button>
        </CardContent>
      </Card>

      {/* Сейчас на сайте */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Сейчас на сайте ({data.online.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.online.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">Сейчас никого нет онлайн.</p>
          ) : (
            <div className="divide-y">
              {data.online.map((o, i) => (
                <div key={(o.sessionId ?? "") + i} className={cn("flex items-center gap-3 px-4 py-2.5", o.candidate && "bg-amber-500/5")}>
                  <Badge className={cn("text-xs border-0 shrink-0", o.candidate ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>
                    {o.kind}
                  </Badge>
                  <span className="text-sm text-foreground font-mono truncate flex-1">{o.page}</span>
                  {o.authenticated && <Badge variant="secondary" className="text-[10px] shrink-0">вошёл</Badge>}
                  <span className="text-xs text-muted-foreground shrink-0">{o.ip ?? "—"}</span>
                  <span className="text-xs text-muted-foreground shrink-0 w-24 text-right">{timeAgo(o.lastSeen)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* История заходов */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">История заходов (последние {data.recent.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-96 overflow-auto">
            {data.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-foreground truncate flex-1">{r.page}</span>
                <span className="text-xs text-muted-foreground shrink-0">{r.userId ? "сотрудник" : "аноним"}</span>
                <span className="text-xs text-muted-foreground shrink-0">{r.ip ?? "—"}</span>
                <span className="text-xs text-muted-foreground shrink-0 w-28 text-right">{timeAgo(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
