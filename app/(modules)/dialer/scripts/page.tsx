"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Plus, Play, Bell, ClipboardList, RefreshCw, PhoneOutgoing } from "lucide-react"
import { CALL_SCRIPTS, SCRIPT_TYPE_MAP, SCRIPT_STATUSES, formatDuration } from "@/lib/dialer/demo-data"

const TYPE_ICONS: Record<string, typeof Bell> = { Bell, ClipboardList, RefreshCw, PhoneOutgoing }

const EXAMPLE_PHRASES: Record<string, string> = {
  "1": "Здравствуйте! Напоминаем, что у вас завтра запись на 14:00. Подтвердите, пожалуйста.",
  "2": "Добрый день! Вы недавно посещали нашу клинику. Оцените, пожалуйста, качество обслуживания от 1 до 10.",
  "3": "Здравствуйте! Мы заметили, что вы давно не пользовались нашими услугами. У нас есть специальное предложение для вас.",
  "4": "Добрый день! Меня зовут Ненси, я AI-ассистент компании. Мы предлагаем решение для автоматизации...",
  "5": "Добрый день! Напоминаем, что срок оплаты по счёту истекает через 3 дня.",
}

export default function DialerScriptsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Скрипты обзвона</h1>
                <p className="text-sm text-muted-foreground mt-1">Шаблоны разговоров для AI-агента</p>
              </div>
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" className="rounded-xl gap-1.5" disabled>
                        <Play className="w-4 h-4" />
                        Запустить обзвон
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Скоро</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button className="rounded-xl gap-1.5" disabled>
                        <Plus className="w-4 h-4" />
                        Новый скрипт
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Скоро</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CALL_SCRIPTS.map((script) => {
                const tp = SCRIPT_TYPE_MAP[script.type]
                const st = SCRIPT_STATUSES[script.status]
                const ScriptIcon = TYPE_ICONS[tp?.icon || "Bell"] || Bell
                const answerPct = Math.round((script.answered / script.calls) * 100)
                const successPct = Math.round((script.success / script.calls) * 100)
                return (
                  <div
                    key={script.id}
                    className="rounded-xl shadow-sm border border-border/60 bg-card p-6 hover:shadow-md transition-all duration-200"
                    style={{ borderLeft: `4px solid ${tp?.color || "#666"}` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${tp?.color}20` }}>
                          <ScriptIcon className="w-5 h-5" style={{ color: tp?.color }} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{script.name}</h3>
                          <span className="text-xs text-muted-foreground">{tp?.label} · ср. {formatDuration(script.avgDuration)}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className={`text-xs border-0 ${st?.cls}`}>{st?.label}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center mb-4">
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Звонков</p>
                        <p className="text-lg font-bold">{script.calls}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Дозвон</p>
                        <p className="text-lg font-bold">{answerPct}%</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Успех</p>
                        <p className="text-lg font-bold">{successPct}%</p>
                      </div>
                    </div>
                    {EXAMPLE_PHRASES[script.id] && (
                      <div className="rounded-lg bg-muted/30 border border-border/40 p-3">
                        <p className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider mb-1">Первая фраза</p>
                        <p className="text-xs text-muted-foreground italic leading-relaxed">"{EXAMPLE_PHRASES[script.id]}"</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
