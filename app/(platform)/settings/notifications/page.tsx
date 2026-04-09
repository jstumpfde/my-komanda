"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { NotificationSettings } from "@/components/notification-settings"
import { cn } from "@/lib/utils"

export default function NotificationsSettingsPage() {
  const [allEnabled, setAllEnabled] = useState(true)

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground mb-1">Уведомления</h1>
        <p className="text-muted-foreground text-sm">Настройте каналы и события уведомлений по модулям</p>
      </div>

      {/* Global toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border p-4 mb-4">
        <div>
          <p className="text-base font-medium">Все уведомления</p>
          <p className="text-sm text-muted-foreground">Отключить все уведомления по email, Telegram и push</p>
        </div>
        <Switch checked={allEnabled} onCheckedChange={setAllEnabled} />
      </div>

      <div className={cn(!allEnabled && "opacity-50 pointer-events-none select-none")}>
        <NotificationSettings />
      </div>
    </>
  )
}
