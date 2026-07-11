"use client"

// Подключение Bitrix24 — входящий вебхук + токен, статус подключения.
// PATCH /api/modules/ai-rop/settings — общий эндпоинт настроек (rop_settings,
// явные колонки), см. lib/ai-rop/settings.ts::updateRopSettings.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Cloud, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function BitrixConnectionCard({ initialWebhookUrl, initialInboundToken }: { initialWebhookUrl: string; initialInboundToken: string }) {
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl)
  const [inboundToken, setInboundToken] = useState(initialInboundToken)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const r = await fetch("/api/modules/ai-rop/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitrixWebhookUrl: webhookUrl.trim() || null, bitrixInboundToken: inboundToken.trim() || null }),
      })
      const data = await r.json().catch(() => ({}))
      if (data.ok !== false) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500) }
    } finally { setBusy(false) }
  }

  const connected = !!initialWebhookUrl

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Cloud className="size-4 text-violet-600" /> Подключение Bitrix24</CardTitle>
        <CardDescription>Входящий вебхук с правами crm, telephony, user — Битрикс24 → Разработчикам → Другое → Входящий вебхук.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Badge variant="outline" className={connected ? "w-fit gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "w-fit gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"}>
          {connected ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
          {connected ? "Подключено" : "Не подключено"}
        </Badge>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Webhook URL</Label>
          <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://portal.bitrix24.ru/rest/1/xxxxxxxx/" className="font-mono text-xs" />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Inbound-токен (проверка подписи входящих запросов, опционально)</Label>
          <Input value={inboundToken} onChange={(e) => setInboundToken(e.target.value)} className="font-mono text-xs" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
