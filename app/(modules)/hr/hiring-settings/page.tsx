"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Settings, Link2 } from "lucide-react"
import { toast } from "sonner"

// ─── CRM integrations ──────────────────────────────────────────────────────

const CRM_INTEGRATIONS = [
  {
    id: "bitrix24",
    name: "Битрикс24",
    icon: "Б24",
    iconBg: "bg-sky-500",
    desc: "Синхронизация воронки и кандидатов",
    status: "soon" as const,
  },
  {
    id: "amocrm",
    name: "AmoCRM",
    icon: "amo",
    iconBg: "bg-violet-500",
    desc: "Синхронизация воронки и кандидатов",
    status: "soon" as const,
  },
  {
    id: "other",
    name: "Другая CRM",
    icon: "⚙",
    iconBg: "bg-muted",
    desc: "Подключение через API или webhook",
    status: "soon" as const,
  },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function HiringSettingsPage() {
  const [connecting, setConnecting] = useState<string | null>(null)

  const handleConnect = (id: string) => {
    setConnecting(id)
    setTimeout(() => {
      toast("Интеграция будет доступна в ближайшем обновлении")
      setConnecting(null)
    }, 500)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Settings className="size-5 text-muted-foreground" />
                <h1 className="text-xl font-bold tracking-tight">Настройки найма</h1>
              </div>
              <p className="text-sm text-muted-foreground">Общие настройки для всех вакансий</p>
            </div>

            <div className="space-y-6 max-w-3xl">

              {/* ═══ CRM Integrations ═══ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="size-4" />CRM-интеграции
                  </CardTitle>
                  <CardDescription>Синхронизация воронки с CRM</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {CRM_INTEGRATIONS.map(crm => (
                    <div key={crm.id} className="flex items-center gap-4 rounded-lg border p-4">
                      <div className={`flex items-center justify-center size-10 rounded-full ${crm.iconBg} text-white text-xs font-bold shrink-0`}>
                        {crm.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{crm.name}</span>
                          {crm.status === "soon" && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                              Скоро
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{crm.desc}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">Не подключено</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnect(crm.id)}
                          disabled={connecting === crm.id}
                        >
                          {crm.id === "other" ? "Настроить" : "Подключить"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
