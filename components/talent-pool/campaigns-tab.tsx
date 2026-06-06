"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Rocket, Flame, TrendingUp, Plus, Mail, Send, Pause, Play, Trash2, Loader2 } from "lucide-react"

interface Campaign {
  id: string
  name: string
  status: "active" | "paused"
  channel: "email" | "telegram" | "both"
  sentCount: number
  openedCount: number
  repliedCount: number
}

const CHANNEL_LABEL: Record<Campaign["channel"], string> = {
  email: "Email", telegram: "Telegram", both: "Email + Telegram",
}
const FUNNEL_LABELS = ["Отправлено", "Открыто", "Ответили"]

export function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [kpi, setKpi] = useState({ active: 0, warming: 0, conversion: 0 })
  const [loading, setLoading] = useState(true)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [form, setForm] = useState<{ name: string; channel: Campaign["channel"] }>({ name: "", channel: "email" })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/talent-pool/campaigns")
      const data = await res.json() as { campaigns?: Campaign[]; kpi?: typeof kpi }
      if (data.campaigns) setCampaigns(data.campaigns)
      if (data.kpi) setKpi(data.kpi)
    } catch { /* пусто */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/talent-pool/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), channel: form.channel }),
      })
      if (!res.ok) { toast.error("Не удалось создать кампанию"); return }
      toast.success("Кампания создана")
      setForm({ name: "", channel: "email" })
      setLaunchOpen(false)
      await load()
    } finally { setSaving(false) }
  }

  const toggleStatus = async (c: Campaign) => {
    const next = c.status === "active" ? "paused" : "active"
    const res = await fetch(`/api/modules/hr/talent-pool/campaigns/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) { toast.error("Не удалось обновить"); return }
    toast.success(next === "paused" ? "Кампания приостановлена" : "Кампания возобновлена")
    await load()
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/modules/hr/talent-pool/campaigns/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Не удалось удалить"); return }
    setCampaigns(prev => prev.filter(c => c.id !== id))
    toast.success("Кампания удалена")
  }

  const kpiCards = [
    { label: "Активных кампаний", value: String(kpi.active), icon: Rocket, color: "text-blue-600" },
    { label: "В прогреве", value: String(kpi.warming), icon: Flame, color: "text-orange-600" },
    { label: "Конверсия", value: `${kpi.conversion}%`, icon: TrendingUp, color: "text-emerald-600" },
  ]

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <k.icon className={cn("w-4 h-4", k.color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1", k.color)}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          ℹ️ Отправка касаний кандидатам — скоро. Сейчас кампании можно создавать и вести.
        </p>
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700" onClick={() => setLaunchOpen(true)}>
          <Plus className="w-3.5 h-3.5" />Создать кампанию
        </Button>
      </div>

      {/* Карточки */}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Пока нет кампаний. Создайте первую кампанию прогрева.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {campaigns.map((camp) => {
            const funnel = [camp.sentCount, camp.openedCount, camp.repliedCount]
            const conversion = camp.sentCount > 0 ? Math.round((camp.repliedCount / camp.sentCount) * 100) : 0
            const ChannelIcon = camp.channel === "telegram" ? Send : Mail
            return (
              <Card key={camp.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm truncate">{camp.name}</CardTitle>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0",
                      camp.status === "active"
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                        : "bg-amber-500/10 text-amber-700 border-amber-200")}>
                      {camp.status === "active" ? "Активна" : "Приостановлена"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ChannelIcon className="w-3.5 h-3.5" />
                    <span>{CHANNEL_LABEL[camp.channel]}</span>
                  </div>
                  <div className="space-y-2">
                    {funnel.map((val, i) => {
                      const maxVal = funnel[0]
                      const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-20 shrink-0">{FUNNEL_LABELS[i]}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold w-4 text-right">{val}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">Конверсия</span>
                    <Badge variant="secondary" className="font-bold text-xs">{conversion}%</Badge>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => toggleStatus(camp)}>
                      {camp.status === "active" ? <><Pause className="w-3 h-3" />Пауза</> : <><Play className="w-3 h-3" />Возобновить</>}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить" onClick={() => remove(camp.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Создание кампании */}
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Создать кампанию прогрева</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Название *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Backend-разработчики Q2" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Канал</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["email", "telegram", "both"] as const).map(ch => (
                  <button key={ch} type="button"
                    onClick={() => setForm({ ...form, channel: ch })}
                    className={cn("text-xs h-8 rounded-md border transition-colors",
                      form.channel === ch ? "border-purple-500 bg-purple-500/10 text-purple-700 font-medium" : "hover:bg-muted/50")}>
                    {CHANNEL_LABEL[ch]}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Кампания создаётся со счётчиками 0. Автоматическая отправка касаний кандидатам появится отдельной кнопкой.
            </p>
            <Button onClick={handleCreate} disabled={!form.name.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Создать"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
