"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings, Clock, CalendarDays, Bell, Check, Lock } from "lucide-react"
import { BOOKING_MODES } from "@/lib/booking/constants"

export default function BookingSettingsPage() {
  const [gridStep, setGridStep] = useState("30")
  const [bookAhead, setBookAhead] = useState("14")

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Настройки бронирования</h1>
              <p className="text-sm text-muted-foreground mt-1">Режим работы, сетка и уведомления</p>
            </div>

            <div className="space-y-6">
              {/* Режим бронирования */}
              <div>
                <h2 className="text-base font-semibold mb-3">Режим бронирования</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {BOOKING_MODES.map((mode) => (
                    <div
                      key={mode.id}
                      className={`rounded-xl border-2 p-5 transition-all ${
                        mode.active
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/60 bg-muted/20 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{mode.label}</span>
                        {mode.active ? (
                          <Badge className="bg-primary text-primary-foreground gap-1">
                            <Check className="w-3 h-3" />
                            Активен
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="w-3 h-3" />
                            Скоро
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{mode.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Шаг сетки */}
              <div className="rounded-xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Шаг сетки</h2>
                </div>
                <div className="max-w-xs">
                  <Select value={gridStep} onValueChange={setGridStep}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 минут</SelectItem>
                      <SelectItem value="30">30 минут</SelectItem>
                      <SelectItem value="60">60 минут</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">Минимальный шаг между слотами в календаре</p>
                </div>
              </div>

              {/* Горизонт бронирования */}
              <div className="rounded-xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Горизонт бронирования</h2>
                </div>
                <div className="max-w-xs">
                  <Select value={bookAhead} onValueChange={setBookAhead}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 день</SelectItem>
                      <SelectItem value="3">3 дня</SelectItem>
                      <SelectItem value="7">7 дней</SelectItem>
                      <SelectItem value="14">14 дней</SelectItem>
                      <SelectItem value="30">30 дней</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">За сколько дней вперёд можно бронировать</p>
                </div>
              </div>

              {/* Уведомления */}
              <div className="rounded-xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Уведомления</h2>
                </div>
                <p className="text-sm text-muted-foreground">Email и Telegram уведомления о новых записях будут доступны в следующем обновлении.</p>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
