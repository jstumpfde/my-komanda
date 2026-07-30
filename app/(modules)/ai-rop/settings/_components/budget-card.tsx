"use client"

// Бюджет AI на обработку — лимиты по месяцу (rop_settings.settings.budget),
// POST через отдельный эндпоинт /api/modules/ai-rop/budget (jsonb-патч, не явные колонки).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Coins } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

export interface BudgetInitial {
  maxAnthropicTokens: number | null
  maxOpenaiSeconds: number | null
  maxOpenaiChatTokens: number | null
  maxYandexSttSeconds: number | null
  action: "stop" | "notify_only"
}
export interface UsageInitial {
  anthropicTokens: number
  openaiSeconds: number
  openaiChatTokens: number
  yandexSttSeconds: number
  periodStart: string
}

function numToStr(n: number | null): string { return n == null ? "" : String(n) }

export function BudgetCard({ initial, usage }: { initial: BudgetInitial; usage: UsageInitial }) {
  const [maxAnthropicTokens, setMaxAnthropicTokens] = useState(numToStr(initial.maxAnthropicTokens))
  const [maxYandexSttSeconds, setMaxYandexSttSeconds] = useState(numToStr(initial.maxYandexSttSeconds))
  const [maxOpenaiSeconds, setMaxOpenaiSeconds] = useState(numToStr(initial.maxOpenaiSeconds))
  const [maxOpenaiChatTokens, setMaxOpenaiChatTokens] = useState(numToStr(initial.maxOpenaiChatTokens))
  const [action, setAction] = useState(initial.action)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      await fetch("/api/modules/ai-rop/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxAnthropicTokens: maxAnthropicTokens ? Number(maxAnthropicTokens) : null,
          maxYandexSttSeconds: maxYandexSttSeconds ? Number(maxYandexSttSeconds) : null,
          maxOpenaiSeconds: maxOpenaiSeconds ? Number(maxOpenaiSeconds) : null,
          maxOpenaiChatTokens: maxOpenaiChatTokens ? Number(maxOpenaiChatTokens) : null,
          action,
        }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Coins className="size-4 text-violet-600" /> Бюджет AI</CardTitle>
        <CardDescription>Лимиты расхода за календарный месяц. Пусто = без лимита.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-xs sm:grid-cols-4">
          <div><div className="text-muted-foreground">Claude токены</div><b>{usage.anthropicTokens.toLocaleString("ru-RU")}</b></div>
          <div><div className="text-muted-foreground">Yandex STT, сек</div><b>{usage.yandexSttSeconds.toLocaleString("ru-RU")}</b></div>
          <div><div className="text-muted-foreground">OpenAI STT, сек</div><b>{usage.openaiSeconds.toLocaleString("ru-RU")}</b></div>
          <div><div className="text-muted-foreground">OpenAI токены</div><b>{usage.openaiChatTokens.toLocaleString("ru-RU")}</b></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">Лимит Claude-токенов/мес</Label><Input type="number" value={maxAnthropicTokens} onChange={(e) => setMaxAnthropicTokens(e.target.value)} placeholder="без лимита" /></div>
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">Лимит Yandex STT сек/мес</Label><Input type="number" value={maxYandexSttSeconds} onChange={(e) => setMaxYandexSttSeconds(e.target.value)} placeholder="без лимита" /></div>
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">Лимит OpenAI STT сек/мес</Label><Input type="number" value={maxOpenaiSeconds} onChange={(e) => setMaxOpenaiSeconds(e.target.value)} placeholder="без лимита" /></div>
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">Лимит OpenAI токенов/мес</Label><Input type="number" value={maxOpenaiChatTokens} onChange={(e) => setMaxOpenaiChatTokens(e.target.value)} placeholder="без лимита" /></div>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">При превышении</Label>
          <Select value={action} onValueChange={(v) => setAction(v as typeof action)}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="stop">Остановить обработку</SelectItem><SelectItem value="notify_only">Только уведомить</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
