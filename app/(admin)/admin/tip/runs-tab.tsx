"use client"

// Таб «Прогоны»: счётчики + таблица последних прогонов + блок «Пользователи».

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, ExternalLink } from "lucide-react"
import { toast } from "sonner"

interface RunRow {
  id: string
  userId: string
  inputJson: {
    contexts?: string[]
    depth?: string
    audience?: string
  } | null
  status: string
  tokensIn: number | null
  tokensOut: number | null
  costUsd: string | null
  shareToken: string | null
  createdAt: string
  finishedAt: string | null
}

interface RunsResponse {
  runs: RunRow[]
  stats: { total: number; today: number; totalCostUsd: string }
  users: { total: number; withBalance: number; balanceSum: number }
}

const STATUS_BADGE: Record<string, string> = {
  pending:    "text-muted-foreground border-border bg-muted/40",
  generating: "text-amber-700 border-amber-300 bg-amber-50",
  done:       "text-emerald-700 border-emerald-300 bg-emerald-50",
  error:      "text-red-700 border-red-300 bg-red-50",
}
const STATUS_LABEL: Record<string, string> = {
  pending: "ожидание", generating: "генерация", done: "готово", error: "ошибка",
}

const AUDIENCE_LABEL: Record<string, string> = {
  self: "себе", send_to_person: "отправить", hiring_analysis: "найм",
}
const DEPTH_LABEL: Record<string, string> = {
  short: "кратко", detailed: "подробно", full: "полный",
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
function fmtDuration(start: string, end: string | null): string {
  if (!end) return "—"
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return "—"
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} с`
  return `${Math.floor(s / 60)} мин ${s % 60} с`
}
function fmtCost(v: string | null): string {
  if (!v) return "—"
  const n = Number(v)
  if (isNaN(n)) return "—"
  return `$${n.toFixed(4)}`
}

export function RunsTab() {
  const [data, setData] = useState<RunsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/tip/runs?limit=50")
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? "Не удалось загрузить прогоны"); return }
      setData(json)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5 pt-4">
      {loading || !data ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Загрузка…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">Всего прогонов</p>
                <p className="text-2xl font-semibold">{data.stats.total.toLocaleString("ru-RU")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">За сегодня</p>
                <p className="text-2xl font-semibold">{data.stats.today.toLocaleString("ru-RU")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">Суммарный cost</p>
                <p className="text-2xl font-semibold">{fmtCost(data.stats.totalCostUsd)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Пользователи</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Всего</p>
                <p className="text-xl font-semibold">{data.users.total.toLocaleString("ru-RU")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">С балансом &gt; 0</p>
                <p className="text-xl font-semibold">{data.users.withBalance.toLocaleString("ru-RU")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Суммарный выданный баланс</p>
                <p className="text-xl font-semibold">{data.users.balanceSum.toLocaleString("ru-RU")}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Последние прогоны</CardTitle></CardHeader>
            <CardContent>
              {data.runs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Прогонов пока нет.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Контекст</TableHead>
                        <TableHead>Глубина</TableHead>
                        <TableHead>Аудитория</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Токены in/out</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Длительность</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.runs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
                          <TableCell className="text-sm">{(r.inputJson?.contexts ?? []).join(", ") || "—"}</TableCell>
                          <TableCell className="text-sm">{r.inputJson?.depth ? (DEPTH_LABEL[r.inputJson.depth] ?? r.inputJson.depth) : "—"}</TableCell>
                          <TableCell className="text-sm">{r.inputJson?.audience ? (AUDIENCE_LABEL[r.inputJson.audience] ?? r.inputJson.audience) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_BADGE[r.status] ?? ""}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {r.tokensIn ?? "—"} / {r.tokensOut ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">{fmtCost(r.costUsd)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDuration(r.createdAt, r.finishedAt)}</TableCell>
                          <TableCell>
                            {r.status === "done" && r.shareToken && (
                              <a
                                href={`/tip/r/${r.shareToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                Открыть<ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
