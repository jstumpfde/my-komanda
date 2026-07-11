"use client"

// Автоимпорт новых звонков — крон /api/cron/ai-rop-import (*/5), тумблер
// пишет в rop_settings.settings.autoImportEnabled.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

export function AutoImportCard({ initialEnabled, lastAt }: { initialEnabled: boolean; lastAt: string | null }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function toggle(v: boolean) {
    setEnabled(v); setBusy(true)
    try {
      await fetch("/api/modules/ai-rop/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: v }),
      })
      router.refresh()
    } finally { setBusy(false) }
  }

  async function runNow() {
    setBusy(true)
    try {
      await fetch("/api/modules/ai-rop/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runNow: true }),
      })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><RefreshCw className="size-4 text-violet-600" /> Автоимпорт</CardTitle>
        <CardDescription>Крон проверяет Bitrix каждые 5 минут и подтягивает новые звонки/активности автоматически.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">Последний успешный запуск: <b>{lastAt ? new Date(lastAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "ещё не запускался"}</b></div>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={runNow} disabled={busy || !enabled} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Запустить сейчас
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
