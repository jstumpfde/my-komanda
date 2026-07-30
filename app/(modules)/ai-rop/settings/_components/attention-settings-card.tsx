"use client"

// Пороги экрана «Точки внимания» (lib/ai-rop/attention.ts): сколько дней
// тишины по клиенту с открытой сделкой/лидом считать «сделка молчит», и
// с какой оценки звонок по важному клиенту считать слабым.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Compass } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface AttentionSettingsInitial {
  silenceDays: number
  weakCallScoreThreshold: number
}

export function AttentionSettingsCard({ initial }: { initial: AttentionSettingsInitial }) {
  const [silenceDays, setSilenceDays] = useState(String(initial.silenceDays))
  const [weakScore, setWeakScore] = useState(String(initial.weakCallScoreThreshold))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const sd = Number(silenceDays)
      const ws = Number(weakScore)
      await fetch("/api/modules/ai-rop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attention: {
            silenceDays: Number.isFinite(sd) && sd > 0 ? Math.trunc(sd) : undefined,
            weakCallScoreThreshold: Number.isFinite(ws) && ws >= 0 ? ws : undefined,
          },
        }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Compass className="size-4 text-violet-600" /> Точки внимания</CardTitle>
        <CardDescription>Пороги для дашборда «Точки внимания» — забытые обещания, замолчавшие сделки, слабые звонки по важным клиентам.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Тишина по сделке, дней</Label>
            <Input type="number" min={1} value={silenceDays} onChange={(e) => setSilenceDays(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Слабый звонок — оценка ≤, из 10</Label>
            <Input type="number" min={0} max={10} step={0.5} value={weakScore} onChange={(e) => setWeakScore(e.target.value)} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          «Тишина по сделке» — с какого дня без касаний клиент с открытой сделкой/лидом попадает в «Точки внимания». «Слабый звонок» — оценка звонка по клиенту с привязанной сделкой/лидом, ниже которой стоит обратить внимание.
        </div>
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
