"use client"

// AI-агент Яндекс.Директ: подключение по OAuth, обзор кампаний (поиск/РСЯ),
// AI-создание кампаний из брифа, лента рекомендаций оптимизатора + автопилот.

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { toast } from "sonner"
import {
  Target, RefreshCw, Sparkles, Bot, Play, Check, X, Loader2,
  TrendingUp, MousePointerClick, Wallet, Goal,
} from "lucide-react"

// ── Типы (зеркалят API) ───────────────────────────────────────────────────────

interface AgentSettings {
  mode: "recommend" | "autopilot"
  targetCpa?: number
  maxCpc?: number
  dailyBudgetLimit?: number
  minClicksForDecision: number
  analysisPeriodDays: number
  pausedByAgentEnabled: boolean
}

interface Campaign {
  id: string
  directId: number
  name: string
  placement: string | null
  state: string | null
  status: string | null
  dailyBudget: number | null
  createdByAgent: boolean
}

interface StatRow {
  directId: number
  date: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
}

interface AgentAction {
  id: string
  directCampaignId: number | null
  type: string
  title: string
  description: string
  impact: string | null
  status: string
  source: string
  error: string | null
  createdAt: string
}

interface AdDraft { title: string; title2: string; text: string }

interface CampaignDraft {
  campaignName: string
  searchAds: AdDraft[]
  networkAds: AdDraft[]
  keywords: string[]
  negativeKeywords: string[]
  strategyComment: string
}

interface Overview {
  connected: boolean
  configured?: boolean
  yandexLogin?: string | null
  lastSyncedAt?: string | null
  settings?: AgentSettings
  campaigns?: Campaign[]
  stats?: StatRow[]
  actions?: AgentAction[]
}

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  ON:        { label: "Идут показы", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  SUSPENDED: { label: "Остановлена", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  OFF:       { label: "Выключена",   cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
  ENDED:     { label: "Завершена",   cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  ARCHIVED:  { label: "Архив",       cls: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500" },
}

const PLACEMENT_LABEL: Record<string, string> = { search: "Поиск", network: "РСЯ", mixed: "Поиск + РСЯ" }

const ACTION_STATUS: Record<string, { label: string; cls: string }> = {
  proposed:  { label: "Ожидает",    cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
  applied:   { label: "Применено",  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  dismissed: { label: "Отклонено",  cls: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500" },
  failed:    { label: "Ошибка",     cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
}

const IMPACT_LABEL: Record<string, string> = { high: "Высокий эффект", medium: "Средний эффект", low: "Низкий эффект" }

const APPLICABLE = new Set(["pause_keyword", "add_negative_keywords", "set_keyword_bid", "pause_campaign", "set_daily_budget"])

const REGIONS = [
  { id: 225, name: "Вся Россия" },
  { id: 213, name: "Москва" },
  { id: 1, name: "Москва и область" },
  { id: 2, name: "Санкт-Петербург" },
  { id: 10174, name: "СПб и Ленобласть" },
  { id: 54, name: "Екатеринбург" },
  { id: 65, name: "Новосибирск" },
  { id: 43, name: "Казань" },
]

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n)

export default function YandexDirectPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/marketing/yandex-direct/overview")
      if (!res.ok) throw new Error()
      setOverview(await res.json())
    } catch {
      toast.error("Не удалось загрузить данные Яндекс.Директа")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get("connected")) toast.success("Яндекс.Директ подключён")
    if (params.get("error")) toast.error("Не удалось подключить Яндекс.Директ")
  }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/modules/marketing/yandex-direct/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Синхронизировано: ${data.campaigns} кампаний`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ошибка синхронизации")
    } finally {
      setSyncing(false)
    }
  }

  const handleRunAgent = async () => {
    setRunning(true)
    try {
      const res = await fetch("/api/modules/marketing/yandex-direct/agent", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.skippedReason === "no_traffic") toast.info("Пока мало трафика для анализа — агент подождёт данных")
      else if (data.skippedReason === "no_campaigns") toast.info("В аккаунте нет кампаний — создайте первую во вкладке «Создать»")
      else toast.success(`Анализ завершён: ${data.recommendations} рекомендаций${data.autoApplied ? `, применено автопилотом: ${data.autoApplied}` : ""}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ошибка анализа")
    } finally {
      setRunning(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-6 lg:px-14">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 pt-3 pb-2">
                  <Target className="h-5 w-5 text-red-500" />
                  <h1 className="text-lg font-semibold">Яндекс.Директ — AI-агент</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Создание кампаний на поиске и в РСЯ, ведение и оптимизация искусственным интеллектом
                </p>
              </div>
              {overview?.connected && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-lg">{overview.yandexLogin ?? "аккаунт подключён"}</Badge>
                  <Button variant="outline" className="rounded-xl gap-1.5" onClick={handleSync} disabled={syncing}>
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Обновить
                  </Button>
                  <Button className="rounded-xl gap-1.5" onClick={handleRunAgent} disabled={running}>
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Запустить анализ
                  </Button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…
              </div>
            ) : !overview?.connected ? (
              <ConnectCard configured={overview?.configured ?? false} />
            ) : (
              <ConnectedView overview={overview} reload={load} />
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ConnectCard({ configured }: { configured: boolean }) {
  return (
    <Card className="rounded-2xl max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-red-500" /> Подключите Яндекс.Директ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          AI-агент подключается к вашему рекламному аккаунту, сам создаёт кампании на поиске и в РСЯ,
          следит за статистикой и оптимизирует: отключает фразы-пожиратели, добавляет минус-слова,
          корректирует ставки. Работает в двух режимах — рекомендации или автопилот.
        </p>
        {configured ? (
          <Button
            className="rounded-xl gap-1.5"
            onClick={() => { window.location.href = "/api/integrations/yandex-direct/auth" }}
          >
            <Target className="w-4 h-4" /> Подключить через Яндекс
          </Button>
        ) : (
          <p className="text-sm text-amber-600">
            Интеграция не настроена на сервере: нужны YANDEX_DIRECT_CLIENT_ID и YANDEX_DIRECT_CLIENT_SECRET.
            Обратитесь к администратору платформы.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ConnectedView({ overview, reload }: { overview: Overview; reload: () => Promise<void> }) {
  const campaigns = overview.campaigns ?? []
  const stats = overview.stats ?? []
  const actions = overview.actions ?? []

  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    for (const s of stats) { t.impressions += s.impressions; t.clicks += s.clicks; t.cost += s.cost; t.conversions += s.conversions }
    return t
  }, [stats])

  const statsByCampaign = useMemo(() => {
    const m = new Map<number, { clicks: number; cost: number; conversions: number; impressions: number }>()
    for (const s of stats) {
      const agg = m.get(s.directId) ?? { clicks: 0, cost: 0, conversions: 0, impressions: 0 }
      agg.clicks += s.clicks; agg.cost += s.cost; agg.conversions += s.conversions; agg.impressions += s.impressions
      m.set(s.directId, agg)
    }
    return m
  }, [stats])

  const pendingCount = actions.filter(a => a.status === "proposed").length

  return (
    <Tabs defaultValue="overview">
      <TabsList className="rounded-xl mb-5">
        <TabsTrigger value="overview" className="rounded-lg">Обзор</TabsTrigger>
        <TabsTrigger value="agent" className="rounded-lg">
          AI-агент {pendingCount > 0 && <Badge className="ml-1.5 rounded-md bg-violet-600 text-white">{pendingCount}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="create" className="rounded-lg">Создать кампанию</TabsTrigger>
        <TabsTrigger value="settings" className="rounded-lg">Настройки</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="Показы за 14 дней" value={fmt(totals.impressions)} />
          <SummaryCard icon={<MousePointerClick className="w-4 h-4" />} label="Клики" value={fmt(totals.clicks)}
            sub={totals.impressions ? `CTR ${(totals.clicks / totals.impressions * 100).toFixed(2)}%` : undefined} />
          <SummaryCard icon={<Wallet className="w-4 h-4" />} label="Расход" value={`${fmt(totals.cost)} ₽`}
            sub={totals.clicks ? `CPC ${fmt(totals.cost / totals.clicks)} ₽` : undefined} />
          <SummaryCard icon={<Goal className="w-4 h-4" />} label="Конверсии" value={fmt(totals.conversions)}
            sub={totals.conversions ? `CPA ${fmt(totals.cost / totals.conversions)} ₽` : undefined} />
        </div>

        <TableCard>
          <DataTable>
            <DataHead>
              <DataHeadCell>Кампания</DataHeadCell>
              <DataHeadCell>Площадка</DataHeadCell>
              <DataHeadCell>Статус</DataHeadCell>
              <DataHeadCell className="text-right">Клики</DataHeadCell>
              <DataHeadCell className="text-right">Расход</DataHeadCell>
              <DataHeadCell className="text-right">Конверсии</DataHeadCell>
              <DataHeadCell className="text-right">CPA</DataHeadCell>
            </DataHead>
            <tbody>
              {campaigns.length === 0 && (
                <DataRow><DataCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Кампаний пока нет — нажмите «Обновить» или создайте первую во вкладке «Создать кампанию»
                </DataCell></DataRow>
              )}
              {campaigns.map(c => {
                const st = STATE_BADGE[c.state ?? ""] ?? { label: c.state ?? "—", cls: "bg-gray-100 text-gray-600" }
                const agg = statsByCampaign.get(c.directId)
                return (
                  <DataRow key={c.id}>
                    <DataCell>
                      <div className="font-medium">{c.name}</div>
                      {c.createdByAgent && <span className="text-xs text-violet-600">создана AI-агентом</span>}
                    </DataCell>
                    <DataCell>{PLACEMENT_LABEL[c.placement ?? ""] ?? "—"}</DataCell>
                    <DataCell><Badge className={`rounded-md ${st.cls}`}>{st.label}</Badge></DataCell>
                    <DataCell className="text-right">{agg ? fmt(agg.clicks) : "—"}</DataCell>
                    <DataCell className="text-right">{agg ? `${fmt(agg.cost)} ₽` : "—"}</DataCell>
                    <DataCell className="text-right">{agg ? fmt(agg.conversions) : "—"}</DataCell>
                    <DataCell className="text-right">{agg && agg.conversions > 0 ? `${fmt(agg.cost / agg.conversions)} ₽` : "—"}</DataCell>
                  </DataRow>
                )
              })}
            </tbody>
          </DataTable>
        </TableCard>
      </TabsContent>

      <TabsContent value="agent">
        <AgentFeed actions={actions} reload={reload} />
      </TabsContent>

      <TabsContent value="create">
        <CreateWizard reload={reload} />
      </TabsContent>

      <TabsContent value="settings">
        <AgentSettingsForm initial={overview.settings!} />
      </TabsContent>
    </Tabs>
  )
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1.5">{icon}{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ── Лента агента ──────────────────────────────────────────────────────────────

function AgentFeed({ actions, reload }: { actions: AgentAction[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (id: string, action: "apply" | "dismiss") => {
    setBusy(id)
    try {
      const res = await fetch(`/api/modules/marketing/yandex-direct/agent/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(action === "apply" ? "Действие применено в Директе" : "Рекомендация отклонена")
      await reload()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ошибка")
    } finally {
      setBusy(null)
    }
  }

  if (actions.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Bot className="w-8 h-8 mx-auto mb-3 opacity-50" />
          Рекомендаций пока нет. Нажмите «Запустить анализ» в шапке — агент изучит статистику и предложит улучшения.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {actions.map(a => {
        const st = ACTION_STATUS[a.status] ?? ACTION_STATUS.proposed
        return (
          <Card key={a.id} className="rounded-2xl">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge className={`rounded-md ${st.cls}`}>{st.label}</Badge>
                    {a.impact && <span className="text-xs text-muted-foreground">{IMPACT_LABEL[a.impact] ?? a.impact}</span>}
                    {a.source === "autopilot" && <Badge variant="outline" className="rounded-md text-xs">автопилот</Badge>}
                    <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("ru-RU")}</span>
                  </div>
                  <div className="font-medium">{a.title}</div>
                  <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                  {a.error && <p className="text-sm text-red-600 mt-1">Ошибка: {a.error}</p>}
                </div>
                {a.status === "proposed" && (
                  <div className="flex items-center gap-2 shrink-0">
                    {APPLICABLE.has(a.type) && (
                      <Button size="sm" className="rounded-xl gap-1" onClick={() => act(a.id, "apply")} disabled={busy === a.id}>
                        {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Применить
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => act(a.id, "dismiss")} disabled={busy === a.id}>
                      <X className="w-3.5 h-3.5" /> Отклонить
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Мастер создания кампании ──────────────────────────────────────────────────

function CreateWizard({ reload }: { reload: () => Promise<void> }) {
  const [step, setStep] = useState<"brief" | "draft">("brief")
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [draft, setDraft] = useState<CampaignDraft | null>(null)

  const [brief, setBrief] = useState({
    product: "", landingUrl: "", goal: "", audience: "", advantages: "",
    weeklyBudgetRub: 7000, regionId: 213,
  })
  const [placements, setPlacements] = useState<{ search: boolean; network: boolean }>({ search: true, network: true })

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const region = REGIONS.find(r => r.id === brief.regionId)
      const res = await fetch("/api/modules/marketing/yandex-direct/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brief, geo: region?.name ?? "вся Россия" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDraft(data.draft)
      setStep("draft")
      toast.success("Черновик готов — проверьте и опубликуйте")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ошибка генерации")
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish = async () => {
    if (!draft) return
    const chosen: Array<"search" | "network"> = []
    if (placements.search) chosen.push("search")
    if (placements.network) chosen.push("network")
    setPublishing(true)
    try {
      const res = await fetch("/api/modules/marketing/yandex-direct/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          landingUrl: brief.landingUrl,
          weeklyBudgetRub: brief.weeklyBudgetRub,
          regionIds: [brief.regionId],
          placements: chosen,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Создано кампаний: ${data.campaigns.length}. Объявления отправлены на модерацию Яндекса.`)
      setStep("brief")
      setDraft(null)
      await reload()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ошибка публикации")
    } finally {
      setPublishing(false)
    }
  }

  if (step === "draft" && draft) {
    return (
      <div className="space-y-5 max-w-3xl">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-600" /> Черновик кампании</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1.5 block">Название кампании</Label>
              <Input value={draft.campaignName} onChange={e => setDraft({ ...draft, campaignName: e.target.value })} className="rounded-xl" />
            </div>
            {draft.strategyComment && (
              <p className="text-sm text-muted-foreground bg-violet-50 dark:bg-violet-950/20 rounded-xl p-3">{draft.strategyComment}</p>
            )}

            <AdsEditor label="Объявления для поиска" ads={draft.searchAds} onChange={ads => setDraft({ ...draft, searchAds: ads })} />
            <AdsEditor label="Объявления для РСЯ" ads={draft.networkAds} onChange={ads => setDraft({ ...draft, networkAds: ads })} />

            <div>
              <Label className="mb-1.5 block">Ключевые фразы ({draft.keywords.length}) — по одной на строку</Label>
              <Textarea
                rows={8} className="rounded-xl font-mono text-sm"
                value={draft.keywords.join("\n")}
                onChange={e => setDraft({ ...draft, keywords: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Минус-слова ({draft.negativeKeywords.length}) — по одному на строку</Label>
              <Textarea
                rows={5} className="rounded-xl font-mono text-sm"
                value={draft.negativeKeywords.join("\n")}
                onChange={e => setDraft({ ...draft, negativeKeywords: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
              />
            </div>

            <div className="flex items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={placements.search} onCheckedChange={v => setPlacements(p => ({ ...p, search: v === true }))} />
                Кампания на поиске
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={placements.network} onCheckedChange={v => setPlacements(p => ({ ...p, network: v === true }))} />
                Кампания в РСЯ
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button className="rounded-xl gap-1.5" onClick={handlePublish} disabled={publishing || (!placements.search && !placements.network)}>
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Опубликовать в Директ
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => setStep("brief")} disabled={publishing}>
                Назад к брифу
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              После публикации объявления уходят на модерацию Яндекса. Показы начнутся после её прохождения
              и при наличии средств на счёте Директа.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Card className="rounded-2xl max-w-2xl">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-600" /> Бриф для AI</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="mb-1.5 block">Что рекламируем *</Label>
          <Textarea
            rows={3} className="rounded-xl" placeholder="Например: монтаж натяжных потолков под ключ в Москве, средний чек 25 000 ₽"
            value={brief.product} onChange={e => setBrief({ ...brief, product: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">Посадочная страница *</Label>
            <Input className="rounded-xl" placeholder="https://…" value={brief.landingUrl}
              onChange={e => setBrief({ ...brief, landingUrl: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Целевое действие</Label>
            <Input className="rounded-xl" placeholder="заявка с сайта" value={brief.goal}
              onChange={e => setBrief({ ...brief, goal: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Регион показа</Label>
            <Select value={String(brief.regionId)} onValueChange={v => setBrief({ ...brief, regionId: Number(v) })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Недельный бюджет, ₽</Label>
            <Input type="number" min={300} className="rounded-xl" value={brief.weeklyBudgetRub}
              onChange={e => setBrief({ ...brief, weeklyBudgetRub: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">Кто клиент (необязательно)</Label>
          <Input className="rounded-xl" placeholder="владельцы квартир в новостройках" value={brief.audience}
            onChange={e => setBrief({ ...brief, audience: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1.5 block">Преимущества / УТП (необязательно)</Label>
          <Input className="rounded-xl" placeholder="монтаж за 1 день, гарантия 10 лет" value={brief.advantages}
            onChange={e => setBrief({ ...brief, advantages: e.target.value })} />
        </div>
        <Button className="rounded-xl gap-1.5" onClick={handleGenerate} disabled={generating || !brief.product.trim() || !brief.landingUrl.trim()}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Сгенерировать кампанию
        </Button>
      </CardContent>
    </Card>
  )
}

function AdsEditor({ label, ads, onChange }: { label: string; ads: AdDraft[]; onChange: (ads: AdDraft[]) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="space-y-3">
        {ads.map((ad, i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2">
            <Input
              className="rounded-lg" maxLength={56} placeholder="Заголовок 1 (до 56 симв.)"
              value={ad.title} onChange={e => onChange(ads.map((a, j) => j === i ? { ...a, title: e.target.value } : a))}
            />
            <Input
              className="rounded-lg" maxLength={30} placeholder="Заголовок 2 (до 30 симв.)"
              value={ad.title2} onChange={e => onChange(ads.map((a, j) => j === i ? { ...a, title2: e.target.value } : a))}
            />
            <Input
              className="rounded-lg" maxLength={81} placeholder="Текст (до 81 симв.)"
              value={ad.text} onChange={e => onChange(ads.map((a, j) => j === i ? { ...a, text: e.target.value } : a))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Настройки агента ──────────────────────────────────────────────────────────

function AgentSettingsForm({ initial }: { initial: AgentSettings }) {
  const [s, setS] = useState<AgentSettings>(initial)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/modules/marketing/yandex-direct/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...s, targetCpa: s.targetCpa ?? 0, maxCpc: s.maxCpc ?? 0, dailyBudgetLimit: s.dailyBudgetLimit ?? 0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setS(data.settings)
      toast.success("Настройки агента сохранены")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl max-w-2xl">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4 text-violet-600" /> Режим работы агента</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border p-4">
          <div>
            <div className="font-medium">Автопилот</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Агент сам применяет безопасные действия: пауза фраз-пожирателей, минус-слова, корректировка
              ставок (в пределах лимитов). Остановку кампаний и бюджеты автопилот всегда оставляет на ваше решение.
            </p>
          </div>
          <Switch checked={s.mode === "autopilot"} onCheckedChange={v => setS({ ...s, mode: v ? "autopilot" : "recommend" })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">Целевой CPA, ₽ (0 = не задан)</Label>
            <Input type="number" min={0} className="rounded-xl" value={s.targetCpa ?? 0}
              onChange={e => setS({ ...s, targetCpa: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Потолок ставки CPC, ₽ (0 = не задан)</Label>
            <Input type="number" min={0} className="rounded-xl" value={s.maxCpc ?? 0}
              onChange={e => setS({ ...s, maxCpc: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Лимит дневного бюджета, ₽ (0 = не задан)</Label>
            <Input type="number" min={0} className="rounded-xl" value={s.dailyBudgetLimit ?? 0}
              onChange={e => setS({ ...s, dailyBudgetLimit: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Мин. кликов для решения по фразе</Label>
            <Input type="number" min={5} max={500} className="rounded-xl" value={s.minClicksForDecision}
              onChange={e => setS({ ...s, minClicksForDecision: Number(e.target.value) || 30 })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Окно анализа, дней</Label>
            <Input type="number" min={3} max={90} className="rounded-xl" value={s.analysisPeriodDays}
              onChange={e => setS({ ...s, analysisPeriodDays: Number(e.target.value) || 14 })} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border p-4">
          <div>
            <div className="font-medium">Разрешить агенту останавливать фразы</div>
            <p className="text-sm text-muted-foreground mt-0.5">Выключите, если хотите подтверждать каждую остановку вручную.</p>
          </div>
          <Switch checked={s.pausedByAgentEnabled} onCheckedChange={v => setS({ ...s, pausedByAgentEnabled: v })} />
        </div>

        <Button className="rounded-xl gap-1.5" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Сохранить
        </Button>
      </CardContent>
    </Card>
  )
}
