"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, TrendingUp, Target, Wallet } from "lucide-react"

const campaigns = [
  {
    id: 1,
    name: "Весенний запуск — HR модуль",
    channel: "Яндекс",
    channelColor: "bg-red-100 text-red-700",
    budget: 45000,
    spent: 38200,
    leads: 84,
    cpa: 455,
    status: "Активна",
    dateStart: "1 мар",
    dateEnd: "31 мар",
  },
  {
    id: 2,
    name: "Брендинг — охватная кампания",
    channel: "ВКонтакте",
    channelColor: "bg-blue-100 text-blue-700",
    budget: 30000,
    spent: 30000,
    leads: 56,
    cpa: 536,
    status: "Завершена",
    dateStart: "1 фев",
    dateEnd: "28 фев",
  },
  {
    id: 3,
    name: "Google Ads — регионы",
    channel: "Google",
    channelColor: "bg-green-100 text-green-700",
    budget: 60000,
    spent: 41500,
    leads: 112,
    cpa: 370,
    status: "Активна",
    dateStart: "15 мар",
    dateEnd: "15 апр",
  },
  {
    id: 4,
    name: "Ретаргетинг — сайт",
    channel: "Яндекс",
    channelColor: "bg-red-100 text-red-700",
    budget: 20000,
    spent: 0,
    leads: 0,
    cpa: 0,
    status: "Черновик",
    dateStart: "—",
    dateEnd: "—",
  },
  {
    id: 5,
    name: "Таргет апрель — директора",
    channel: "ВКонтакте",
    channelColor: "bg-blue-100 text-blue-700",
    budget: 25000,
    spent: 0,
    leads: 0,
    cpa: 0,
    status: "Черновик",
    dateStart: "1 апр",
    dateEnd: "30 апр",
  },
  {
    id: 6,
    name: "Продвижение кейсов Q1",
    channel: "Google",
    channelColor: "bg-green-100 text-green-700",
    budget: 35000,
    spent: 35000,
    leads: 67,
    cpa: 522,
    status: "Завершена",
    dateStart: "1 янв",
    dateEnd: "31 янв",
  },
]

const statusColors: Record<string, string> = {
  "Активна": "bg-green-100 text-green-700",
  "Завершена": "bg-gray-100 text-gray-700",
  "Черновик": "bg-yellow-100 text-yellow-700",
  "Пауза": "bg-orange-100 text-orange-700",
}

function CampaignCard({ campaign }: { campaign: typeof campaigns[0] }) {
  const pct = campaign.budget > 0 ? Math.round((campaign.spent / campaign.budget) * 100) : 0
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="font-semibold text-sm leading-tight">{campaign.name}</p>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${campaign.channelColor}`}>
                {campaign.channel}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                {campaign.status}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Бюджет</p>
            <p className="font-semibold">₽{campaign.budget.toLocaleString("ru")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Потрачено</p>
            <p className="font-semibold">₽{campaign.spent.toLocaleString("ru")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Лидов</p>
            <p className="font-semibold">{campaign.leads}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">CPA</p>
            <p className="font-semibold">{campaign.cpa > 0 ? `₽${campaign.cpa}` : "—"}</p>
          </div>
        </div>

        {campaign.budget > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Расход бюджета</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{campaign.dateStart} — {campaign.dateEnd}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CampaignsPage() {
  const active = campaigns.filter((c) => c.status === "Активна")
  const finished = campaigns.filter((c) => c.status === "Завершена")
  const drafts = campaigns.filter((c) => c.status === "Черновик")

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Рекламные кампании</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Новая кампания
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Все ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="active">Активные ({active.length})</TabsTrigger>
          <TabsTrigger value="finished">Завершённые ({finished.length})</TabsTrigger>
          <TabsTrigger value="drafts">Черновики ({drafts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {active.map((c) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="finished" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {finished.map((c) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {drafts.map((c) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
