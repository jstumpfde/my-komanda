"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Calendar, Clock, Save, Plus, X, Bell, MessageSquare } from "lucide-react"

const WEEKDAYS = [
  { id: "mon", label: "Пн" }, { id: "tue", label: "Вт" }, { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" }, { id: "fri", label: "Пт" }, { id: "sat", label: "Сб" }, { id: "sun", label: "Вс" },
]

export default function ScheduleSettingsPage() {
  const [workDays, setWorkDays] = useState(["mon", "tue", "wed", "thu", "fri"])
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("20:00")
  const [defaultDuration, setDefaultDuration] = useState("45")
  const [buffer, setBuffer] = useState("15")
  const [blockedDates, setBlockedDates] = useState<string[]>(["2026-03-20", "2026-04-01"])
  const [newBlockedDate, setNewBlockedDate] = useState("")

  // Напоминания
  const [remind24h, setRemind24h] = useState(true)
  const [remindMorning, setRemindMorning] = useState(true)
  const [remindBeforeHours, setRemindBeforeHours] = useState("2")
  const [remindNoShow, setRemindNoShow] = useState(false)
  const [noShowDelay, setNoShowDelay] = useState("15")

  const toggleDay = (id: string) => {
    setWorkDays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  const addBlockedDate = () => {
    if (!newBlockedDate || blockedDates.includes(newBlockedDate)) return
    setBlockedDates(prev => [...prev, newBlockedDate])
    setNewBlockedDate("")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-3xl">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Планировщик слотов</h1>
              <p className="text-muted-foreground text-sm">Настройки расписания и напоминаний для интервью</p>
            </div>

            <div className="space-y-6">
              {/* Рабочие дни */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4" /> Рабочее расписание</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Рабочие дни</Label>
                    <div className="flex gap-2">
                      {WEEKDAYS.map(d => (
                        <button
                          key={d.id}
                          className={cn(
                            "w-10 h-10 rounded-lg border text-sm font-medium transition-all",
                            workDays.includes(d.id)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          )}
                          onClick={() => toggleDay(d.id)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Начало рабочего дня</Label>
                      <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Конец рабочего дня</Label>
                      <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Длительность по умолчанию</Label>
                      <Select value={defaultDuration} onValueChange={setDefaultDuration}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 мин</SelectItem>
                          <SelectItem value="45">45 мин</SelectItem>
                          <SelectItem value="60">60 мин</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Буфер между встречами</Label>
                      <Select value={buffer} onValueChange={setBuffer}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 мин</SelectItem>
                          <SelectItem value="5">5 мин</SelectItem>
                          <SelectItem value="10">10 мин</SelectItem>
                          <SelectItem value="15">15 мин</SelectItem>
                          <SelectItem value="30">30 мин</SelectItem>
                          <SelectItem value="60">60 мин</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Недоступные даты */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><X className="w-4 h-4" /> Недоступные даты</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {blockedDates.map(d => (
                      <Badge key={d} variant="outline" className="gap-1.5 text-xs">
                        {new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                        <button onClick={() => setBlockedDates(prev => prev.filter(x => x !== d))}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={newBlockedDate} onChange={e => setNewBlockedDate(e.target.value)} className="h-9 w-48" />
                    <Button variant="outline" size="sm" onClick={addBlockedDate}><Plus className="w-3.5 h-3.5 mr-1" /> Добавить</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Напоминания */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Напоминания кандидатам</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">За 24 часа до встречи</Label>
                      <p className="text-xs text-muted-foreground">Сообщение в канал кандидата</p>
                    </div>
                    <Switch checked={remind24h} onCheckedChange={setRemind24h} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Утреннее напоминание</Label>
                      <p className="text-xs text-muted-foreground">В 10:00 или за настраиваемое время</p>
                    </div>
                    <Switch checked={remindMorning} onCheckedChange={setRemindMorning} />
                  </div>

                  {remindMorning && (
                    <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                      <Label className="text-sm">За сколько часов до встречи</Label>
                      <Select value={remindBeforeHours} onValueChange={setRemindBeforeHours}>
                        <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 час</SelectItem>
                          <SelectItem value="2">2 часа</SelectItem>
                          <SelectItem value="3">3 часа</SelectItem>
                          <SelectItem value="4">4 часа</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Если не пришёл</Label>
                      <p className="text-xs text-muted-foreground">Бот напишет кандидату после неявки</p>
                    </div>
                    <Switch checked={remindNoShow} onCheckedChange={setRemindNoShow} />
                  </div>

                  {remindNoShow && (
                    <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                      <Label className="text-sm">Через сколько минут</Label>
                      <Select value={noShowDelay} onValueChange={setNoShowDelay}>
                        <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 мин</SelectItem>
                          <SelectItem value="30">30 мин</SelectItem>
                          <SelectItem value="60">60 мин</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button className="gap-1.5" onClick={() => toast.success("Настройки расписания сохранены")}><Save className="w-4 h-4" /> Сохранить</Button>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
