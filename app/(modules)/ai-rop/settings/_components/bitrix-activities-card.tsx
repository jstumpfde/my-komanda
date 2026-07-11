"use client"

// Импорт email + Open Lines чатов из Bitrix (TYPE_ID=4 письма, WhatsApp/
// Telegram/VK-чаты — «активности»), разбираются через AI и подмешиваются в
// профиль заказчика 360. «Импортировать сейчас» — инкрементально с последней
// метки (settings.activitiesLastFetchedAt); чекбокс «вся история» шлёт
// since=null — POST /api/modules/ai-rop/bitrix-activities трактует явный null
// как «забыть метку, тянуть с начала» (см. докблок роута).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface FetchResult { totalFetched: number; inserted: number; skipped: number; errors: number }

export function BitrixActivitiesCard({ initialLastFetched }: { initialLastFetched: string | null }) {
  const router = useRouter()
  const [lastFetched, setLastFetched] = useState(initialLastFetched)
  const [fullHistory, setFullHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FetchResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    setBusy(true); setResult(null); setErr(null)
    try {
      const body: Record<string, unknown> = fullHistory ? { since: null } : {}
      const r = await fetch("/api/modules/ai-rop/bitrix-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error || "unknown")
      setResult(data as FetchResult)
      setLastFetched(new Date().toISOString())
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Mail className="size-4 text-violet-600" /> Импорт email и чатов</CardTitle>
        <CardDescription>Bitrix хранит письма и чаты в Open Lines (WhatsApp, Telegram, VK) как «активности» — импорт тянет их и разбирает через AI для профиля заказчика 360.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-sm">
          Последний импорт: <b>{lastFetched ? new Date(lastFetched).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "ещё не запускался"}</b>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="rop-activities-full-history" checked={fullHistory} onCheckedChange={(v) => setFullHistory(!!v)} />
          <Label htmlFor="rop-activities-full-history" className="text-xs font-normal text-muted-foreground">Вся история (полный фетч с начала, может занять несколько минут)</Label>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={run} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Импортировать сейчас
          </Button>
        </div>
        {result && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            Обработано: <b>{result.totalFetched}</b>. Добавлено: <b>{result.inserted}</b> (дублей: {result.skipped}, ошибок: {result.errors}). Разбор через AI появится в звонках/клиентах через 1-2 минуты.
          </div>
        )}
        {err && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Ошибка: {err}</div>}
      </CardContent>
    </Card>
  )
}
