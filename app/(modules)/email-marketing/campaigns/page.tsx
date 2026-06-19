"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Send, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react"

export default function EmailMarketingCampaignsPage() {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/modules/email-marketing/settings")
      .then((r) => r.json())
      .then((d) => setConnected(!!d.connected))
      .catch(() => setConnected(false))
  }, [])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Send className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Емайл маркетинг — Рассылки</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Кампании по базе компаний: цепочки писем, ответы, тёплые лиды.</p>
            </div>

            {/* Connection status */}
            <div className="rounded-xl border border-border shadow-sm p-5 bg-card mb-4 max-w-xl">
              {connected === null ? (
                <span className="text-sm text-muted-foreground">Проверка подключения…</span>
              ) : connected ? (
                <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Подключение к сервису рассылки активно.</div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Сначала подключите сервис рассылки в
                  <Link href="/email-marketing/settings" className="text-violet-600 inline-flex items-center gap-1 font-medium">Настройках <ArrowRight className="w-3.5 h-3.5" /></Link>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-dashed border-border p-8 bg-card/50 max-w-xl text-center">
              <Send className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <p className="text-sm font-medium">Кампании — следующий этап</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Скоро: выбор сегмента из базы → заливка лидов → цепочка писем (несколько офферов под разными углами) → отправка и возврат ответов/тёплых лидов.
                Фундамент (база с дедупом по ИНН) уже работает на вкладке «База».
              </p>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
