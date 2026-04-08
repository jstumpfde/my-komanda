"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Clock, Save } from "lucide-react"

const WEEKDAYS = [
  { id: "mon", label: "Пн" }, { id: "tue", label: "Вт" }, { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" }, { id: "fri", label: "Пт" }, { id: "sat", label: "Сб" }, { id: "sun", label: "Вс" },
]

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)
const HALF_HOURS = HOURS.flatMap((h) => [h, h.replace(":00", ":30")])

interface DaySchedule { enabled: boolean; from: string; to: string }

const DEFAULT: DaySchedule[] = [
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" },
  { enabled: false, from: "10:00", to: "15:00" },
  { enabled: false, from: "10:00", to: "15:00" },
]

export default function HrSchedulePage() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT)

  const update = (i: number, patch: Partial<DaySchedule>) =>
    setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))

  const handleSave = () => toast.success("Расписание сохранено")

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-foreground mb-1">Расписание</h1>
              <p className="text-sm text-muted-foreground">Рабочие часы для интервью и встреч с кандидатами</p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  Рабочие дни и часы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {WEEKDAYS.map((day, i) => (
                  <div key={day.id} className={cn(
                    "flex items-center gap-4 py-2.5 px-3 rounded-lg",
                    schedule[i].enabled ? "bg-background" : "bg-muted/30",
                  )}>
                    <Switch checked={schedule[i].enabled} onCheckedChange={(v) => update(i, { enabled: v })} />
                    <span className={cn("w-6 text-sm font-medium", !schedule[i].enabled && "text-muted-foreground")}>
                      {day.label}
                    </span>
                    {schedule[i].enabled ? (
                      <div className="flex items-center gap-2">
                        <Select value={schedule[i].from} onValueChange={(v) => update(i, { from: v })}>
                          <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                        <span className="text-muted-foreground">—</span>
                        <Select value={schedule[i].to} onValueChange={(v) => update(i, { to: v })}>
                          <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{HALF_HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Выходной</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
              <Button className="gap-2" onClick={handleSave}>
                <Save className="size-4" />Сохранить расписание
              </Button>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
