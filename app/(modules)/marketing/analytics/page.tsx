"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const funnelSteps = [
  { label: "Охват", value: 156000, display: "156K", pct: 100, convFromPrev: null },
  { label: "Переходы", value: 12400, display: "12.4K", pct: 8.0, convFromPrev: "8%" },
  { label: "Заявки", value: 892, display: "892", pct: 0.57, convFromPrev: "7.2%" },
  { label: "Клиенты", value: 284, display: "284", pct: 0.18, convFromPrev: "31.8%" },
]

const maxFunnel = 156000

const channelData = [
  { channel: "SEO", reach: "72K", leads: 89, conv: "1.2%", cpl: "₽0" },
  { channel: "Соцсети", reach: "34K", leads: 67, conv: "2.0%", cpl: "₽448" },
  { channel: "Контекст", reach: "18K", leads: 54, conv: "3.0%", cpl: "₽926" },
  { channel: "Email", reach: "4.8K", leads: 43, conv: "9.0%", cpl: "₽116" },
  { channel: "Реферал", reach: "27K", leads: 31, conv: "1.1%", cpl: "₽0" },
]

const barColors = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-sky-500",
]

export default function MarketingAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Аналитика маркетинга</h1>
      </div>

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">Эта неделя</TabsTrigger>
          <TabsTrigger value="month">Месяц</TabsTrigger>
          <TabsTrigger value="quarter">Квартал</TabsTrigger>
        </TabsList>

        {["week", "month", "quarter"].map((period) => (
          <TabsContent key={period} value={period} className="mt-4 space-y-6">
            {/* Funnel */}
            <Card>
              <CardHeader>
                <CardTitle>Маркетинговая воронка</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {funnelSteps.map((step, i) => (
                  <div key={step.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="font-medium">{step.label}</span>
                        {step.convFromPrev && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            конв. {step.convFromPrev}
                          </span>
                        )}
                      </div>
                      <span className="font-bold">{step.display}</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className={`h-full rounded-lg flex items-center px-3 ${
                          i === 0 ? "bg-blue-500" :
                          i === 1 ? "bg-purple-500" :
                          i === 2 ? "bg-green-500" :
                          "bg-orange-500"
                        }`}
                        style={{ width: `${(step.value / maxFunnel) * 100}%`, minWidth: "60px" }}
                      >
                        <span className="text-white text-xs font-medium">{step.display}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Channel Comparison */}
            <Card>
              <CardHeader>
                <CardTitle>Сравнение каналов</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Канал</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Охват</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Лиды</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Конверсия</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Стоимость лида</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Доля лидов</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelData.map((row, i) => {
                        const pct = Math.round((row.leads / channelData.reduce((s, r) => s + r.leads, 0)) * 100)
                        return (
                          <tr key={row.channel} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3 px-4 font-medium">{row.channel}</td>
                            <td className="py-3 px-4 text-right text-muted-foreground">{row.reach}</td>
                            <td className="py-3 px-4 text-right font-semibold">{row.leads}</td>
                            <td className="py-3 px-4 text-right text-green-600 font-medium">{row.conv}</td>
                            <td className="py-3 px-4 text-right text-muted-foreground">{row.cpl}</td>
                            <td className="py-3 px-4 w-36">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${barColors[i]} rounded-full`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
