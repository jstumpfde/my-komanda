"use client"

import { useState, useEffect } from "react"
import { Bell } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { NotificationSettings } from "@/components/notification-settings"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Мастер-тумблер «Все уведомления» хранится отдельной служебной строкой в
// notification_preferences (module=__system, category=all_enabled) — чтобы
// переживать перезагрузку. Раньше это был локальный useState и при обновлении
// всегда возвращался в «вкл».
const SYS_MODULE = "__system"
const SYS_CATEGORY = "all_enabled"

export default function NotificationsSettingsPage() {
  // Дефолт — ВЫКЛ: уведомления включаются пользователем осознанно.
  const [allEnabled, setAllEnabled] = useState(false)

  useEffect(() => {
    fetch("/api/settings/notification-preferences")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const row = Array.isArray(data.prefs)
          ? data.prefs.find((p: { module: string; category: string }) =>
              p.module === SYS_MODULE && p.category === SYS_CATEGORY)
          : null
        if (row) setAllEnabled(!!row.channelEmail)
      })
      .catch(() => {})
  }, [])

  const toggleAll = async (v: boolean) => {
    setAllEnabled(v) // оптимистично
    try {
      const res = await fetch("/api/settings/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: [{
          module: SYS_MODULE, category: SYS_CATEGORY,
          channelEmail: v, channelTelegram: false, channelPush: false, channelWeb: true,
        }] }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setAllEnabled(!v) // откат — на сервере не сохранилось
      toast.error("Не удалось сохранить")
    }
  }

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="h-5 w-5 text-violet-600" />
          <h1 className="text-lg font-semibold text-foreground">Уведомления</h1>
        </div>
        <p className="text-muted-foreground text-sm">Настройте каналы и события уведомлений по модулям</p>
      </div>

      {/* Global toggle — сохраняется сразу при переключении */}
      <Card className="mb-4">
        <CardContent className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-base font-medium">Все уведомления</p>
            <p className="text-sm text-muted-foreground">Отключить все уведомления по email, Telegram и push</p>
          </div>
          <Switch checked={allEnabled} onCheckedChange={toggleAll} />
        </CardContent>
      </Card>

      <div className={cn(!allEnabled && "opacity-50 pointer-events-none select-none")}>
        <NotificationSettings />
      </div>
    </>
  )
}
