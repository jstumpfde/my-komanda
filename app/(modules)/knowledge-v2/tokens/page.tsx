"use client"

import { useState, useEffect } from "react"
import { Coins, TrendingUp, Gauge, Loader2 } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"

interface UsageRecent {
  id: string
  action: string
  inputTokens: number | null
  outputTokens: number | null
  model: string | null
  costUsd: string | null
  createdAt: string
  userName: string | null
  userEmail: string | null
}

interface UsagePayload {
  today: { tokens: number; cost: number }
  month: { tokens: number; cost: number }
  limit: number
  daily: { date: string; tokens: number; cost: number }[]
  recent: UsageRecent[]
}

const ACTION_LABELS: Record<string, string> = {
  knowledge_ask:    "Ненси (вопрос)",
  course_generate:  "Генерация курса",
  course_regenerate:"Пересборка курса",
  document_parse:   "Импорт документа",
  voice_parse:      "Импорт с голоса",
  vacancy_generate: "Генерация вакансии",
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU")
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

export default function TokensPage() {
  const [data, setData] = useState<UsagePayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/ai/usage")
      .then(async (r) => {
        if (!r.ok) return null
        const d = await r.json().catch(() => null)
        // Validate shape — server error payloads look like { error } and would crash the render.
        if (!d || !d.month || !d.today) return null
        return d as UsagePayload
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const monthPercent = data?.month
    ? Math.min(100, (data.month.tokens / Math.max(1, data.limit)) * 100)
    : 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl font-semibold">Расход AI-токенов</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Агрегированная статистика по всем запросам к AI
                </p>
              </div>

              {loading || !data ? (
                <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Загрузка статистики...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border p-5">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                        <Coins className="w-3.5 h-3.5" />
                        Сегодня
                      </div>
                      <div className="text-2xl font-semibold mt-2">{formatNumber(data.today.tokens)}</div>
                      <div className="text-xs text-muted-foreground mt-1">~{formatUsd(data.today.cost)}</div>
                    </div>
                    <div className="rounded-xl border border-border p-5">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                        <TrendingUp className="w-3.5 h-3.5" />
                        За этот месяц
                      </div>
                      <div className="text-2xl font-semibold mt-2">{formatNumber(data.month.tokens)}</div>
                      <div className="text-xs text-muted-foreground mt-1">~{formatUsd(data.month.cost)}</div>
                    </div>
                    <div className="rounded-xl border border-border p-5">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                        <Gauge className="w-3.5 h-3.5" />
                        Лимит тарифа
                      </div>
                      <div className="text-2xl font-semibold mt-2">{formatNumber(data.limit)}</div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${monthPercent}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {monthPercent.toFixed(1)}% использовано
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-5">
                    <h2 className="text-sm font-semibold mb-4">Расход по дням (последние 30)</h2>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.daily}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDay}
                            tick={{ fontSize: 11 }}
                            stroke="hsl(var(--muted-foreground))"
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          />
                          <Tooltip
                            formatter={(v: number) => [formatNumber(v), "Токены"]}
                            labelFormatter={formatDay}
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-sm font-semibold mb-3">Последние запросы</h2>
                    {data.recent.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border py-10 text-center">
                        <Coins className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Пока нет запросов</p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 border-b border-border">
                            <tr className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              <th className="px-4 py-3">Дата</th>
                              <th className="px-4 py-3">Пользователь</th>
                              <th className="px-4 py-3">Действие</th>
                              <th className="px-4 py-3 text-right">Токены</th>
                              <th className="px-4 py-3 text-right">Стоимость</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {data.recent.map((r) => {
                              const total = (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
                              const cost = Number(r.costUsd ?? "0")
                              return (
                                <tr key={r.id} className="hover:bg-muted/30">
                                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(r.createdAt).toLocaleString("ru-RU", {
                                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                    })}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="text-xs font-medium">{r.userName ?? "—"}</div>
                                    <div className="text-xs text-muted-foreground">{r.userEmail}</div>
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    {ACTION_LABELS[r.action] ?? r.action}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs tabular-nums">{formatNumber(total)}</td>
                                  <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                                    {formatUsd(cost)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
