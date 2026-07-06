"use client"

import { useState, useEffect } from "react"
import { Coins, TrendingUp, Gauge, Loader2, Pencil, Check, X as XIcon } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"
import { useAuth } from "@/lib/auth"
import { toast } from "sonner"

const DIRECTOR_ROLES = ["director", "client", "platform_admin", "admin"]

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

interface UsageByModel {
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
}

interface UsagePayload {
  today: { tokens: number; cost: number }
  month: { tokens: number; cost: number }
  limit: number
  daily: { date: string; tokens: number; cost: number }[]
  byModel: UsageByModel[]
  recent: UsageRecent[]
}

const ACTION_LABELS: Record<string, string> = {
  knowledge_ask:          "Ненси (вопрос)",
  knowledge_ai_search:    "Поиск по базе знаний",
  knowledge_generate:     "Генерация материала",
  knowledge_telegram_ask: "Telegram-бот (вопрос)",
  knowledge_public_chat:  "Публичный чат (вопрос)",
  course_generate:        "Генерация курса",
  course_regenerate:      "Пересборка курса",
  document_parse:         "Импорт документа",
  voice_parse:            "Импорт с голоса",
  vacancy_generate:       "Генерация вакансии",
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

interface TokenLimitPayload {
  override: number | null
  platformDefault: number
  effectiveLimit: number
  used: number
}

export default function TokensPage() {
  const { role } = useAuth()
  const isDirector = DIRECTOR_ROLES.includes(role)
  const [data, setData] = useState<UsagePayload | null>(null)
  const [loading, setLoading] = useState(true)

  const [limitInfo, setLimitInfo] = useState<TokenLimitPayload | null>(null)
  const [editingLimit, setEditingLimit] = useState(false)
  const [limitInput, setLimitInput] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)

  const loadUsage = () => {
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
  }

  const loadLimitInfo = () => {
    if (!isDirector) return
    fetch("/api/modules/knowledge/token-limit")
      .then((r) => r.ok ? r.json() : null)
      .then((d: TokenLimitPayload | null) => {
        if (!d) return
        setLimitInfo(d)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadLimitInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirector])

  const openEditLimit = () => {
    setLimitInput(limitInfo?.override != null ? String(limitInfo.override) : "")
    setEditingLimit(true)
  }

  const saveLimit = async (clear: boolean) => {
    setSavingLimit(true)
    try {
      const res = await fetch("/api/modules/knowledge/token-limit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: clear ? null : Number(limitInput) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(d.error || "Не удалось сохранить лимит")
        return
      }
      toast.success(clear ? "Возвращён платформенный дефолт" : "Лимит сохранён")
      setEditingLimit(false)
      loadLimitInfo()
      loadUsage()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSavingLimit(false)
    }
  }

  const monthPercent = data?.month
    ? Math.min(100, (data.month.tokens / Math.max(1, data.limit)) * 100)
    : 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 px-4 sm:px-14">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h1 className="text-lg font-semibold">Расход AI-токенов</h1>
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                          <Gauge className="w-3.5 h-3.5" />
                          Лимит тарифа
                        </div>
                        {isDirector && !editingLimit && (
                          <button
                            type="button"
                            onClick={openEditLimit}
                            className="text-muted-foreground hover:text-foreground transition"
                            title="Изменить лимит компании"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {editingLimit ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            type="number"
                            min={1}
                            value={limitInput}
                            onChange={(e) => setLimitInput(e.target.value)}
                            placeholder={`Платформенный дефолт: ${formatNumber(limitInfo?.platformDefault ?? data.limit)}`}
                            className="h-9 text-sm"
                          />
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 px-2 gap-1"
                              disabled={savingLimit || !limitInput.trim()}
                              onClick={() => saveLimit(false)}
                            >
                              <Check className="w-3 h-3" />
                              Сохранить
                            </Button>
                            {limitInfo?.override != null && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                disabled={savingLimit}
                                onClick={() => saveLimit(true)}
                              >
                                Сбросить на дефолт
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={savingLimit}
                              onClick={() => setEditingLimit(false)}
                            >
                              <XIcon className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="text-2xl font-semibold mt-2">{formatNumber(data.limit)}</div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${monthPercent}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {monthPercent.toFixed(1)}% использовано
                            {limitInfo?.override != null && " · своё значение"}
                          </div>
                        </>
                      )}
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

                  {data.byModel && data.byModel.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold mb-3">Расход по моделям (этот месяц)</h2>
                      <TableCard>
                        <DataTable>
                          <DataHead>
                            <DataHeadCell>Модель</DataHeadCell>
                            <DataHeadCell align="right">Токены (вход)</DataHeadCell>
                            <DataHeadCell align="right">Токены (выход)</DataHeadCell>
                            <DataHeadCell align="right">Стоимость $</DataHeadCell>
                          </DataHead>
                          <tbody>
                            {data.byModel.map((m) => (
                              <DataRow key={m.model}>
                                <DataCell className="text-xs font-medium">{m.model}</DataCell>
                                <DataCell align="right" className="text-xs tabular-nums">{formatNumber(m.inputTokens)}</DataCell>
                                <DataCell align="right" className="text-xs tabular-nums">{formatNumber(m.outputTokens)}</DataCell>
                                <DataCell align="right" className="text-xs tabular-nums text-muted-foreground">
                                  {formatUsd(m.cost)}
                                </DataCell>
                              </DataRow>
                            ))}
                          </tbody>
                        </DataTable>
                      </TableCard>
                    </div>
                  )}

                  <div>
                    <h2 className="text-sm font-semibold mb-3">Последние запросы</h2>
                    {data.recent.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border py-10 text-center">
                        <Coins className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Пока нет запросов</p>
                      </div>
                    ) : (
                      <TableCard>
                        <DataTable>
                          <DataHead>
                            <DataHeadCell>Дата</DataHeadCell>
                            <DataHeadCell>Пользователь</DataHeadCell>
                            <DataHeadCell>Действие</DataHeadCell>
                            <DataHeadCell align="right">Токены</DataHeadCell>
                            <DataHeadCell align="right">Стоимость</DataHeadCell>
                          </DataHead>
                          <tbody>
                            {data.recent.map((r) => {
                              const total = (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
                              const cost = Number(r.costUsd ?? "0")
                              return (
                                <DataRow key={r.id}>
                                  <DataCell className="text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(r.createdAt).toLocaleString("ru-RU", {
                                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                    })}
                                  </DataCell>
                                  <DataCell>
                                    <div className="text-xs font-medium">{r.userName ?? "—"}</div>
                                    <div className="text-xs text-muted-foreground">{r.userEmail}</div>
                                  </DataCell>
                                  <DataCell className="text-xs">
                                    {ACTION_LABELS[r.action] ?? r.action}
                                  </DataCell>
                                  <DataCell align="right" className="text-xs tabular-nums">{formatNumber(total)}</DataCell>
                                  <DataCell align="right" className="text-xs tabular-nums text-muted-foreground">
                                    {formatUsd(cost)}
                                  </DataCell>
                                </DataRow>
                              )
                            })}
                          </tbody>
                        </DataTable>
                      </TableCard>
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
