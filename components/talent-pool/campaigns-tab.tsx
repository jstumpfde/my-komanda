"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Rocket, Users, Flame, TrendingUp, Plus, Mail, Send, Pause } from "lucide-react"

// ─── Mock data ─────────────────────────────────────────
const CAMPAIGNS_KPI = [
  { label: "Активных кампаний", value: "2", icon: Rocket, color: "text-blue-600" },
  { label: "В прогреве", value: "8", icon: Flame, color: "text-orange-600" },
  { label: "Конверсия", value: "34%", icon: TrendingUp, color: "text-emerald-600" },
]

interface CampaignCard {
  id: string
  name: string
  status: "active" | "paused"
  channel: string
  channelIcon: typeof Mail
  funnel: number[]
  funnelLabels: string[]
  conversion: string
}

const CAMPAIGNS: CampaignCard[] = [
  {
    id: "c1",
    name: "Backend-разработчики Q2",
    status: "active",
    channel: "Email",
    channelIcon: Mail,
    funnel: [5, 4, 2],
    funnelLabels: ["Отправлено", "Открыто", "Ответили"],
    conversion: "40%",
  },
  {
    id: "c2",
    name: "HR-специалисты весна",
    status: "active",
    channel: "Telegram",
    channelIcon: Send,
    funnel: [3, 3, 1],
    funnelLabels: ["Отправлено", "Открыто", "Ответили"],
    conversion: "33%",
  },
  {
    id: "c3",
    name: "DevOps ретаргет",
    status: "paused",
    channel: "Email + Telegram",
    channelIcon: Mail,
    funnel: [4, 2, 0],
    funnelLabels: ["Отправлено", "Открыто", "Ответили"],
    conversion: "0%",
  },
]

export function CampaignsTab() {
  const [launchOpen, setLaunchOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {CAMPAIGNS_KPI.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={cn("w-4 h-4", kpi.color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Кнопка запуска */}
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700" onClick={() => setLaunchOpen(true)}>
          <Plus className="w-3.5 h-3.5" />Запустить кампанию
        </Button>
      </div>

      {/* Карточки кампаний */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {CAMPAIGNS.map((camp) => (
          <Card key={camp.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{camp.name}</CardTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    camp.status === "active"
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                      : "bg-amber-500/10 text-amber-700 border-amber-200"
                  )}
                >
                  {camp.status === "active" ? "Активна" : "Приостановлена"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <camp.channelIcon className="w-3.5 h-3.5" />
                <span>{camp.channel}</span>
              </div>

              {/* Воронка */}
              <div className="space-y-2">
                {camp.funnel.map((val, i) => {
                  const maxVal = camp.funnel[0]
                  const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-20 shrink-0">{camp.funnelLabels[i]}</span>
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
                <Badge variant="secondary" className="font-bold text-xs">{camp.conversion}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Модалка-заглушка */}
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Запуск кампании</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center space-y-3">
            <Rocket className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">
              Конструктор кампаний в разработке.
            </p>
            <p className="text-xs text-muted-foreground">
              Скоро здесь можно будет настраивать серию касаний, выбирать каналы и запускать автоматические кампании прогрева.
            </p>
            <Button variant="outline" size="sm" onClick={() => setLaunchOpen(false)}>
              Понятно
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
