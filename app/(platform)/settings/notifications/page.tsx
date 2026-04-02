"use client"

import { NotificationSettings } from "@/components/notification-settings"

export default function NotificationsSettingsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground mb-1">Уведомления</h1>
        <p className="text-muted-foreground text-sm">Настройте каналы и события уведомлений по модулям</p>
      </div>
      <NotificationSettings />
    </>
  )
}
