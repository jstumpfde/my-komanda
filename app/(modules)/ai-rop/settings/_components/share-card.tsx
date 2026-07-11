"use client"

// Публичная ссылка на дашборд + журнал просмотров (lib/ai-rop/dashboard-share.ts
// + lib/ai-rop/report-views.ts, читаются server-side в page.tsx; тут только
// create/revoke мутации и статичный вывод статистики, переданной пропом).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Share2, Copy, RotateCw, X, Check, Eye, Users, CalendarCheck } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ReportViewStats } from "@/lib/ai-rop/report-views"

export function ShareCard({ initialToken, baseUrl, stats }: { initialToken: string | null; baseUrl: string; stats: ReportViewStats | null }) {
  const [token, setToken] = useState(initialToken)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const url = token ? `${baseUrl}/rop-report/${token}` : null

  async function gen() {
    setBusy(true)
    try {
      const r = await fetch("/api/modules/ai-rop/dashboard-share", { method: "POST" })
      const data = await r.json()
      if (data.ok) { setToken(data.token); router.refresh() }
    } finally { setBusy(false) }
  }
  async function revoke() {
    if (!confirm("Отозвать ссылку?")) return
    setBusy(true)
    try {
      const r = await fetch("/api/modules/ai-rop/dashboard-share", { method: "DELETE" })
      if (r.ok) { setToken(null); router.refresh() }
    } finally { setBusy(false) }
  }
  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Share2 className="size-4 text-violet-600" /> Публичная ссылка на дашборд</CardTitle>
        <CardDescription>Read-only витрина без логина: KPI и таблица менеджеров. Один активный токен на компанию.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!token ? (
          <Button size="sm" onClick={gen} disabled={busy} className="w-fit">{busy ? "Создаю…" : "Создать ссылку"}</Button>
        ) : (
          <>
            <div className="flex gap-1.5">
              <Input readOnly value={url ?? ""} className="font-mono text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <Button variant="outline" size="icon" onClick={copy}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={gen} disabled={busy}><RotateCw className="size-3.5" /> Перегенерировать</Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-destructive" onClick={revoke} disabled={busy}><X className="size-3.5" /> Отозвать</Button>
            </div>

            {stats && stats.total30d > 0 && (
              <div className="mt-1 border-t pt-3">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Журнал просмотров · 30 дней</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-muted p-2.5"><Eye className="size-3.5 text-muted-foreground" /><div className="mt-1 text-lg font-bold">{stats.total30d}</div><div className="text-[10px] text-muted-foreground">заходов</div></div>
                  <div className="rounded-lg bg-muted p-2.5"><Users className="size-3.5 text-muted-foreground" /><div className="mt-1 text-lg font-bold">{stats.uniqueViewers30d}</div><div className="text-[10px] text-muted-foreground">зрителей</div></div>
                  <div className="rounded-lg bg-muted p-2.5"><CalendarCheck className="size-3.5 text-muted-foreground" /><div className="mt-1 text-lg font-bold">{stats.activeDays30d}/30</div><div className="text-[10px] text-muted-foreground">дней с заходами</div></div>
                </div>
              </div>
            )}
            {stats && stats.total30d === 0 && <div className="text-xs text-muted-foreground">Ссылку ещё не открывали.</div>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
