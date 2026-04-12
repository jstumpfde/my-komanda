"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Plus, Pencil, MessageSquare, HelpCircle, Presentation, ShieldCheck, Target, Database, Heart } from "lucide-react"
import { QC_CHECKLIST } from "@/lib/qc/demo-data"

const CRITERIA_ICONS: Record<string, typeof MessageSquare> = {
  greeting: MessageSquare,
  needs: HelpCircle,
  presentation: Presentation,
  objections: ShieldCheck,
  closing: Target,
  crm: Database,
  tone: Heart,
}

export default function QCChecklistsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Чек-листы оценки</h1>
                <p className="text-sm text-muted-foreground mt-1">Критерии для оценки звонков менеджеров</p>
              </div>
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" className="rounded-xl gap-1.5" disabled>
                        <Pencil className="w-4 h-4" />
                        Редактировать
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
                        Создать чек-лист
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Скоро</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {QC_CHECKLIST.map((item) => {
                const CIcon = CRITERIA_ICONS[item.id] || MessageSquare
                return (
                  <div key={item.id} className="rounded-xl shadow-sm border border-border/60 bg-card p-6 hover:shadow-md transition-all duration-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        <CIcon className="w-5 h-5 text-indigo-500" />
                      </div>
                      <Badge variant="secondary" className="text-xs font-bold">{item.weight}%</Badge>
                    </div>
                    <h3 className="font-semibold text-base mb-1">{item.label}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${item.weight}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 rounded-xl border border-border/60 bg-muted/20 p-5 text-center">
              <p className="text-sm text-muted-foreground">Суммарный вес критериев: <span className="font-bold">{QC_CHECKLIST.reduce((s, c) => s + c.weight, 0)}%</span></p>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
