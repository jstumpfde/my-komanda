"use client"

// Модель AI для анализа звонков (rop_settings.analysisModel; null = дефолт платформы).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bot } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

const MODEL_OPTIONS = [
  { value: "__default__", label: "По умолчанию платформы" },
  { value: "anthropic:claude-sonnet-4-6", label: "Claude Sonnet 4.6 — лучшее качество" },
  { value: "anthropic:claude-opus-4-5", label: "Claude Opus 4.5 — максимальная глубина" },
  { value: "anthropic:claude-haiku-4-5", label: "Claude Haiku 4.5 — быстро и дёшево" },
]

export function ModelCard({ initial }: { initial: string | null }) {
  const [model, setModel] = useState(initial ?? "__default__")
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      await fetch("/api/modules/ai-rop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisModel: model === "__default__" ? null : model }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Bot className="size-4 text-violet-600" /> Модель AI</CardTitle>
        <CardDescription>Модель для разбора звонков (оценка, чек-лист, тональность, coaching). Влияет на качество и стоимость.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>{MODEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
